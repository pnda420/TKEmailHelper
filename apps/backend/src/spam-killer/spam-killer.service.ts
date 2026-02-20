import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import * as Imap from 'imap';
import { simpleParser } from 'mailparser';
import { Readable } from 'stream';
import { MailboxesService } from '../mailboxes/mailboxes.service';
import { Mailbox } from '../mailboxes/mailbox.entity';
import { AI_MODELS } from '../config/ai-models.config';
import { AiUsageService, TrackUsageDto } from '../ai-usage/ai-usage.service';
import { SpamScan } from './spam-scan.entity';
import { SpamDeletionLog } from './spam-deletion-log.entity';
import { SpamKillerEventsService } from './spam-killer-events.service';

export interface SpamScanEmail {
  uid: number;
  messageId: string;
  subject: string;
  from: string;
  fromName: string;
  to: string;
  date: string;
  preview: string;
  isSpam: boolean;
  spamScore: number;
  spamReason: string;
  category: 'legitimate' | 'spam' | 'scam' | 'newsletter' | 'marketing' | 'phishing' | 'unknown';
}

export interface SpamScanResult {
  mailboxId: string;
  mailboxEmail: string;
  totalInbox: number;
  newlyClassified: number;
  fromCache: number;
  spamCount: number;
  newsletterCount: number;
  legitimateCount: number;
  emails: SpamScanEmail[];
  scanDurationMs: number;
}

interface RawEmail {
  uid: number;
  messageId: string;
  subject: string;
  from: string;
  fromName: string;
  to: string;
  date: string;
  preview: string;
  textSnippet: string;
}

