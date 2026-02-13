import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Imap from 'imap';
import { EmailsService } from './emails.service';
import { EmailEventsService } from './email-events.service';
import { MailboxesService } from '../mailboxes/mailboxes.service';
import { Mailbox } from '../mailboxes/mailbox.entity';

interface MailboxWatcher {
  mailbox: Mailbox;
  imap: Imap | null;
  isConnected: boolean;
  reconnectAttempts: number;
  reconnectTimer: NodeJS.Timeout | null;
  pollTimer: NodeJS.Timeout | null;
  fetchDebounceTimer: NodeJS.Timeout | null;
}

/**
 * IMAP IDLE Watcher — Persistent connections to multiple mailboxes.
 * Watches each active mailbox's INBOX for FLAGGED emails using IMAP IDLE + polling.
 * When a user flags an email in Outlook (⚑) → auto-fetch → auto-process with AI.
 */
@Injectable()
export class ImapIdleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImapIdleService.name);
  
  private watchers: Map<string, MailboxWatcher> = new Map();
  private isDestroying = false;
  private readonly maxReconnectAttempts = 50;
  private readonly baseReconnectDelay = 3000;
  private readonly pollIntervalMs = 30000;
  private readonly fetchDebounceMs = 2000;

  // Legacy single-mailbox support (from env)
  private legacyImap: Imap | null = null;
  private legacyConnected = false;
  private legacyReconnectTimer: NodeJS.Timeout | null = null;
  private legacyReconnectAttempts = 0;
  private legacyPollTimer: NodeJS.Timeout | null = null;
  private legacyFetchDebounceTimer: NodeJS.Timeout | null = null;

  private readonly imapUser: string;
  private readonly imapPass: string;
  private readonly imapHost: string;
  private readonly sourceFolder: string;

  constructor(
    private configService: ConfigService,
    private emailsService: EmailsService,
    private emailEvents: EmailEventsService,
    private mailboxesService: MailboxesService,
  ) {
    this.imapUser = this.configService.get<string>('MAIL') || '';
    this.imapPass = this.configService.get<string>('MAIL_PASS') || '';
    this.imapHost = this.configService.get<string>('MAIL_EINGANG') || '';
    this.sourceFolder = this.configService.get<string>('IMAP_SOURCE_FOLDER') || 'INBOX';
  }

  async onModuleInit(): Promise<void> {
    // Assign any orphaned emails (mailboxId = null) to the correct mailbox
    try {
      await this.emailsService.assignOrphanedEmails();
    } catch (err) {
      this.logger.warn(`Could not assign orphaned emails: ${err?.message}`);
    }

    // Try to start watchers for all active DB-configured mailboxes
    try {
      const mailboxes = await this.mailboxesService.findAllActive();
      if (mailboxes.length > 0) {
        this.logger.log(`Starting IMAP IDLE watchers for ${mailboxes.length} mailbox(es)`);
        for (const mailbox of mailboxes) {
          this.startWatcher(mailbox);
        }
        return;
      }
    } catch (err) {
      this.logger.warn(`Could not load mailboxes from DB: ${err?.message}`);
    }

    // Fallback: legacy env-based single mailbox
    if (this.imapUser && this.imapPass && this.imapHost) {
      this.logger.log(`Starting legacy IMAP IDLE watcher on ${this.sourceFolder}`);
      this.connectLegacy();
    } else {
      this.logger.warn('No mailboxes configured and no IMAP env credentials — IDLE watcher disabled');
    }
  }

  onModuleDestroy(): void {
    this.isDestroying = true;
    // Stop all mailbox watchers
    for (const [id, watcher] of this.watchers) {
      this.stopWatcher(watcher);
    }
    this.watchers.clear();
    // Stop legacy
    this.disconnectLegacy();
    if (this.legacyReconnectTimer) { clearTimeout(this.legacyReconnectTimer); this.legacyReconnectTimer = null; }
    if (this.legacyPollTimer) { clearInterval(this.legacyPollTimer); this.legacyPollTimer = null; }
  }

  /**
   * Get current IDLE watcher status (for health checks / admin UI)
   */
  getStatus(): { connected: boolean; folder: string; reconnectAttempts: number } {
    // Check if any watcher is connected
    let anyConnected = this.legacyConnected;
    let totalReconnects = this.legacyReconnectAttempts;
    for (const [, w] of this.watchers) {
      if (w.isConnected) anyConnected = true;
      totalReconnects += w.reconnectAttempts;
    }
    return {
      connected: anyConnected,
      folder: this.watchers.size > 0 ? `${this.watchers.size} mailboxes` : this.sourceFolder,
      reconnectAttempts: totalReconnects,
    };
  }

  /**
   * Restart all watchers (e.g. after admin adds/removes a mailbox)
   */
  async restartWatchers(): Promise<void> {
    // Stop all existing
    for (const [, watcher] of this.watchers) {
      this.stopWatcher(watcher);
    }
    this.watchers.clear();

    try {
      const mailboxes = await this.mailboxesService.findAllActive();
      for (const mailbox of mailboxes) {
        this.startWatcher(mailbox);
      }
      this.logger.log(`Restarted IMAP IDLE watchers for ${mailboxes.length} mailbox(es)`);
    } catch (err) {
      this.logger.error(`Failed to restart watchers: ${err?.message}`);
    }
  }

  // ==================== MULTI-MAILBOX WATCHERS ====================

  private startWatcher(mailbox: Mailbox): void {
    if (this.isDestroying) return;
    const existing = this.watchers.get(mailbox.id);
    if (existing) this.stopWatcher(existing);

    const watcher: MailboxWatcher = {
      mailbox,
      imap: null,
      isConnected: false,
      reconnectAttempts: 0,
      reconnectTimer: null,
      pollTimer: null,
      fetchDebounceTimer: null,
    };
    this.watchers.set(mailbox.id, watcher);
    this.connectWatcher(watcher);
  }

  private stopWatcher(watcher: MailboxWatcher): void {
    if (watcher.pollTimer) { clearInterval(watcher.pollTimer); watcher.pollTimer = null; }
    if (watcher.reconnectTimer) { clearTimeout(watcher.reconnectTimer); watcher.reconnectTimer = null; }
    if (watcher.fetchDebounceTimer) { clearTimeout(watcher.fetchDebounceTimer); watcher.fetchDebounceTimer = null; }
    if (watcher.imap) {
      try {
        watcher.imap.removeAllListeners();
        if (watcher.isConnected) watcher.imap.end();
      } catch {}
      watcher.imap = null;
      watcher.isConnected = false;
    }
  }

  private connectWatcher(watcher: MailboxWatcher): void {
    if (this.isDestroying) return;
    this.stopWatcher(watcher);

    const mb = watcher.mailbox;
    const imapOpts: any = {
      user: mb.email,
      password: mb.password,
      host: mb.imapHost,
      port: mb.imapPort || 993,
      tls: mb.imapTls !== false,
      tlsOptions: { rejectUnauthorized: false, servername: mb.imapHost },
      authTimeout: 15000,
      connTimeout: 15000,
      keepalive: { interval: 10000, idleInterval: 300000, forceNoop: false },
    };
    // Enable STARTTLS when not using direct TLS
    if (mb.imapTls === false) {
      imapOpts.autotls = 'always';
    }
    watcher.imap = new Imap(imapOpts);

    // Force LOGIN auth instead of AUTHENTICATE PLAIN (fixes IONOS etc.)
    this.forceImapLogin(watcher.imap);

    watcher.imap.once('ready', () => {
      this.logger.log(`IMAP IDLE [${mb.email}]: Connected`);
      watcher.isConnected = true;
      watcher.reconnectAttempts = 0;
      this.emitCombinedIdleStatus();
      this.openBoxAndIdleWatcher(watcher);
    });

    watcher.imap.on('mail', () => {
      this.debouncedFetchForWatcher(watcher);
    });

    watcher.imap.on('update', (_seqno: number, info: any) => {
      if (info?.flags && (info.flags as string[]).includes('\\Flagged')) {
        this.debouncedFetchForWatcher(watcher);
      }
    });

    watcher.imap.once('error', (err: Error) => {
      this.logger.error(`IMAP IDLE [${mb.email}] error: ${err.message}`);
      watcher.isConnected = false;
      this.emitCombinedIdleStatus();
      this.scheduleReconnectWatcher(watcher);
    });

    watcher.imap.once('end', () => {
      watcher.isConnected = false;
      if (!this.isDestroying) this.scheduleReconnectWatcher(watcher);
    });

    watcher.imap.once('close', () => {
      watcher.isConnected = false;
      if (!this.isDestroying) this.scheduleReconnectWatcher(watcher);
    });

    try {
      watcher.imap.connect();
    } catch (err) {
      this.logger.error(`IMAP IDLE [${mb.email}]: Failed to connect: ${err?.message}`);
      this.scheduleReconnectWatcher(watcher);
    }
  }

  private openBoxAndIdleWatcher(watcher: MailboxWatcher): void {
    if (!watcher.imap || this.isDestroying) return;
    const folder = watcher.mailbox.imapSourceFolder || 'INBOX';

    watcher.imap.openBox(folder, false, (err, box) => {
      if (err) {
        this.logger.error(`IMAP IDLE [${watcher.mailbox.email}]: Failed to open ${folder}: ${err.message}`);
        this.scheduleReconnectWatcher(watcher);
        return;
      }
      this.logger.log(`IMAP IDLE [${watcher.mailbox.email}]: Watching ${folder} (${box.messages.total} msgs)`);
      this.fetchAndProcessWatcher(watcher);
      // Start polling
      if (watcher.pollTimer) clearInterval(watcher.pollTimer);
      watcher.pollTimer = setInterval(() => {
        if (watcher.isConnected && !this.isDestroying) {
          this.debouncedFetchForWatcher(watcher);
        }
      }, this.pollIntervalMs);
    });
  }

  private debouncedFetchForWatcher(watcher: MailboxWatcher): void {
    if (watcher.fetchDebounceTimer) clearTimeout(watcher.fetchDebounceTimer);
    watcher.fetchDebounceTimer = setTimeout(() => {
      watcher.fetchDebounceTimer = null;
      this.fetchAndProcessWatcher(watcher);
    }, this.fetchDebounceMs);
  }

  private async fetchAndProcessWatcher(watcher: MailboxWatcher): Promise<void> {
    try {
      const result = await this.emailsService.fetchFlaggedEmailsForMailbox(watcher.mailbox);
      if (result.stored > 0) {
        this.logger.log(`IMAP IDLE [${watcher.mailbox.email}]: ${result.stored} new emails`);
        this.emailEvents.emit('new-emails', { fetched: result.fetched, stored: result.stored, mailboxId: watcher.mailbox.id });

        const status = this.emailsService.getProcessingStatus();
        if (!status.isProcessing) {
          this.emailEvents.emit('processing-started', {
            trigger: 'imap-idle',
            message: `${result.stored} neue E-Mails von ${watcher.mailbox.name} werden analysiert`,
          });
          await this.emailsService.startBackgroundProcessing('process');
        }
      }
    } catch (err) {
      this.logger.error(`IMAP IDLE [${watcher.mailbox.email}]: Fetch failed: ${err?.message}`);
    }
  }

  private scheduleReconnectWatcher(watcher: MailboxWatcher): void {
    if (this.isDestroying || watcher.reconnectTimer) return;
    watcher.reconnectAttempts++;
    if (watcher.reconnectAttempts > this.maxReconnectAttempts) {
      this.logger.error(`IMAP IDLE [${watcher.mailbox.email}]: Max reconnects reached`);
      return;
    }
    const d = Math.min(this.baseReconnectDelay * Math.pow(2, watcher.reconnectAttempts - 1), 120000);
    watcher.reconnectTimer = setTimeout(() => {
      watcher.reconnectTimer = null;
      this.connectWatcher(watcher);
    }, d);
  }

  private emitCombinedIdleStatus(): void {
    let anyConnected = this.legacyConnected;
    for (const [, w] of this.watchers) {
      if (w.isConnected) anyConnected = true;
    }
    this.emailEvents.emit('idle-status', { connected: anyConnected });
  }

  // ==================== LEGACY SINGLE-MAILBOX (env-based) ====================

  private connectLegacy(): void {
    if (this.isDestroying) return;
    this.disconnectLegacy();

    this.legacyImap = new Imap({
      user: this.imapUser,
      password: this.imapPass,
      host: this.imapHost,
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false, servername: this.imapHost },
      authTimeout: 15000,
      connTimeout: 15000,
      keepalive: { interval: 10000, idleInterval: 300000, forceNoop: false },
    });

    // Force LOGIN auth instead of AUTHENTICATE PLAIN (fixes IONOS etc.)
    this.forceImapLogin(this.legacyImap);

    this.legacyImap.once('ready', () => {
      this.logger.log('IMAP IDLE (legacy): Connected');
      this.legacyConnected = true;
      this.legacyReconnectAttempts = 0;
      this.emailEvents.emit('idle-status', { connected: true, folder: this.sourceFolder });
      this.openBoxAndIdleLegacy();
    });

    this.legacyImap.on('mail', () => { this.debouncedFetchLegacy(); });
    this.legacyImap.on('update', (_seqno: number, info: any) => {
      if (info?.flags && (info.flags as string[]).includes('\\Flagged')) {
        this.debouncedFetchLegacy();
      }
    });

    this.legacyImap.once('error', (err: Error) => {
      this.logger.error(`IMAP IDLE (legacy) error: ${err.message}`);
      this.legacyConnected = false;
      this.scheduleLegacyReconnect();
    });
    this.legacyImap.once('end', () => { this.legacyConnected = false; if (!this.isDestroying) this.scheduleLegacyReconnect(); });
    this.legacyImap.once('close', () => { this.legacyConnected = false; if (!this.isDestroying) this.scheduleLegacyReconnect(); });

    try { this.legacyImap.connect(); } catch (err) { this.scheduleLegacyReconnect(); }
  }

  private openBoxAndIdleLegacy(): void {
    if (!this.legacyImap || this.isDestroying) return;
    this.legacyImap.openBox(this.sourceFolder, false, (err, box) => {
      if (err) { this.scheduleLegacyReconnect(); return; }
      this.logger.log(`IMAP IDLE (legacy): Watching ${this.sourceFolder} (${box.messages.total} msgs)`);
      this.fetchAndProcessLegacy();
      if (this.legacyPollTimer) clearInterval(this.legacyPollTimer);
      this.legacyPollTimer = setInterval(() => {
        if (this.legacyConnected && !this.isDestroying) this.debouncedFetchLegacy();
      }, this.pollIntervalMs);
    });
  }

  private debouncedFetchLegacy(): void {
    if (this.legacyFetchDebounceTimer) clearTimeout(this.legacyFetchDebounceTimer);
    this.legacyFetchDebounceTimer = setTimeout(() => {
      this.legacyFetchDebounceTimer = null;
      this.fetchAndProcessLegacy();
    }, this.fetchDebounceMs);
  }

  private async fetchAndProcessLegacy(): Promise<void> {
    try {
      const result = await this.emailsService.fetchFlaggedEmails();
      if (result.stored > 0) {
        this.emailEvents.emit('new-emails', { fetched: result.fetched, stored: result.stored });
        const status = this.emailsService.getProcessingStatus();
        if (!status.isProcessing) {
          this.emailEvents.emit('processing-started', { trigger: 'imap-idle', message: `${result.stored} neue E-Mails werden analysiert` });
          await this.emailsService.startBackgroundProcessing('process');
        }
      }
    } catch (err) {
      this.logger.error(`IMAP IDLE (legacy): Fetch failed: ${err?.message}`);
    }
  }

  private disconnectLegacy(): void {
    if (this.legacyPollTimer) { clearInterval(this.legacyPollTimer); this.legacyPollTimer = null; }
    if (this.legacyImap) {
      try { this.legacyImap.removeAllListeners(); if (this.legacyConnected) this.legacyImap.end(); } catch {}
      this.legacyImap = null;
      this.legacyConnected = false;
    }
  }

  private scheduleLegacyReconnect(): void {
    if (this.isDestroying || this.legacyReconnectTimer) return;
    this.legacyReconnectAttempts++;
    if (this.legacyReconnectAttempts > this.maxReconnectAttempts) return;
    const d = Math.min(this.baseReconnectDelay * Math.pow(2, this.legacyReconnectAttempts - 1), 120000);
    this.legacyReconnectTimer = setTimeout(() => {
      this.legacyReconnectTimer = null;
      this.connectLegacy();
    }, d);
  }

  /**
   * Force node-imap to use LOGIN command instead of AUTHENTICATE PLAIN.
   * Some providers (IONOS, some Hetzner) reject AUTHENTICATE PLAIN
   * but accept LOGIN with the same credentials.
   */
  private forceImapLogin(imap: Imap): void {
    const origConnect = imap.connect.bind(imap);
    imap.connect = function() {
      origConnect();
      const origOnReady = (imap as any)._onReady;
      if (origOnReady) {
        (imap as any)._onReady = function() {
          if ((imap as any)._caps) {
            (imap as any)._caps = (imap as any)._caps.filter(
              (c: string) => !c.startsWith('AUTH='),
            );
          }
          return origOnReady.apply(imap, arguments);
        };
      }
    };
  }
}
