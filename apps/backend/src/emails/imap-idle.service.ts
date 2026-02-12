import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Imap from 'imap';
import { EmailsService } from './emails.service';
import { EmailEventsService } from './email-events.service';

/**
 * IMAP IDLE Watcher — Persistent connection to the IMAP server.
 * Watches the INBOX for FLAGGED emails using IMAP IDLE + polling.
 * When a user flags an email in Outlook (⚑) → auto-fetch → auto-process with AI.
 * 
 * Uses a hybrid approach:
 * - IMAP IDLE 'update' event detects flag changes in real-time (when supported by server)
 * - Polling every 30s as fallback (Exchange/Outlook IMAP doesn't always push flag changes via IDLE)
 * 
 * Lifecycle:
 * 1. On module init → connect + open SOURCE_FOLDER + start IDLE + start polling
 * 2. On flag change / poll → fetch flagged emails → emit SSE 'new-emails' → start AI processing
 * 3. On connection loss → exponential backoff reconnect
 * 4. On module destroy → clean disconnect
 */
@Injectable()
export class ImapIdleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImapIdleService.name);
  
  private imap: Imap | null = null;
  private isConnected = false;
  private isDestroying = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 50;
  private readonly baseReconnectDelay = 3000; // 3s
  private keepAliveTimer: NodeJS.Timeout | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private readonly pollIntervalMs = 30000; // Poll every 30s as fallback

  // IMAP config
  private readonly imapUser: string;
  private readonly imapPass: string;
  private readonly imapHost: string;
  private readonly sourceFolder: string;

  // Debounce: don't fetch more than once per 2s
  private fetchDebounceTimer: NodeJS.Timeout | null = null;
  private readonly fetchDebounceMs = 2000;

  constructor(
    private configService: ConfigService,
    private emailsService: EmailsService,
    private emailEvents: EmailEventsService,
  ) {
    this.imapUser = this.configService.get<string>('MAIL') || '';
    this.imapPass = this.configService.get<string>('MAIL_PASS') || '';
    this.imapHost = this.configService.get<string>('MAIL_EINGANG') || '';
    this.sourceFolder = this.configService.get<string>('IMAP_SOURCE_FOLDER') || 'INBOX';
  }

  async onModuleInit(): Promise<void> {
    if (!this.imapUser || !this.imapPass || !this.imapHost) {
      this.logger.warn('IMAP credentials not configured — IDLE watcher disabled');
      return;
    }
    this.logger.log(`Starting IMAP IDLE watcher on ${this.sourceFolder}`);
    this.connect();
  }

  onModuleDestroy(): void {
    this.isDestroying = true;
    this.disconnect();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Get current IDLE watcher status (for health checks / admin UI)
   */
  getStatus(): { connected: boolean; folder: string; reconnectAttempts: number } {
    return {
      connected: this.isConnected,
      folder: this.sourceFolder,
      reconnectAttempts: this.reconnectAttempts,
    };
  }

  private connect(): void {
    if (this.isDestroying) return;

    this.disconnect(); // clean up any existing connection

    this.imap = new Imap({
      user: this.imapUser,
      password: this.imapPass,
      host: this.imapHost,
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: 15000,
      keepalive: {
        interval: 10000,     // send NOOP every 10s
        idleInterval: 300000, // re-IDLE every 5min (many servers drop IDLE after 30min)
        forceNoop: false,
      },
    });

    this.imap.once('ready', () => {
      this.logger.log('IMAP IDLE: Connected');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.emailEvents.emit('idle-status', { connected: true, folder: this.sourceFolder });
      this.openBoxAndIdle();
    });

    this.imap.on('mail', (numNewMsgs: number) => {
      this.logger.log(`IMAP IDLE: ${numNewMsgs} new message(s) detected in ${this.sourceFolder}`);
      this.debouncedFetchAndProcess();
    });

    // Listen for flag changes (e.g. user flags/unflags email in Outlook)
    this.imap.on('update', (seqno: number, info: any) => {
      if (info?.flags) {
        const flags = info.flags as string[];
        if (flags.includes('\\Flagged')) {
          this.logger.log(`IMAP IDLE: Email #${seqno} flagged in ${this.sourceFolder} — triggering fetch`);
          this.debouncedFetchAndProcess();
        }
      }
    });

    this.imap.on('expunge', (seqno: number) => {
      this.logger.debug(`IMAP IDLE: Message #${seqno} expunged from ${this.sourceFolder}`);
    });

    this.imap.once('error', (err: Error) => {
      this.logger.error(`IMAP IDLE error: ${err.message}`);
      this.isConnected = false;
      this.emailEvents.emit('idle-status', { connected: false, error: err.message });
      this.scheduleReconnect();
    });

    this.imap.once('end', () => {
      this.logger.log('IMAP IDLE: Connection ended');
      this.isConnected = false;
      if (!this.isDestroying) {
        this.scheduleReconnect();
      }
    });

    this.imap.once('close', (hadError: boolean) => {
      this.logger.log(`IMAP IDLE: Connection closed (hadError: ${hadError})`);
      this.isConnected = false;
      if (!this.isDestroying) {
        this.scheduleReconnect();
      }
    });

    try {
      this.imap.connect();
    } catch (err) {
      this.logger.error(`IMAP IDLE: Failed to connect: ${err?.message}`);
      this.scheduleReconnect();
    }
  }

  private openBoxAndIdle(): void {
    if (!this.imap || this.isDestroying) return;

    this.imap.openBox(this.sourceFolder, false, (err, box) => {
      if (err) {
        this.logger.error(`IMAP IDLE: Failed to open ${this.sourceFolder}: ${err.message}`);
        this.scheduleReconnect();
        return;
      }
      this.logger.log(`IMAP IDLE: Watching ${this.sourceFolder} for flagged emails (${box.messages.total} messages)`);

      // Do an initial fetch on connect to pick up any flagged emails while we were offline
      this.fetchAndProcess();

      // Start polling as fallback (Exchange doesn't always push flag changes via IDLE)
      this.startPolling();
    });
  }

  /**
   * Start polling interval as fallback for servers that don't push flag changes via IDLE.
   * Debounce prevents double-fetching when IDLE event + poll fire simultaneously.
   */
  private startPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
    this.pollTimer = setInterval(() => {
      if (this.isConnected && !this.isDestroying) {
        this.logger.debug('IMAP IDLE: Polling for flagged emails...');
        this.debouncedFetchAndProcess();
      }
    }, this.pollIntervalMs);
    this.logger.log(`IMAP IDLE: Polling started (every ${this.pollIntervalMs / 1000}s)`);
  }

  /**
   * Debounced fetch: if multiple 'mail'/'update' events fire in quick succession
   * (e.g. user drags 10 emails at once), only fetch once after the burst
   */
  private debouncedFetchAndProcess(): void {
    if (this.fetchDebounceTimer) {
      clearTimeout(this.fetchDebounceTimer);
    }
    this.fetchDebounceTimer = setTimeout(() => {
      this.fetchDebounceTimer = null;
      this.fetchAndProcess();
    }, this.fetchDebounceMs);
  }

  /**
   * Fetch flagged emails from IMAP → store in DB → emit SSE event → auto-start AI processing
   */
  private async fetchAndProcess(): Promise<void> {
    try {
      this.logger.log('IMAP IDLE: Fetching flagged emails...');
      const result = await this.emailsService.fetchFlaggedEmails();

      if (result.stored > 0) {
        this.logger.log(`IMAP IDLE: ${result.stored} new emails stored`);

        // Notify all connected SSE clients that new emails are available
        this.emailEvents.emit('new-emails', {
          fetched: result.fetched,
          stored: result.stored,
        });

        // Auto-start AI processing for unprocessed emails
        const processingStatus = this.emailsService.getProcessingStatus();
        if (!processingStatus.isProcessing) {
          this.logger.log('IMAP IDLE: Auto-starting AI processing for new emails');
          
          this.emailEvents.emit('processing-started', {
            trigger: 'imap-idle',
            message: `${result.stored} neue E-Mails werden automatisch analysiert`,
          });

          await this.emailsService.startBackgroundProcessing('process');
        } else {
          this.logger.log('IMAP IDLE: AI processing already running, new emails will be picked up');
        }
      } else {
        this.logger.debug(`IMAP IDLE: Fetch complete, no new emails (${result.fetched} checked)`);
      }
    } catch (err) {
      this.logger.error(`IMAP IDLE: Fetch failed: ${err?.message}`);
    }
  }

  private disconnect(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.imap) {
      try {
        this.imap.removeAllListeners();
        if (this.isConnected) {
          this.imap.end();
        }
      } catch (e) {
        // ignore cleanup errors
      }
      this.imap = null;
      this.isConnected = false;
    }
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.isDestroying || this.reconnectTimer) return;

    this.reconnectAttempts++;
    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      this.logger.error(`IMAP IDLE: Max reconnect attempts (${this.maxReconnectAttempts}) reached — giving up`);
      this.emailEvents.emit('idle-status', { connected: false, error: 'Max reconnect attempts reached' });
      return;
    }

    // Exponential backoff: 3s, 6s, 12s, 24s, ... capped at 120s
    const delay = Math.min(this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 120000);
    this.logger.log(`IMAP IDLE: Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}