@Injectable()
export class SpamKillerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SpamKillerService.name);
  private openai: OpenAI;
  private staleSyncTimer: NodeJS.Timeout | null = null;
  private readonly STALE_SYNC_INTERVAL_MS = 120_000; // 2 minutes
  private isSyncing = false;

  // ── Auto-Scan Scheduler ──
  private autoScanTimers: Map<string, NodeJS.Timeout> = new Map();
  private autoScanRunning: Set<string> = new Set(); // prevent overlapping scans

  constructor(
    @InjectRepository(SpamScan)
    private readonly spamScanRepo: Repository<SpamScan>,
    @InjectRepository(SpamDeletionLog)
    private readonly deletionLogRepo: Repository<SpamDeletionLog>,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => MailboxesService))
    private readonly mailboxesService: MailboxesService,
    private readonly aiUsageService: AiUsageService,
    private readonly spamKillerEvents: SpamKillerEventsService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
      timeout: 120000,
    });
  }

  async onModuleInit() {
    // Start periodic stale-email sync (detects emails deleted in Outlook etc.)
    this.staleSyncTimer = setInterval(() => this.syncStaleEmails(), this.STALE_SYNC_INTERVAL_MS);
    this.logger.log(`[SpamKiller] Stale-sync started (every ${this.STALE_SYNC_INTERVAL_MS / 1000}s)`);

    // Start auto-scan schedulers for all configured mailboxes
    await this.startAutoScanSchedulers();
  }

  onModuleDestroy() {
    if (this.staleSyncTimer) {
      clearInterval(this.staleSyncTimer);
      this.staleSyncTimer = null;
    }
    this.stopAllAutoScanTimers();
  }

  // ==================== AUTO-SCAN SCHEDULER ====================

  /**
   * Start auto-scan timers for all mailboxes with spamScanIntervalMinutes > 0.
   * Called on module init and whenever mailbox settings change.
   */
  async startAutoScanSchedulers(): Promise<void> {
    this.stopAllAutoScanTimers();

    try {
      const mailboxes = await this.mailboxesService.findAllActive();
      let count = 0;

      for (const mb of mailboxes) {
        if (mb.spamScanIntervalMinutes && mb.spamScanIntervalMinutes > 0) {
          this.scheduleAutoScan(mb.id, mb.email, mb.spamScanIntervalMinutes);
          count++;
        }
      }

      if (count > 0) {
        this.logger.log(`[SpamKiller] Auto-scan schedulers started for ${count} mailbox(es)`);
      }
    } catch (err) {
      this.logger.error(`[SpamKiller] Failed to start auto-scan schedulers: ${err.message}`);
    }
  }

  /**
   * Restart all auto-scan schedulers. Call this after a mailbox is created/updated/deleted.
   */
  async restartAutoScanSchedulers(): Promise<void> {
    this.logger.log('[SpamKiller] Restarting auto-scan schedulers...');
    await this.startAutoScanSchedulers();
  }

  private scheduleAutoScan(mailboxId: string, email: string, intervalMinutes: number): void {
    const intervalMs = intervalMinutes * 60 * 1000;

    const timer = setInterval(async () => {
      // Skip if already scanning this mailbox
      if (this.autoScanRunning.has(mailboxId)) {
        this.logger.debug(`[SpamKiller] Auto-scan skipped for ${email} (already running)`);
        return;
      }

      this.autoScanRunning.add(mailboxId);
      try {
        this.logger.log(`[SpamKiller] Auto-scan starting for ${email}`);
        await this.scanMailbox(mailboxId, undefined, { userId: null, userEmail: 'System' });
        this.logger.log(`[SpamKiller] Auto-scan completed for ${email}`);
      } catch (err) {
        this.logger.error(`[SpamKiller] Auto-scan failed for ${email}: ${err.message}`);
      } finally {
        this.autoScanRunning.delete(mailboxId);
      }
    }, intervalMs);

    this.autoScanTimers.set(mailboxId, timer);
    this.logger.log(`[SpamKiller] Scheduled auto-scan for ${email} every ${intervalMinutes} min`);
  }

  private stopAllAutoScanTimers(): void {
    for (const [, timer] of this.autoScanTimers) {
      clearInterval(timer);
    }
    this.autoScanTimers.clear();
  }

  // ==================== PUBLIC METHODS ====================

  /**
   * Scan a mailbox: fetch IMAP -> check DB cache -> classify new -> save -> return flagged
   */
  async scanMailbox(
    mailboxId: string,
    onProgress?: (scanned: number, total: number) => void,
    userInfo?: { userId?: string; userEmail?: string },
  ): Promise<SpamScanResult> {
    const startTime = Date.now();
    const mailbox = await this.mailboxesService.findOne(mailboxId);

    // 1. Fetch all emails from INBOX
    this.logger.log(`[SpamKiller] Fetching emails from ${mailbox.email}...`);
    const rawEmails = await this.fetchFromImap(mailbox);
    const totalInbox = rawEmails.length;
    this.logger.log(`[SpamKiller] Fetched ${totalInbox} emails`);

    if (onProgress) onProgress(0, totalInbox);

    if (totalInbox === 0) {
      await this.spamScanRepo.delete({ mailboxId });
      return this.emptyResult(mailboxId, mailbox.email, Date.now() - startTime);
    }

    // 2. Load cached classifications from DB
    const cached = await this.spamScanRepo.find({ where: { mailboxId } });
    const cachedMap = new Map(cached.map(c => [c.messageId, c]));

    // 3. Cleanup stale entries (no longer in IMAP)
    const currentMsgIds = new Set(rawEmails.map(e => e.messageId));
    const stale = cached.filter(c => !currentMsgIds.has(c.messageId));
    if (stale.length > 0) {
      await this.spamScanRepo.remove(stale);
      this.logger.log(`[SpamKiller] Cleaned ${stale.length} stale cache entries`);
    }

    // 4. Split: cached vs new
    const newEmails: RawEmail[] = [];
    const cachedResults: SpamScanEmail[] = [];
    const uidUpdates: Promise<any>[] = [];

    for (const raw of rawEmails) {
      const entry = cachedMap.get(raw.messageId);
      if (entry) {
        cachedResults.push(this.entityToEmail(entry, raw.uid));
        if (entry.uid !== raw.uid) {
          uidUpdates.push(this.spamScanRepo.update(entry.id, { uid: raw.uid }));
        }
      } else {
        newEmails.push(raw);
      }
    }
    if (uidUpdates.length > 0) await Promise.all(uidUpdates);

    this.logger.log(`[SpamKiller] Cache: ${cachedResults.length}, New: ${newEmails.length}`);
    if (onProgress) onProgress(cachedResults.length, totalInbox);

    // 5. Classify ALL new emails - fire all batches in parallel for max speed
    const newlyClassified: SpamScanEmail[] = [];
    if (newEmails.length > 0) {
      const BATCH_SIZE = 15;
      const batches: RawEmail[][] = [];
      for (let i = 0; i < newEmails.length; i += BATCH_SIZE) {
        batches.push(newEmails.slice(i, i + BATCH_SIZE));
      }

      this.logger.log(`[SpamKiller] Firing ${batches.length} batches in parallel`);

      let classified = 0;
      const batchResults = await Promise.all(
        batches.map(async (batch) => {
          const result = await this.classifyBatch(batch, userInfo);
          classified += result.length;
          if (onProgress) onProgress(cachedResults.length + classified, totalInbox);
          return result;
        }),
      );

      for (const r of batchResults) newlyClassified.push(...r);

      // Save to DB
      await this.saveToDb(mailboxId, newlyClassified, userInfo?.userId);
    }

    // 6. Combine - only return non-legitimate (the "bad" ones)
    const all = [...cachedResults, ...newlyClassified];

    // 6.5 Auto-delete categories configured on the mailbox
    const autoDeleteCats = mailbox.spamAutoDeleteCategories;
    let autoDeleted = 0;
    let reviewEmails: SpamScanEmail[];

    if (autoDeleteCats && autoDeleteCats.length > 0) {
      const autoDeleteSet = new Set(autoDeleteCats);
      const toAutoDelete = all.filter(e => autoDeleteSet.has(e.category));
      reviewEmails = all.filter(e => e.category !== 'legitimate' && !autoDeleteSet.has(e.category));

      if (toAutoDelete.length > 0) {
        this.logger.log(`[SpamKiller] Auto-deleting ${toAutoDelete.length} emails (categories: ${autoDeleteCats.join(', ')})`);
        const autoDeleteUids = toAutoDelete.map(e => e.uid);
        try {
          const delResult = await this.deleteEmails(mailboxId, autoDeleteUids, {
            userId: null,
            userEmail: 'System',
          });
          autoDeleted = delResult.deleted;
          this.logger.log(`[SpamKiller] Auto-deleted ${autoDeleted} emails`);
        } catch (err) {
          this.logger.warn(`[SpamKiller] Auto-delete failed: ${err?.message}`);
          // If auto-delete fails, keep them in review
          reviewEmails = all.filter(e => e.category !== 'legitimate');
        }
      }
    } else {
      reviewEmails = all.filter(e => e.category !== 'legitimate');
    }

    const flagged = reviewEmails.sort((a, b) => b.spamScore - a.spamScore);

    const spamCount = all.filter(e => ['spam', 'scam', 'phishing'].includes(e.category)).length;
    const newsletterCount = all.filter(e => ['newsletter', 'marketing'].includes(e.category)).length;
    const legitimateCount = all.filter(e => e.category === 'legitimate').length;

    this.logger.log(`[SpamKiller] Done! Spam: ${spamCount}, Newsletter: ${newsletterCount}, Legit: ${legitimateCount}, Flagged: ${flagged.length}`);

    const result: SpamScanResult = {
      mailboxId,
      mailboxEmail: mailbox.email,
      totalInbox,
      newlyClassified: newEmails.length,
      fromCache: cachedResults.length,
      spamCount,
      newsletterCount,
      legitimateCount,
      emails: flagged,
      scanDurationMs: Date.now() - startTime,
    };

    // Broadcast updated counts to all SSE clients
    this.emitCountsUpdate(mailboxId).catch(() => {});

    return result;
  }

  /**
   * Get cached results from DB (no IMAP, no AI)
   */
  async getCachedResults(mailboxId: string): Promise<SpamScanResult | null> {
    const mailbox = await this.mailboxesService.findOne(mailboxId);
    const cached = await this.spamScanRepo.find({ where: { mailboxId } });
    if (cached.length === 0) return null;

    const all = cached.map(c => this.entityToEmail(c));
    const flagged = all
      .filter(e => e.category !== 'legitimate')
      .sort((a, b) => b.spamScore - a.spamScore);

    return {
      mailboxId,
      mailboxEmail: mailbox.email,
      totalInbox: cached.length,
      newlyClassified: 0,
      fromCache: cached.length,
      spamCount: all.filter(e => ['spam', 'scam', 'phishing'].includes(e.category)).length,
      newsletterCount: all.filter(e => ['newsletter', 'marketing'].includes(e.category)).length,
      legitimateCount: all.filter(e => e.category === 'legitimate').length,
      emails: flagged,
      scanDurationMs: 0,
    };
  }

  /**
   * Delete emails from IMAP + remove from DB cache + log deletion
   */
  async deleteEmails(
    mailboxId: string,
    uids: number[],
    userInfo?: { userId?: string; userEmail?: string },
  ): Promise<{ deleted: number; failed: number }> {
    if (uids.length === 0) return { deleted: 0, failed: 0 };

    const mailbox = await this.mailboxesService.findOne(mailboxId);

    // Grab email summaries from cache before deleting for the log
    let emailSummaries: any[] = [];
    try {
      const cached = await this.spamScanRepo
        .createQueryBuilder('s')
        .where('s."mailboxId" = :mailboxId AND s.uid IN (:...uids)', { mailboxId, uids })
        .getMany();
      emailSummaries = cached.map(c => ({
        uid: c.uid,
        subject: c.subject,
        from: c.from,
        fromName: c.fromName,
        category: c.category,
        spamScore: c.spamScore,
      }));
    } catch {}

    const result = await this.deleteFromImap(mailbox, uids);

    // Remove from DB cache
    if (result.deleted > 0) {
      await this.spamScanRepo
        .createQueryBuilder()
        .delete()
        .where('"mailboxId" = :mailboxId AND uid IN (:...uids)', { mailboxId, uids })
        .execute()
        .catch(err => this.logger.warn(`[SpamKiller] DB cleanup warning: ${err.message}`));

      // Log the deletion
      try {
        const log = this.deletionLogRepo.create({
          mailboxId,
          mailboxEmail: mailbox.email,
          deletedByUserId: userInfo?.userId || null,
          deletedByUserEmail: userInfo?.userEmail || null,
          count: result.deleted,
          emailSummaries: JSON.stringify(emailSummaries),
        });
        await this.deletionLogRepo.save(log);
        this.logger.log(`[SpamKiller] Logged deletion: ${result.deleted} emails by ${userInfo?.userEmail || 'unknown'}`);
      } catch (err) {
        this.logger.warn(`[SpamKiller] Failed to log deletion: ${err?.message}`);
      }

      // Broadcast removal + updated counts to all SSE clients
      this.spamKillerEvents.emit('emails-removed', { mailboxId, uids });
      this.emitCountsUpdate(mailboxId).catch(() => {});
    }

    return result;
  }

  /**
   * Get flagged email counts per mailbox (for header badge + mailbox cards)
   */
  async getSpamCounts(mailboxIds: string[]): Promise<Record<string, number>> {
    if (mailboxIds.length === 0) return {};

    const results = await this.spamScanRepo
      .createQueryBuilder('s')
      .select('s."mailboxId"', 'mailboxId')
      .addSelect('COUNT(*)', 'count')
      .where('s."mailboxId" IN (:...ids)', { ids: mailboxIds })
      .andWhere('s.category != :legit', { legit: 'legitimate' })
      .groupBy('s."mailboxId"')
      .getRawMany();

    const counts: Record<string, number> = {};
    for (const id of mailboxIds) counts[id] = 0;
    for (const r of results) counts[r.mailboxId] = parseInt(r.count, 10);
    return counts;
  }

  /**
   * Get deletion logs for a specific mailbox
   */
  async getDeletionLogs(mailboxId: string, limit = 50) {
    return this.deletionLogRepo.find({
      where: { mailboxId },
      order: { deletedAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get deletion logs across multiple mailboxes
   */
  async getDeletionLogsForMailboxes(mailboxIds: string[], limit = 50) {
    if (mailboxIds.length === 0) return [];
    return this.deletionLogRepo
      .createQueryBuilder('l')
      .where('l."mailboxId" IN (:...ids)', { ids: mailboxIds })
      .orderBy('l."deletedAt"', 'DESC')
      .take(limit)
      .getMany();
  }

  /**
   * Get paginated deletion history with search & filters.
   * Used by the dedicated deletion history page.
   */
  async getDeletionHistory(options: {
    limit?: number;
    offset?: number;
    search?: string;
    userEmail?: string;
    mailboxId?: string;
    category?: string;
  }): Promise<{ logs: SpamDeletionLog[]; total: number }> {
    const { limit = 30, offset = 0, search, userEmail, mailboxId, category } = options;

    const qb = this.deletionLogRepo.createQueryBuilder('l');

    if (mailboxId) {
      qb.andWhere('l."mailboxId" = :mailboxId', { mailboxId });
    }
    if (userEmail) {
      qb.andWhere('l."deletedByUserEmail" = :userEmail', { userEmail });
    }
    if (search) {
      qb.andWhere('(l."emailSummaries" ILIKE :search OR l."mailboxEmail" ILIKE :search)', {
        search: `%${search}%`,
      });
    }
    if (category) {
      // Search within the JSON emailSummaries for the category
      qb.andWhere('l."emailSummaries" ILIKE :cat', { cat: `%"category":"${category}"%` });
    }

    const total = await qb.getCount();
    const logs = await qb
      .orderBy('l."deletedAt"', 'DESC')
      .skip(offset)
      .take(limit)
      .getMany();

    return { logs, total };
  }

  /**
   * Get distinct user emails that have performed deletions (for filter dropdown).
   */
  async getDeletionUsers(): Promise<string[]> {
    const rows = await this.deletionLogRepo
      .createQueryBuilder('l')
      .select('DISTINCT l."deletedByUserEmail"', 'email')
      .where('l."deletedByUserEmail" IS NOT NULL')
      .orderBy('l."deletedByUserEmail"', 'ASC')
      .getRawMany();
    return rows.map(r => r.email);
  }

  // ==================== STALE SYNC (detect external deletions) ====================

  /**
   * Periodically check all mailboxes that have spam-scan entries.
   * Connect to IMAP, fetch current message-IDs, remove stale DB entries,
   * and broadcast changes via SSE so all clients stay in sync.
   */
  private async syncStaleEmails(): Promise<void> {
    if (this.isSyncing) return;
    // Only run when there are SSE subscribers listening
    if (this.spamKillerEvents.subscriberCount === 0) return;

    this.isSyncing = true;
    try {
      // 1. Find all distinct mailboxIds that have cached spam-scan data
      const rows: { mailboxId: string }[] = await this.spamScanRepo
        .createQueryBuilder('s')
        .select('DISTINCT s."mailboxId"', 'mailboxId')
        .getRawMany();

      if (rows.length === 0) { this.isSyncing = false; return; }

      for (const { mailboxId } of rows) {
        try {
          await this.syncMailbox(mailboxId);
        } catch (err) {
          this.logger.warn(`[SpamKiller] Stale-sync failed for ${mailboxId}: ${err?.message}`);
        }
      }
    } catch (err) {
      this.logger.warn(`[SpamKiller] Stale-sync error: ${err?.message}`);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Sync one mailbox: fetch current IMAP UIDs, remove stale DB entries.
   */
  private async syncMailbox(mailboxId: string): Promise<void> {
    const mailbox = await this.mailboxesService.findOne(mailboxId);

    // Fetch current UIDs from IMAP (lightweight: just 'ALL' search)
    const currentUids = await this.fetchImapUids(mailbox);
    const currentUidSet = new Set(currentUids);

    // Load cached entries for this mailbox
    const cached = await this.spamScanRepo.find({
      where: { mailboxId },
      select: ['id', 'uid', 'messageId'],
    });

    // Find stale entries (UID no longer exists in IMAP)
    const stale = cached.filter(c => !currentUidSet.has(c.uid));
    if (stale.length === 0) return;

    // Remove stale entries
    const staleUids = stale.map(s => s.uid);
    await this.spamScanRepo.remove(stale);
    this.logger.log(`[SpamKiller] Stale-sync: removed ${stale.length} entries from mailbox ${mailbox.email}`);

    // Broadcast to all SSE clients
    this.spamKillerEvents.emit('emails-removed', { mailboxId, uids: staleUids });
    await this.emitCountsUpdate(mailboxId);
  }

  /**
   * Lightweight IMAP operation: just get all UIDs in INBOX.
   */
  private fetchImapUids(mailbox: Mailbox): Promise<number[]> {
    return new Promise((resolve, reject) => {
      const imap = this.createImapConnection(mailbox);
      const timeout = setTimeout(() => {
        try { imap.end(); } catch {}
        reject(new Error('IMAP UID fetch timed out'));
      }, 30000);

      imap.once('ready', () => {
        imap.openBox('INBOX', true, (err) => {
          if (err) { clearTimeout(timeout); try { imap.end(); } catch {} return reject(err); }
          imap.search(['ALL'], (err2, uids) => {
            clearTimeout(timeout);
            try { imap.end(); } catch {}
            if (err2) return reject(err2);
            resolve(uids || []);
          });
        });
      });

      imap.once('error', (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });

      imap.connect();
    });
  }

  /**
   * Emit updated counts for a specific mailbox (broadcasts to all SSE clients).
   */
  private async emitCountsUpdate(mailboxId: string): Promise<void> {
    try {
      // Get all mailbox IDs that have spam data
      const rows: { mailboxId: string }[] = await this.spamScanRepo
        .createQueryBuilder('s')
        .select('DISTINCT s."mailboxId"', 'mailboxId')
        .getRawMany();
      const allIds = rows.map(r => r.mailboxId);
      if (allIds.length === 0) {
        this.spamKillerEvents.emit('counts-updated', { counts: {} });
        return;
      }
      const counts = await this.getSpamCounts(allIds);
      this.spamKillerEvents.emit('counts-updated', { counts });
    } catch (err) {
      this.logger.warn(`[SpamKiller] Failed to emit counts: ${err?.message}`);
    }
  }

  // ==================== PRIVATE HELPERS ====================

  private entityToEmail(entity: SpamScan, uid?: number): SpamScanEmail {
    return {
      uid: uid ?? entity.uid,
      messageId: entity.messageId,
      subject: entity.subject,
      from: entity.from,
      fromName: entity.fromName,
      to: entity.to,
      date: entity.date || '',
      preview: entity.preview,
      isSpam: entity.isSpam,
      spamScore: entity.spamScore,
      spamReason: entity.spamReason,
      category: entity.category as SpamScanEmail['category'],
    };
  }

  private async saveToDb(mailboxId: string, emails: SpamScanEmail[], userId?: string): Promise<void> {
    if (emails.length === 0) return;

    const entities: Partial<SpamScan>[] = emails.map(e => ({
      mailboxId,
      messageId: e.messageId,
      uid: e.uid,
      subject: e.subject,
      from: e.from,
      fromName: e.fromName,
      to: e.to,
      date: e.date,
      preview: e.preview,
      category: e.category,
      spamScore: e.spamScore,
      spamReason: e.spamReason,
      isSpam: e.isSpam,
      scannedByUserId: userId || null,
    }));

    const CHUNK = 50;
    for (let i = 0; i < entities.length; i += CHUNK) {
      await this.spamScanRepo.upsert(
        entities.slice(i, i + CHUNK) as any,
        ['mailboxId', 'messageId'],
      );
    }
    this.logger.log(`[SpamKiller] Saved ${entities.length} classifications to DB`);
  }

  private emptyResult(mailboxId: string, email: string, ms: number): SpamScanResult {
    return {
      mailboxId, mailboxEmail: email, totalInbox: 0, newlyClassified: 0,
      fromCache: 0, spamCount: 0, newsletterCount: 0, legitimateCount: 0,
      emails: [], scanDurationMs: ms,
    };
  }

  // ==================== IMAP ====================

  private fetchFromImap(mailbox: Mailbox): Promise<RawEmail[]> {
    return new Promise((resolve, reject) => {
      const emails: RawEmail[] = [];
      const imap = this.createImapConnection(mailbox);
      const parsePromises: Promise<void>[] = [];

      const timeout = setTimeout(() => {
        try { imap.end(); } catch {}
        reject(new Error('IMAP fetch timeout after 90s'));
      }, 90000);

      imap.once('ready', () => {
        const folder = mailbox.imapSourceFolder || 'INBOX';
        imap.openBox(folder, true, (err, box) => {
          if (err) {
            clearTimeout(timeout);
            imap.end();
            return reject(err);
          }

          if (box.messages.total === 0) {
            clearTimeout(timeout);
            imap.end();
            return resolve([]);
          }

          const fetch = imap.seq.fetch('1:*', {
            bodies: '',
            struct: true,
          });

          fetch.on('message', (msg, seqno) => {
            let uid = 0;
            let rawBody: Buffer | null = null;

            msg.on('attributes', (attrs) => {
              uid = attrs.uid;
            });

            msg.on('body', (stream: Readable) => {
              const chunks: Buffer[] = [];
              stream.on('data', (chunk: Buffer) => chunks.push(chunk));
              stream.on('end', () => {
                rawBody = Buffer.concat(chunks);
              });
            });

            msg.once('end', () => {
              if (!rawBody) return;
              const messageUid = uid || seqno;
              const p = (async () => {
                try {
                  const parsed = await simpleParser(rawBody!);

                  const fromAddr = parsed.from?.value?.[0];
                  const from = fromAddr?.address || '';
                  const fromName = fromAddr?.name || from;

                  const toAddr = parsed.to;
                  const toStr = Array.isArray(toAddr)
                    ? toAddr.map(a => a.text).join(', ')
                    : toAddr?.text || '';

                  let preview = parsed.text || '';
                  if (!preview && parsed.html) {
                    preview = parsed.html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                  }
                  if (preview.length > 300) preview = preview.substring(0, 300) + '...';

                  const email: RawEmail = {
                    uid: messageUid,
                    messageId: parsed.messageId || `uid-${messageUid}`,
                    subject: parsed.subject || '(Kein Betreff)',
                    from,
                    fromName,
                    to: toStr,
                    date: parsed.date?.toISOString() || '',
                    preview,
                    textSnippet: preview.substring(0, 200),
                  };
                  emails.push(email);
                } catch (parseErr) {
                  this.logger.warn(`Failed to parse email #${seqno} (uid=${uid}): ${parseErr}`);
                }
              })();
              parsePromises.push(p);
            });
          });

          fetch.once('error', (err) => {
            clearTimeout(timeout);
            this.logger.error(`IMAP fetch error for ${mailbox.email}:`, err.message);
            imap.end();
            reject(err);
          });

          fetch.once('end', async () => {
            await Promise.all(parsePromises);
            clearTimeout(timeout);
            imap.end();
            resolve(emails);
          });
        });
      });

      imap.once('error', (err: Error) => {
        clearTimeout(timeout);
        this.logger.error(`IMAP connection error for ${mailbox.email}:`, err.message);
        reject(err);
      });

      imap.connect();
    });
  }

  private deleteFromImap(mailbox: Mailbox, uids: number[]): Promise<{ deleted: number; failed: number }> {
    return new Promise((resolve, reject) => {
      const imap = this.createImapConnection(mailbox);
      let deleted = 0;
      let failed = 0;

      const timeout = setTimeout(() => {
        try { imap.end(); } catch {}
        resolve({ deleted, failed: uids.length - deleted });
      }, 30000);

      imap.once('ready', () => {
        const folder = mailbox.imapSourceFolder || 'INBOX';
        this.logger.log(`[SpamKiller] Delete: Opening folder "${folder}" for ${mailbox.email}`);
        imap.openBox(folder, false, (err) => {
          if (err) {
            clearTimeout(timeout);
            this.logger.error(`[SpamKiller] Delete: Failed to open folder: ${err.message}`);
            imap.end();
            return reject(err);
          }

          const trashFolder = mailbox.imapTrashFolder || 'Trash';
          this.logger.log(`[SpamKiller] Delete: ${uids.length} emails, UIDs: [${uids.slice(0, 20).join(', ')}${uids.length > 20 ? '...' : ''}], trash folder: "${trashFolder}"`);

          const processUids = (remainingUids: number[]) => {
            if (remainingUids.length === 0) {
              imap.expunge((expErr) => {
                clearTimeout(timeout);
                if (expErr) this.logger.warn(`[SpamKiller] Delete: Expunge warning: ${expErr.message}`);
                this.logger.log(`[SpamKiller] Delete complete: ${deleted} deleted, ${failed} failed`);
                imap.end();
                resolve({ deleted, failed });
              });
              return;
            }

            const chunk = remainingUids.splice(0, 50);
            this.logger.log(`[SpamKiller] Delete: Processing chunk of ${chunk.length} UIDs: [${chunk.join(', ')}]`);

            imap.move(chunk, trashFolder, (moveErr) => {
              if (moveErr) {
                this.logger.warn(`[SpamKiller] Delete: Move to "${trashFolder}" failed: ${moveErr.message}. Falling back to \\Deleted flag.`);
                imap.addFlags(chunk, ['\\Deleted'], (flagErr) => {
                  if (flagErr) {
                    this.logger.error(`[SpamKiller] Delete: Failed to flag ${chunk.length} emails: ${flagErr.message}`);
                    failed += chunk.length;
                  } else {
                    this.logger.log(`[SpamKiller] Delete: Flagged ${chunk.length} emails as \\Deleted`);
                    deleted += chunk.length;
                  }
                  processUids(remainingUids);
                });
              } else {
                this.logger.log(`[SpamKiller] Delete: Moved ${chunk.length} emails to "${trashFolder}"`);
                deleted += chunk.length;
                processUids(remainingUids);
              }
            });
          };

          processUids([...uids]);
        });
      });

      imap.once('error', (err: Error) => {
        clearTimeout(timeout);
        this.logger.error(`IMAP delete error for ${mailbox.email}:`, err.message);
        reject(err);
      });

      imap.connect();
    });
  }

  private createImapConnection(mailbox: Mailbox): Imap {
    const imapOpts: any = {
      user: mailbox.email,
      password: mailbox.password,
      host: mailbox.imapHost,
      port: mailbox.imapPort || 993,
      tls: mailbox.imapTls !== false,
      tlsOptions: { rejectUnauthorized: false, servername: mailbox.imapHost },
      authTimeout: 10000,
      connTimeout: 10000,
    };
    if (mailbox.imapTls === false) {
      imapOpts.autotls = 'always';
    }
    const imap = new Imap(imapOpts);
    this.forceImapLogin(imap);

    imap.on('error', (err: Error) => {
      this.logger.error(`IMAP error for ${mailbox.email}:`, err.message);
    });

    return imap;
  }

  private forceImapLogin(imap: Imap): void {
    const origConnect = imap.connect.bind(imap);
    imap.connect = function () {
      origConnect();
      const origOnReady = (imap as any)._onReady;
      if (origOnReady) {
        (imap as any)._onReady = function () {
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

  // ==================== AI CLASSIFICATION ====================

  private extractClassifications(parsed: any): any[] {
    if (Array.isArray(parsed)) return parsed;

    for (const key of Object.keys(parsed)) {
      if (Array.isArray(parsed[key])) {
        this.logger.log(`[SpamKiller] Found classifications under key "${key}" (${parsed[key].length} items)`);
        return parsed[key];
      }
    }
    return [];
  }

  private async classifyBatch(
    emails: RawEmail[],
    userInfo?: { userId?: string; userEmail?: string },
  ): Promise<SpamScanEmail[]> {
    const emailDescriptions = emails.map((e, i) =>
      `[${i}] Von: ${e.fromName} <${e.from}> | Betreff: ${e.subject} | Vorschau: ${e.textSnippet}`
    ).join('\n');

    const systemPrompt = `Du bist ein Spam-Erkennungs-Experte. Analysiere E-Mails und klassifiziere sie.

Kategorien:
- "legitimate": Echte, wichtige E-Mails (Geschäftlich, persönlich, Bestellungen, Rechnungen, wichtige Benachrichtigungen)
- "spam": Unerwünschte Werbung, Massenmails
- "scam": Betrugsversuche, Fake-Gewinnspiele, nigerianische Prinzen etc.
- "phishing": Versuche Passwörter/Daten zu stehlen, gefälschte Login-Seiten
- "newsletter": Newsletter und Abonnements (nicht unbedingt schlecht, aber evtl. unerwünscht)
- "marketing": Marketing-Emails von bekannten Firmen

Antworte AUSSCHLIESSLICH mit folgendem JSON-Format:
{"results": [{"index": 0, "category": "spam", "spamScore": 75, "reason": "Unerwünschte Werbung"}]}

Regeln:
- "results" muss ein Array sein mit einem Objekt pro E-Mail
- "index": Die Nummer der E-Mail (beginnt bei 0)
- "category": Genau einer der oben genannten Werte
- "spamScore": Zahl 0-100 (0=sicher, 100=Spam)
  - legitimate: 0-15, newsletter: 20-40, marketing: 30-50, spam: 60-85, scam: 80-100, phishing: 85-100
- "reason": Kurze Begründung auf Deutsch, max 15 Wörter

WICHTIG: Antworte NUR mit dem JSON. Kein anderer Text.`;

    const userMessage = `Klassifiziere diese ${emails.length} E-Mails:\n\n${emailDescriptions}`;

    this.logger.log(`[SpamKiller AI-Input] Batch of ${emails.length} emails. First: "${emails[0]?.subject}"`);
    this.logger.debug(`[SpamKiller AI-Input] Full prompt:\n${userMessage}`);

    try {
      const startTime = Date.now();
      const response = await this.openai.chat.completions.create({
        model: AI_MODELS.fast,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_completion_tokens: 4000,
        response_format: { type: 'json_object' },
      });

      const durationMs = Date.now() - startTime;
      const content = response.choices[0]?.message?.content || '{}';
      const finishReason = response.choices[0]?.finish_reason;

      this.logger.log(`[SpamKiller AI-Output] Model: ${AI_MODELS.fast}, Duration: ${durationMs}ms, Finish: ${finishReason}, Tokens: ${response.usage?.total_tokens || '?'}`);
      this.logger.log(`[SpamKiller AI-Output] Raw response (first 500 chars): ${content.substring(0, 500)}`);

      // Track AI usage
      if (response.usage) {
        const trackDto: TrackUsageDto = {
          feature: 'spam-killer',
          model: AI_MODELS.fast,
          userId: userInfo?.userId,
          userEmail: userInfo?.userEmail,
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
          durationMs,
          success: true,
          context: `Batch classification of ${emails.length} emails`,
        };
        await this.aiUsageService.track(trackDto).catch(() => {});
      }

      // Parse response
      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch (parseErr) {
        this.logger.error(`[SpamKiller] JSON parse failed! Raw content: ${content}`);
        return emails.map(e => this.defaultClassification(e));
      }

      const classifications = this.extractClassifications(parsed);
      this.logger.log(`[SpamKiller] Extracted ${classifications.length} classifications for ${emails.length} emails`);

      if (classifications.length === 0) {
        this.logger.warn(`[SpamKiller] No classifications found! Parsed keys: ${Object.keys(parsed).join(', ')}. Full response: ${content.substring(0, 1000)}`);
        return emails.map(e => this.defaultClassification(e));
      }

      return emails.map((email, idx) => {
        const cls = classifications.find((c: any) => c.index === idx) || classifications[idx] || {};
        const category = cls.category || 'unknown';
        const spamScore = typeof cls.spamScore === 'number' ? cls.spamScore : (typeof cls.spam_score === 'number' ? cls.spam_score : 50);
        const isSpam = ['spam', 'scam', 'phishing'].includes(category);

        if (!cls.category) {
          this.logger.warn(`[SpamKiller] No classification for idx=${idx} uid=${email.uid} subject="${email.subject}"`);
        }

        return {
          uid: email.uid,
          messageId: email.messageId,
          subject: email.subject,
          from: email.from,
          fromName: email.fromName,
          to: email.to,
          date: email.date,
          preview: email.preview,
          isSpam,
          spamScore,
          spamReason: cls.reason || cls.grund || 'Keine Begründung',
          category,
        };
      });
    } catch (err: any) {
      this.logger.error(`[SpamKiller] AI classification FAILED: ${err.message}`, err.stack);
      if (userInfo) {
        await this.aiUsageService.track({
          feature: 'spam-killer',
          model: AI_MODELS.fast,
          userId: userInfo.userId,
          userEmail: userInfo.userEmail,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          success: false,
          errorMessage: err.message,
          context: `Failed batch classification of ${emails.length} emails`,
        }).catch(() => {});
      }
      return emails.map(e => this.defaultClassification(e));
    }
  }

  private defaultClassification(email: RawEmail): SpamScanEmail {
    return {
      uid: email.uid,
      messageId: email.messageId,
      subject: email.subject,
      from: email.from,
      fromName: email.fromName,
      to: email.to,
      date: email.date,
      preview: email.preview,
      isSpam: false,
      spamScore: 50,
      spamReason: 'Klassifizierung fehlgeschlagen',
      category: 'unknown',
    };
  }
}
