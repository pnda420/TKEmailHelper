import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, In, IsNull, ILike, Brackets, Raw } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as Imap from 'imap';
import { simpleParser } from 'mailparser';
import { Readable } from 'stream';
import { Email, EmailStatus } from './emails.entity';
import { EmailTemplatesService } from '../email-templates/email-templates.service';
import { AiAgentService } from '../ai-agent/ai-agent.service';
import { EmailEventsService } from './email-events.service';
import { MailboxesService } from '../mailboxes/mailboxes.service';
import { Mailbox } from '../mailboxes/mailbox.entity';

// Background processing state (survives client disconnect)
export interface ProcessingStatus {
  isProcessing: boolean;
  total: number;
  processed: number;
  failed: number;
  currentEmailId: string | null;
  startedAt: Date | null;
  mode: 'process' | 'recalculate' | null;
}

@Injectable()
export class EmailsService {
  private readonly logger = new Logger(EmailsService.name);
  
  // IMAP folder configuration (from environment)
  private readonly SOURCE_FOLDER: string;
  private readonly DONE_FOLDER: string;
  private readonly TRASH_FOLDER: string;
  private readonly SENT_FOLDER: string;

  // Background processing state (in-memory, survives client disconnect)
  private processingStatus: ProcessingStatus = {
    isProcessing: false,
    total: 0,
    processed: 0,
    failed: 0,
    currentEmailId: null,
    startedAt: null,
    mode: null,
  };

  // SSE subscribers for live updates
  private processingSubscribers: ((event: any) => void)[] = [];

  constructor(
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    private configService: ConfigService,
    @Inject(forwardRef(() => EmailTemplatesService))
    private emailTemplatesService: EmailTemplatesService,
    @Inject(forwardRef(() => AiAgentService))
    private aiAgentService: AiAgentService,
    private emailEvents: EmailEventsService,
    private mailboxesService: MailboxesService,
  ) {
    this.SOURCE_FOLDER = this.configService.get<string>('IMAP_SOURCE_FOLDER') || 'INBOX';
    this.DONE_FOLDER = this.configService.get<string>('IMAP_DONE_FOLDER') || 'PROCESSED';
    this.TRASH_FOLDER = this.configService.get<string>('IMAP_TRASH_FOLDER') || 'Trash';
    this.SENT_FOLDER = this.configService.get<string>('IMAP_SENT_FOLDER') || 'Sent';
  }

  /**
   * Create a fresh, isolated IMAP connection instance.
   * Use this for operations that can run concurrently (move, append, etc.)
   */
  private createImapConnection(): Imap {
    const user = this.configService.get<string>('MAIL');
    const password = this.configService.get<string>('MAIL_PASS');
    const host = this.configService.get<string>('MAIL_EINGANG');

    const imap = new Imap({
      user: user,
      password: password,
      host: host,
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false, servername: host },
      authTimeout: 10000,
      connTimeout: 10000,
    });

    // Force LOGIN auth instead of AUTHENTICATE PLAIN (fixes IONOS etc.)
    this.forceImapLogin(imap);

    imap.on('error', (err: Error) => {
      this.logger.error('IMAP connection error:', err.message);
    });

    return imap;
  }

  /**
   * Create an IMAP connection for a specific mailbox entity
   */
  createImapConnectionForMailbox(mailbox: Mailbox): Imap {
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

    // Force LOGIN auth instead of AUTHENTICATE PLAIN (fixes IONOS etc.)
    this.forceImapLogin(imap);

    imap.on('error', (err: Error) => {
      this.logger.error(`IMAP connection error for ${mailbox.email}:`, err.message);
    });

    return imap;
  }

  /**
   * Force node-imap to use LOGIN command instead of AUTHENTICATE PLAIN.
   * Some providers (IONOS, some Hetzner setups) reject AUTHENTICATE PLAIN
   * but accept LOGIN with the same credentials.
   */
  private forceImapLogin(imap: Imap): void {
    const origConnect = imap.connect.bind(imap);
    imap.connect = function() {
      origConnect();
      // After underlying socket connects but before auth,
      // strip AUTH= capabilities so node-imap falls back to LOGIN
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

  /**
   * Get a mailbox by ID
   */
  async getMailbox(mailboxId: string): Promise<Mailbox | null> {
    try {
      return await this.mailboxesService.findOne(mailboxId);
    } catch {
      return null;
    }
  }

  /**
   * Get all active mailboxes
   */
  async getAllActiveMailboxes(): Promise<Mailbox[]> {
    return this.mailboxesService.findAllActive();
  }

  /**
   * Fetches emails from IMAP and stores them in the database
   */
  async fetchAndStoreEmails(): Promise<{ fetched: number; stored: number }> {
    return new Promise((resolve, reject) => {
      let fetchedCount = 0;
      let storedCount = 0;
      const imap = this.createImapConnection();

      imap.once('ready', () => {
        imap.openBox(this.SOURCE_FOLDER, true, (err, box) => {
          if (err) {
            this.logger.error(`Error opening ${this.SOURCE_FOLDER}:`, err.message);
            imap.end();
            return reject(err);
          }

          this.logger.log(`${this.SOURCE_FOLDER} opened. Total messages: ${box.messages.total}`);

          // Fetch last 50 emails (or all if less)
          const fetchCount = Math.min(box.messages.total, 50);
          if (fetchCount === 0) {
            imap.end();
            return resolve({ fetched: 0, stored: 0 });
          }

          const fetchRange = `${Math.max(1, box.messages.total - fetchCount + 1)}:*`;
          const fetch = imap.seq.fetch(fetchRange, {
            bodies: '',
            struct: true,
          });

          const emailPromises: Promise<void>[] = [];

          fetch.on('message', (msg) => {
            fetchedCount++;

            msg.on('body', (stream: Readable) => {
              const emailPromise = this.parseAndStoreEmail(stream);
              emailPromises.push(
                emailPromise
                  .then((stored) => {
                    if (stored) storedCount++;
                  })
                  .catch((e) => {
                    this.logger.error('Error processing email:', e.message);
                  }),
              );
            });
          });

          fetch.once('error', (fetchErr: Error) => {
            this.logger.error('Fetch error:', fetchErr.message);
          });

          fetch.once('end', () => {
            Promise.all(emailPromises).then(() => {
              imap.end();
              this.logger.log(
                `Fetch complete. Fetched: ${fetchedCount}, Stored: ${storedCount}`,
              );
              resolve({ fetched: fetchedCount, stored: storedCount });
            });
          });
        });
      });

      imap.once('error', (imapErr: Error) => {
        reject(imapErr);
      });

      imap.once('end', () => {
        this.logger.log('IMAP connection ended');
      });

      imap.connect();
    });
  }

  private async parseAndStoreEmail(stream: Readable, mailboxId?: string): Promise<boolean> {
    const parsed = await simpleParser(stream);

    if (!parsed.messageId) {
      this.logger.warn('Email without messageId, skipping');
      return false;
    }

    // Check if email already exists
    const existing = await this.emailRepository.findOne({
      where: { messageId: parsed.messageId },
    });

    if (existing) {
      return false; // Already stored
    }

    // Extract preview text
    const textContent = parsed.text || '';
    const preview = textContent.substring(0, 200).replace(/\s+/g, ' ').trim();

    // Extract attachments info
    const attachments = parsed.attachments?.map((att) => ({
      filename: att.filename || 'unnamed',
      contentType: att.contentType,
      size: att.size,
    })) || [];

    // Extract threading headers
    const inReplyTo = parsed.inReplyTo || null;
    const references = parsed.references
      ? (Array.isArray(parsed.references) ? parsed.references.join(' ') : parsed.references)
      : null;

    // Compute threadId from references/inReplyTo chain
    // The first messageId in references is the root of the thread
    const threadId = this.computeThreadId(parsed.messageId, inReplyTo, references);

    const email = this.emailRepository.create({
      messageId: parsed.messageId,
      inReplyTo: inReplyTo,
      references: references,
      threadId: threadId,
      subject: parsed.subject || '(Kein Betreff)',
      fromAddress: parsed.from?.value?.[0]?.address || 'unknown',
      fromName: parsed.from?.value?.[0]?.name || null,
      toAddresses: parsed.to
        ? (Array.isArray(parsed.to) ? parsed.to : [parsed.to])
            .flatMap((addr) => addr.value.map((v) => v.address || ''))
        : [],
      textBody: parsed.text || null,
      htmlBody: parsed.html || null,
      preview: preview || null,
      receivedAt: parsed.date || new Date(),
      hasAttachments: attachments.length > 0,
      attachments: attachments.length > 0 ? attachments : null,
      mailboxId: mailboxId || null,
    });

    await this.emailRepository.save(email);
    return true;
  }

  /**
   * Assign orphaned emails (mailboxId IS NULL) to the correct mailbox
   * by matching the email's toAddress against known mailbox email addresses.
   * Falls back to the first active mailbox if no match is found.
   */
  async assignOrphanedEmails(): Promise<number> {
    const orphans = await this.emailRepository.find({
      where: { mailboxId: IsNull() },
      select: ['id', 'toAddresses'],
    });
    if (orphans.length === 0) return 0;

    const mailboxes = await this.mailboxesService.findAll();
    if (mailboxes.length === 0) return 0;

    // Build a map: email address → mailbox ID
    const emailToMailbox = new Map<string, string>();
    for (const mb of mailboxes) {
      emailToMailbox.set(mb.email.toLowerCase(), mb.id);
    }

    const fallbackId = mailboxes[0].id;
    let assigned = 0;

    for (const orphan of orphans) {
      // Try to match toAddresses against mailbox emails
      const toAddrs = (orphan.toAddresses || []).map(a => a.toLowerCase());
      let matchedId = fallbackId;
      for (const [mbEmail, mbId] of emailToMailbox) {
        if (toAddrs.some(a => a.includes(mbEmail))) {
          matchedId = mbId;
          break;
        }
      }
      await this.emailRepository.update(orphan.id, { mailboxId: matchedId });
      assigned++;
    }

    this.logger.log(`Assigned ${assigned} orphaned email(s) to mailboxes`);
    return assigned;
  }

  /**
   * Get all emails, newest first — with optional search & filter
   */
  async getAllEmails(
    limit = 50,
    offset = 0,
    status?: EmailStatus,
    search?: string,
    filterTag?: string,
    filterRead?: boolean,
    mailboxIds?: string[],
  ): Promise<{ emails: Email[]; total: number }> {
    const qb = this.emailRepository.createQueryBuilder('email');

    // Status filter (default: INBOX)
    qb.where('email.status = :status', { status: status || EmailStatus.INBOX });

    // Mailbox filter
    if (mailboxIds && mailboxIds.length > 0) {
      qb.andWhere('email.mailboxId IN (:...mailboxIds)', { mailboxIds });
    }

    // Full-text search across subject, fromAddress, fromName, preview, aiSummary
    if (search && search.trim().length > 0) {
      const term = `%${search.trim()}%`;
      qb.andWhere(new Brackets(sub => {
        sub.where('email.subject ILIKE :search', { search: term })
           .orWhere('email.fromAddress ILIKE :search', { search: term })
           .orWhere('email.fromName ILIKE :search', { search: term })
           .orWhere('email.preview ILIKE :search', { search: term })
           .orWhere('email.aiSummary ILIKE :search', { search: term });
      }));
    }

    // Filter by AI tag
    if (filterTag && filterTag.trim().length > 0) {
      qb.andWhere(':tag = ANY(email.aiTags)', { tag: filterTag.trim() });
    }

    // Filter by read/unread
    if (filterRead !== undefined) {
      qb.andWhere('email.isRead = :isRead', { isRead: filterRead });
    }

    // Select only list-view fields (exclude heavy bodies)
    qb.select([
      'email.id', 'email.messageId', 'email.subject', 'email.status',
      'email.fromAddress', 'email.fromName', 'email.toAddresses',
      'email.preview', 'email.receivedAt', 'email.isRead',
      'email.hasAttachments', 'email.attachments',
      'email.aiSummary', 'email.aiTags', 'email.aiProcessedAt', 'email.aiProcessing',
      'email.cleanedBody', 'email.agentKeyFacts', 'email.customerPhone',
      'email.suggestedReplySubject', 'email.repliedAt',
      'email.threadId', 'email.inReplyTo', 'email.references',
      'email.lockedBy', 'email.lockedByName', 'email.lockedAt',
      'email.mailboxId',
      'email.createdAt', 'email.updatedAt',
    ]);

    qb.orderBy('email.receivedAt', 'DESC');
    qb.take(limit);
    qb.skip(offset);

    const [emails, total] = await qb.getManyAndCount();
    return { emails, total };
  }

  /**
   * Get sent emails
   */
  async getSentEmails(limit = 50, offset = 0): Promise<{ emails: Email[]; total: number }> {
    return this.getAllEmails(limit, offset, EmailStatus.SENT);
  }

  /**
   * Get trashed emails
   */
  async getTrashedEmails(limit = 50, offset = 0): Promise<{ emails: Email[]; total: number }> {
    return this.getAllEmails(limit, offset, EmailStatus.TRASH);
  }

  /**
   * Get a single email by ID
   */
  async getEmailById(id: string): Promise<Email | null> {
    return this.emailRepository.findOne({ where: { id } });
  }

  /**
   * Mark email as read
   */
  async markAsRead(id: string): Promise<Email | null> {
    await this.emailRepository.update(id, { isRead: true });
    return this.getEmailById(id);
  }

  /**
   * Get unread count
   */
  async getUnreadCount(): Promise<number> {
    return this.emailRepository.count({ 
      where: { isRead: false, status: EmailStatus.INBOX } 
    });
  }

  /**
   * Move email on IMAP server between folders
   * Searches for the email by Message-ID in the source folder and moves it to the target folder.
   */
  private async moveImapEmail(messageId: string, fromFolder: string, toFolder: string): Promise<boolean> {
    return new Promise((resolve) => {
      const imap = this.createImapConnection();
      
      imap.once('ready', () => {
        // Open source folder with write access (false = read-write)
        imap.openBox(fromFolder, false, (err) => {
          if (err) {
            this.logger.error(`Error opening ${fromFolder} for move:`, err.message);
            imap.end();
            return resolve(false);
          }

          // Search for the email by message-id
          imap.search([['HEADER', 'MESSAGE-ID', messageId]], (searchErr, uids) => {
            if (searchErr) {
              this.logger.error('Error searching for email:', searchErr.message);
              imap.end();
              return resolve(false);
            }

            if (!uids || uids.length === 0) {
              this.logger.warn(`Email with messageId ${messageId} not found in ${fromFolder}`);
              imap.end();
              return resolve(false);
            }

            const uid = uids[0];
            this.logger.log(`Found email UID ${uid} in ${fromFolder}, moving to ${toFolder}`);

            imap.move(uid, toFolder, (moveErr) => {
              if (moveErr) {
                this.logger.error(`Error moving email to ${toFolder}:`, moveErr.message);
                imap.end();
                return resolve(false);
              }

              this.logger.log(`Successfully moved email ${fromFolder} → ${toFolder}`);
              imap.end();
              resolve(true);
            });
          });
        });
      });

      imap.once('error', (imapErr: Error) => {
        this.logger.error('IMAP error during move:', imapErr.message);
        resolve(false);
      });

      imap.connect();
    });
  }

  /**
   * Append a raw email message to the IMAP Sent folder.
   * This makes the sent reply visible in Outlook/Thunderbird/Webmail Sent folder.
   */
  async appendToSentFolder(rawMessage: string): Promise<boolean> {
    return new Promise((resolve) => {
      const imap = this.createImapConnection();

      imap.once('ready', () => {
        const messageBuffer = Buffer.from(rawMessage, 'utf-8');
        imap.append(messageBuffer, {
          mailbox: this.SENT_FOLDER,
          flags: ['\\Seen'],
        }, (err) => {
          if (err) {
            this.logger.error(`Error appending to ${this.SENT_FOLDER}:`, err.message);
            imap.end();
            return resolve(false);
          }
          this.logger.log(`Successfully appended reply to ${this.SENT_FOLDER}`);
          imap.end();
          resolve(true);
        });
      });

      imap.once('error', (imapErr: Error) => {
        this.logger.error('IMAP error during append to sent folder:', imapErr.message);
        resolve(false);
      });

      imap.connect();
    });
  }

  /**
   * Remove the \Flagged flag from an email in INBOX on IMAP server.
   * This "un-flags" the email in Outlook after we've processed it.
   */
  private async removeImapFlag(messageId: string, folder: string, flag: string): Promise<boolean> {
    return new Promise((resolve) => {
      const imap = this.createImapConnection();

      imap.once('ready', () => {
        imap.openBox(folder, false, (err) => {
          if (err) {
            this.logger.error(`Error opening ${folder} for flag removal:`, err.message);
            imap.end();
            return resolve(false);
          }

          imap.search([['HEADER', 'MESSAGE-ID', messageId]], (searchErr, uids) => {
            if (searchErr) {
              this.logger.error('Error searching for email to unflag:', searchErr.message);
              imap.end();
              return resolve(false);
            }

            if (!uids || uids.length === 0) {
              this.logger.warn(`Email ${messageId} not found in ${folder} for unflag`);
              imap.end();
              return resolve(false);
            }

            const uid = uids[0];
            imap.delFlags(uid, [flag], (flagErr) => {
              if (flagErr) {
                this.logger.error(`Error removing ${flag} from email:`, flagErr.message);
                imap.end();
                return resolve(false);
              }

              this.logger.log(`Successfully removed ${flag} from email in ${folder}`);
              imap.end();
              resolve(true);
            });
          });
        });
      });

      imap.once('error', (imapErr: Error) => {
        this.logger.error('IMAP error during flag removal:', imapErr.message);
        resolve(false);
      });

      imap.connect();
    });
  }

  /**
   * Add a flag to an email in IMAP (e.g. re-flag after restore from trash)
   */
  private async addImapFlag(messageId: string, folder: string, flag: string): Promise<boolean> {
    return new Promise((resolve) => {
      const imap = this.createImapConnection();

      imap.once('ready', () => {
        imap.openBox(folder, false, (err) => {
          if (err) {
            this.logger.error(`Error opening ${folder} for flag add:`, err.message);
            imap.end();
            return resolve(false);
          }

          imap.search([['HEADER', 'MESSAGE-ID', messageId]], (searchErr, uids) => {
            if (searchErr) {
              this.logger.error('Error searching for email to flag:', searchErr.message);
              imap.end();
              return resolve(false);
            }

            if (!uids || uids.length === 0) {
              this.logger.warn(`Email ${messageId} not found in ${folder} for flagging`);
              imap.end();
              return resolve(false);
            }

            const uid = uids[0];
            imap.addFlags(uid, [flag], (flagErr) => {
              if (flagErr) {
                this.logger.error(`Error adding ${flag} to email:`, flagErr.message);
                imap.end();
                return resolve(false);
              }

              this.logger.log(`Successfully added ${flag} to email in ${folder}`);
              imap.end();
              resolve(true);
            });
          });
        });
      });

      imap.once('error', (imapErr: Error) => {
        this.logger.error('IMAP error during flag add:', imapErr.message);
        resolve(false);
      });

      imap.connect();
    });
  }

  /**
   * Delete an email from IMAP by marking it \Deleted and expunging.
   * This permanently removes the email from the folder.
   */
  private async deleteImapEmail(messageId: string, folder: string): Promise<boolean> {
    return new Promise((resolve) => {
      const imap = this.createImapConnection();

      imap.once('ready', () => {
        imap.openBox(folder, false, (err) => {
          if (err) {
            this.logger.error(`Error opening ${folder} for delete:`, err.message);
            imap.end();
            return resolve(false);
          }

          imap.search([['HEADER', 'MESSAGE-ID', messageId]], (searchErr, uids) => {
            if (searchErr) {
              this.logger.error('Error searching for email to delete:', searchErr.message);
              imap.end();
              return resolve(false);
            }

            if (!uids || uids.length === 0) {
              this.logger.warn(`Email ${messageId} not found in ${folder} for deletion`);
              imap.end();
              return resolve(false);
            }

            const uid = uids[0];
            imap.addFlags(uid, ['\\Deleted'], (flagErr) => {
              if (flagErr) {
                this.logger.error(`Error marking email as deleted:`, flagErr.message);
                imap.end();
                return resolve(false);
              }

              imap.expunge([uid], (expungeErr) => {
                if (expungeErr) {
                  this.logger.error(`Error expunging email:`, expungeErr.message);
                  imap.end();
                  return resolve(false);
                }

                this.logger.log(`Successfully deleted email from ${folder}`);
                imap.end();
                resolve(true);
              });
            });
          });
        });
      });

      imap.once('error', (imapErr: Error) => {
        this.logger.error('IMAP error during delete:', imapErr.message);
        resolve(false);
      });

      imap.connect();
    });
  }

  /**
   * Mark email as sent (replied).
   * 1. Remove \Flagged from INBOX (so IDLE doesn't re-pull)
   * 2. Delete original from INBOX (mail goes away)
   * 3. Reply appears in Sent folder (handled by email-templates.service)
   */
  async markAsSent(id: string, replySubject: string, replyBody: string): Promise<Email | null> {
    const email = await this.getEmailById(id);
    
    if (email?.messageId) {
      // Remove flag first, then delete original from INBOX
      await this.removeImapFlag(email.messageId, this.SOURCE_FOLDER, '\\Flagged');
      await this.deleteImapEmail(email.messageId, this.SOURCE_FOLDER);
    }

    await this.emailRepository.update(id, { 
      status: EmailStatus.SENT,
      repliedAt: new Date(),
      replySentSubject: replySubject,
      replySentBody: replyBody,
      isRead: true,
    });
    this.emailEvents.emit('email-status-changed', { emailId: id, status: EmailStatus.SENT });
    return this.getEmailById(id);
  }

  /**
   * Move email to trash — only remove flag in IMAP + update DB status
   * Email stays in INBOX on mail server, only removed from app's inbox view
   */
  async moveToTrash(id: string): Promise<Email | null> {
    const email = await this.getEmailById(id);
    
    if (email?.messageId) {
      // Remove flag so IDLE doesn't re-pull this email
      await this.removeImapFlag(email.messageId, this.SOURCE_FOLDER, '\\Flagged');
    }

    await this.emailRepository.update(id, { 
      status: EmailStatus.TRASH,
      isRead: true,
    });
    this.emailEvents.emit('email-status-changed', { emailId: id, status: EmailStatus.TRASH });
    return this.getEmailById(id);
  }

  /**
   * Restore email from trash back to inbox.
   * Re-flags it in IMAP so it gets picked up again.
   */
  async restoreFromTrash(id: string): Promise<Email | null> {
    const email = await this.getEmailById(id);

    if (email?.messageId) {
      // Re-add the flag so it shows up in the app again
      await this.addImapFlag(email.messageId, this.SOURCE_FOLDER, '\\Flagged');
    }

    await this.emailRepository.update(id, { 
      status: EmailStatus.INBOX,
    });
    this.emailEvents.emit('email-status-changed', { emailId: id, status: EmailStatus.INBOX });
    return this.getEmailById(id);
  }

  /**
   * Get email statistics
   */
  async getStats(): Promise<{ inbox: number; sent: number; trash: number; unread: number }> {
    const [inbox, sent, trash, unread] = await Promise.all([
      this.emailRepository.count({ where: { status: EmailStatus.INBOX } }),
      this.emailRepository.count({ where: { status: EmailStatus.SENT } }),
      this.emailRepository.count({ where: { status: EmailStatus.TRASH } }),
      this.emailRepository.count({ where: { isRead: false, status: EmailStatus.INBOX } }),
    ]);
    return { inbox, sent, trash, unread };
  }

  // ==================== EMAIL LOCKING ====================

  /** Lock timeout in minutes — locks expire after this */
  private readonly LOCK_TIMEOUT_MINUTES = 15;

  /**
   * Lock an email for a specific user (prevents others from replying)
   */
  async lockEmail(emailId: string, userId: string, userName: string): Promise<{ locked: boolean; lockedBy?: string; lockedByName?: string }> {
    const email = await this.getEmailById(emailId);
    if (!email) {
      return { locked: false };
    }

    // Already locked by same user — extend
    if (email.lockedBy === userId) {
      await this.emailRepository.update(emailId, { lockedAt: new Date() });
      return { locked: true };
    }

    // Locked by someone else — check if expired
    if (email.lockedBy && email.lockedAt) {
      const elapsed = Date.now() - new Date(email.lockedAt).getTime();
      if (elapsed < this.LOCK_TIMEOUT_MINUTES * 60 * 1000) {
        return { locked: false, lockedBy: email.lockedBy, lockedByName: email.lockedByName };
      }
      // Lock expired, take over
    }

    // Acquire lock
    await this.emailRepository.update(emailId, {
      lockedBy: userId,
      lockedByName: userName,
      lockedAt: new Date(),
    });

    // Notify other clients via SSE
    this.emailEvents.emit('email-locked', { emailId, lockedBy: userId, lockedByName: userName });

    return { locked: true };
  }

  /**
   * Unlock an email (user closes detail or navigates away)
   */
  async unlockEmail(emailId: string, userId: string): Promise<void> {
    const email = await this.getEmailById(emailId);
    if (!email) return;

    // Only the locking user (or expired lock) can unlock
    if (email.lockedBy === userId || !email.lockedBy) {
      await this.emailRepository.update(emailId, {
        lockedBy: null,
        lockedByName: null,
        lockedAt: null,
      });

      // Notify other clients via SSE
      this.emailEvents.emit('email-unlocked', { emailId });
    }
  }

  /**
   * Unlock all emails for a user (e.g. on disconnect/logout)
   */
  async unlockAllForUser(userId: string): Promise<void> {
    await this.emailRepository
      .createQueryBuilder()
      .update()
      .set({ lockedBy: null, lockedByName: null, lockedAt: null })
      .where('lockedBy = :userId', { userId })
      .execute();

    this.emailEvents.emit('email-unlocked', { emailId: null, all: true, userId });
  }

  // ==================== DATABASE MANAGEMENT ====================

  /**
   * Clear ALL emails from the database
   */
  async clearAllEmails(): Promise<{ deleted: number }> {
    const count = await this.emailRepository.count();
    await this.emailRepository.clear();
    this.logger.warn(`Cleared ALL ${count} emails from database`);
    return { deleted: count };
  }

  /**
   * Clear emails by status (inbox, sent, or trash)
   */
  async clearEmailsByStatus(status: EmailStatus): Promise<{ deleted: number }> {
    const result = await this.emailRepository.delete({ status });
    const deleted = result.affected || 0;
    this.logger.warn(`Cleared ${deleted} emails with status '${status}' from database`);
    return { deleted };
  }

  /**
   * Clear only AI processing data (re-analyze all emails)
   */
  async clearAiData(): Promise<{ updated: number }> {
    const result = await this.emailRepository
      .createQueryBuilder()
      .update(Email)
      .set({
        aiSummary: null,
        aiTags: null,
        recommendedTemplateId: null,
        recommendedTemplateReason: null,
        aiProcessedAt: null,
        aiProcessing: false,
        cleanedBody: null,
        agentAnalysis: null,
        agentKeyFacts: null,
        suggestedReply: null,
        suggestedReplySubject: null,
        customerPhone: null,
      })
      .where('aiProcessedAt IS NOT NULL')
      .execute();
    const updated = result.affected || 0;
    this.logger.warn(`Cleared AI data from ${updated} emails`);
    return { updated };
  }

  /**
   * Refresh emails - fetch flagged ones from all active mailboxes
   */
  async refreshEmails(): Promise<{ fetched: number; stored: number }> {
    const mailboxes = await this.getAllActiveMailboxes();
    if (mailboxes.length === 0) {
      // Fallback to legacy env-based config
      return this.fetchFlaggedEmails();
    }
    let totalFetched = 0;
    let totalStored = 0;
    for (const mailbox of mailboxes) {
      try {
        const result = await this.fetchFlaggedEmailsForMailbox(mailbox);
        totalFetched += result.fetched;
        totalStored += result.stored;
      } catch (err) {
        this.logger.error(`Error fetching from mailbox ${mailbox.email}: ${err?.message}`);
      }
    }
    return { fetched: totalFetched, stored: totalStored };
  }

  /**
   * Fetch only FLAGGED emails from INBOX (user flags emails in Outlook with ⚑).
   * Uses IMAP SEARCH FLAGGED to find them, then parses & stores.
   * Legacy: uses env config. New: use fetchFlaggedEmailsForMailbox().
   */
  async fetchFlaggedEmails(): Promise<{ fetched: number; stored: number }> {
    return new Promise((resolve, reject) => {
      let fetchedCount = 0;
      let storedCount = 0;
      const imap = this.createImapConnection();

      imap.once('ready', () => {
        imap.openBox(this.SOURCE_FOLDER, true, (err, box) => {
          if (err) {
            this.logger.error(`Error opening ${this.SOURCE_FOLDER} for flagged fetch:`, err.message);
            imap.end();
            return reject(err);
          }

          this.logger.log(`${this.SOURCE_FOLDER} opened for flagged search. Total messages: ${box.messages.total}`);

          // Search for all flagged emails
          imap.search(['FLAGGED'], (searchErr, uids) => {
            if (searchErr) {
              this.logger.error('Error searching for flagged emails:', searchErr.message);
              imap.end();
              return reject(searchErr);
            }

            if (!uids || uids.length === 0) {
              this.logger.debug('No flagged emails found in INBOX');
              imap.end();
              return resolve({ fetched: 0, stored: 0 });
            }

            this.logger.log(`Found ${uids.length} flagged email(s) in ${this.SOURCE_FOLDER}`);

            const fetch = imap.fetch(uids, {
              bodies: '',
              struct: true,
            });

            const emailPromises: Promise<void>[] = [];

            fetch.on('message', (msg) => {
              fetchedCount++;

              msg.on('body', (stream: Readable) => {
                const emailPromise = this.parseAndStoreEmail(stream);
                emailPromises.push(
                  emailPromise
                    .then((stored) => {
                      if (stored) storedCount++;
                    })
                    .catch((e) => {
                      this.logger.error('Error processing flagged email:', e.message);
                    }),
                );
              });
            });

            fetch.once('error', (fetchErr: Error) => {
              this.logger.error('Flagged fetch error:', fetchErr.message);
            });

            fetch.once('end', () => {
              Promise.all(emailPromises).then(() => {
                imap.end();
                this.logger.log(
                  `Flagged fetch complete. Fetched: ${fetchedCount}, Stored: ${storedCount}`,
                );
                resolve({ fetched: fetchedCount, stored: storedCount });
              });
            });
          });
        });
      });

      imap.once('error', (imapErr: Error) => {
        reject(imapErr);
      });

      imap.once('end', () => {
        this.logger.log('IMAP connection ended (flagged fetch)');
      });

      imap.connect();
    });
  }

  /**
   * Fetch flagged emails for a specific mailbox entity
   */
  async fetchFlaggedEmailsForMailbox(mailbox: Mailbox): Promise<{ fetched: number; stored: number }> {
    return new Promise((resolve, reject) => {
      let fetchedCount = 0;
      let storedCount = 0;
      const imap = this.createImapConnectionForMailbox(mailbox);
      const sourceFolder = mailbox.imapSourceFolder || 'INBOX';

      imap.once('ready', () => {
        imap.openBox(sourceFolder, true, (err, box) => {
          if (err) {
            this.logger.error(`Error opening ${sourceFolder} for ${mailbox.email}:`, err.message);
            imap.end();
            return reject(err);
          }

          this.logger.log(`${sourceFolder} opened for ${mailbox.email}. Total: ${box.messages.total}`);

          imap.search(['FLAGGED'], (searchErr, uids) => {
            if (searchErr) {
              this.logger.error(`Error searching flagged for ${mailbox.email}:`, searchErr.message);
              imap.end();
              return reject(searchErr);
            }

            if (!uids || uids.length === 0) {
              this.logger.debug(`No flagged emails in ${mailbox.email}`);
              imap.end();
              return resolve({ fetched: 0, stored: 0 });
            }

            this.logger.log(`Found ${uids.length} flagged email(s) in ${mailbox.email}`);

            const fetch = imap.fetch(uids, { bodies: '', struct: true });
            const emailPromises: Promise<void>[] = [];

            fetch.on('message', (msg) => {
              fetchedCount++;
              msg.on('body', (stream: Readable) => {
                const emailPromise = this.parseAndStoreEmail(stream, mailbox.id);
                emailPromises.push(
                  emailPromise
                    .then((stored) => { if (stored) storedCount++; })
                    .catch((e) => { this.logger.error(`Error processing email from ${mailbox.email}:`, e.message); }),
                );
              });
            });

            fetch.once('error', (fetchErr: Error) => {
              this.logger.error(`Fetch error for ${mailbox.email}:`, fetchErr.message);
            });

            fetch.once('end', () => {
              Promise.all(emailPromises).then(() => {
                imap.end();
                this.logger.log(`Mailbox ${mailbox.email}: Fetched ${fetchedCount}, Stored ${storedCount}`);
                resolve({ fetched: fetchedCount, stored: storedCount });
              });
            });
          });
        });
      });

      imap.once('error', (imapErr: Error) => {
        reject(imapErr);
      });

      imap.connect();
    });
  }

  /**
   * Get attachment content from IMAP server
   */
  async getAttachmentContent(messageId: string, attachmentIndex: number): Promise<Buffer | null> {
    // Try source folder first
    let result = await this.fetchAttachmentWithNewConnection(this.SOURCE_FOLDER, messageId, attachmentIndex);
    
    if (!result) {
      // Try done folder if not found in source
      this.logger.log(`Attachment not found in ${this.SOURCE_FOLDER}, trying ${this.DONE_FOLDER}`);
      result = await this.fetchAttachmentWithNewConnection(this.DONE_FOLDER, messageId, attachmentIndex);
    }

    if (!result) {
      // Try trash folder
      this.logger.log(`Attachment not found in ${this.DONE_FOLDER}, trying ${this.TRASH_FOLDER}`);
      result = await this.fetchAttachmentWithNewConnection(this.TRASH_FOLDER, messageId, attachmentIndex);
    }
    
    return result;
  }

  /**
   * Fetch attachment with a fresh IMAP connection for a specific folder
   */
  private async fetchAttachmentWithNewConnection(
    folder: string,
    messageId: string,
    attachmentIndex: number,
  ): Promise<Buffer | null> {
    return new Promise((resolve) => {
      // Create a fresh IMAP connection for this request
      const user = this.configService.get<string>('MAIL');
      const password = this.configService.get<string>('MAIL_PASS');
      const host = this.configService.get<string>('MAIL_EINGANG');

      const imapConnection = new Imap({
        user: user,
        password: password,
        host: host,
        port: 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false, servername: host },
        authTimeout: 10000,
        connTimeout: 10000,
      });

      // Force LOGIN auth instead of AUTHENTICATE PLAIN
      this.forceImapLogin(imapConnection);

      let resolved = false;
      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          try {
            imapConnection.end();
          } catch (e) {
            // Ignore cleanup errors
          }
        }
      };

      // Set a timeout to prevent hanging
      const timeout = setTimeout(() => {
        this.logger.warn(`Timeout fetching attachment from ${folder}`);
        cleanup();
        resolve(null);
      }, 30000);

      imapConnection.once('ready', () => {
        this.logger.log(`IMAP ready for attachment fetch from ${folder}`);
        
        imapConnection.openBox(folder, true, (err) => {
          if (err) {
            this.logger.warn(`Could not open folder ${folder}:`, err.message);
            clearTimeout(timeout);
            cleanup();
            return resolve(null);
          }

          this.logger.log(`Opened folder ${folder}, searching for messageId: ${messageId}`);

          // Search for the email by message-id
          imapConnection.search([['HEADER', 'MESSAGE-ID', messageId]], (searchErr, uids) => {
            if (searchErr) {
              this.logger.error(`Search error in ${folder}:`, searchErr.message);
              clearTimeout(timeout);
              cleanup();
              return resolve(null);
            }

            if (!uids || uids.length === 0) {
              this.logger.log(`No email found with messageId ${messageId} in ${folder}`);
              clearTimeout(timeout);
              cleanup();
              return resolve(null);
            }

            const uid = uids[0];
            this.logger.log(`Found email with UID ${uid} in ${folder}, fetching attachment ${attachmentIndex}`);
            
            const fetch = imapConnection.fetch(uid, { bodies: '' });
            
            // Track parsing promise to wait for it before resolving
            let parsePromise: Promise<Buffer | null> | null = null;

            fetch.on('message', (msg) => {
              msg.on('body', (stream: Readable) => {
                // Store the parsing promise so we can wait for it
                parsePromise = (async () => {
                  try {
                    const parsed = await simpleParser(stream);
                    
                    this.logger.log(`Email parsed, attachments count: ${parsed.attachments?.length || 0}`);
                    
                    if (parsed.attachments && parsed.attachments[attachmentIndex]) {
                      const attachment = parsed.attachments[attachmentIndex];
                      this.logger.log(`Found attachment: ${attachment.filename}, size: ${attachment.size}`);
                      return attachment.content;
                    } else {
                      this.logger.warn(`Attachment index ${attachmentIndex} not found, available: ${parsed.attachments?.length || 0}`);
                      return null;
                    }
                  } catch (e) {
                    this.logger.error('Parse error:', e);
                    return null;
                  }
                })();
              });
            });

            fetch.once('end', async () => {
              // Wait for parsing to complete before checking result
              if (parsePromise) {
                const result = await parsePromise;
                if (result) {
                  this.logger.log(`Successfully retrieved attachment from ${folder}`);
                  clearTimeout(timeout);
                  resolved = true;
                  imapConnection.end();
                  resolve(result);
                  return;
                }
              }
              
              if (!resolved) {
                this.logger.log(`Fetch ended without finding attachment in ${folder}`);
                clearTimeout(timeout);
                cleanup();
                resolve(null);
              }
            });

            fetch.once('error', (fetchErr: Error) => {
              this.logger.error(`Fetch error in ${folder}:`, fetchErr.message);
              clearTimeout(timeout);
              cleanup();
              resolve(null);
            });
          });
        });
      });

      imapConnection.once('error', (err: Error) => {
        this.logger.error(`IMAP connection error for ${folder}:`, err.message);
        clearTimeout(timeout);
        cleanup();
        resolve(null);
      });

      imapConnection.connect();
    });
  }

  // ==================== AI PROCESSING ====================

  /**
   * Get emails that need AI processing (inbox emails without AI data)
   */
  async getUnprocessedEmails(limit = 10): Promise<Email[]> {
    return this.emailRepository.find({
      where: {
        status: EmailStatus.INBOX,
        aiProcessedAt: IsNull(),
        aiProcessing: false,
      },
      order: { receivedAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get count of emails currently being processed by AI
   */
  async getAiProcessingCount(): Promise<number> {
    return this.emailRepository.count({
      where: { aiProcessing: true },
    });
  }

  /**
   * Get count of unprocessed emails
   */
  async getUnprocessedCount(): Promise<number> {
    return this.emailRepository.count({
      where: {
        status: EmailStatus.INBOX,
        aiProcessedAt: IsNull(),
        aiProcessing: false,
      },
    });
  }

  /**
   * Process a single email with AI analysis (summary + tags + agent analysis)
   */
  async processEmailWithAi(emailId: string): Promise<Email | null> {
    const email = await this.emailRepository.findOne({ where: { id: emailId } });
    if (!email) return null;

    // Mark as processing
    await this.emailRepository.update(emailId, { aiProcessing: true });
    this.processingStatus.currentEmailId = emailId;

    try {
      const body = email.textBody || email.htmlBody?.replace(/<[^>]*>/g, ' ') || '';
      
      if (!body.trim()) {
        this.logger.warn(`processEmailWithAi: Email ${emailId} has no text body, skipping AI`);
        await this.emailRepository.update(emailId, {
          aiSummary: 'Kein E-Mail-Inhalt vorhanden',
          aiTags: [],
          cleanedBody: '',
          aiProcessedAt: new Date(),
          aiProcessing: false,
        });
        return this.emailRepository.findOne({ where: { id: emailId } });
      }
      
      this.logger.log(`processEmailWithAi: Starting analysis for email ${emailId} ("${email.subject?.substring(0, 60)}")`);

      // ---- STEP 1: Basic AI analysis (summary, tags, template recommendation) ----
      const analysis = await this.emailTemplatesService.analyzeEmail(email.subject, body);
      this.logger.log(`processEmailWithAi: Basic analysis done for ${emailId}`);

      // Save basic analysis immediately
      await this.emailRepository.update(emailId, {
        aiSummary: analysis.summary,
        aiTags: analysis.tags,
        cleanedBody: analysis.cleanedBody,
        recommendedTemplateId: analysis.recommendedTemplateId,
        recommendedTemplateReason: analysis.recommendedTemplateReason,
      });

      // ---- STEP 2: Agent analysis (JTL customer data, orders, shipping) ----
      try {
        // Detect inline images from HTML
        const inlineImages: string[] = [];
        if (email.htmlBody) {
          const imgMatches = email.htmlBody.match(/<img[^>]*>/gi) || [];
          for (const img of imgMatches) {
            const altMatch = img.match(/alt=["']([^"']*)["']/i);
            const srcMatch = img.match(/src=["']([^"']*)["']/i);
            const src = srcMatch?.[1] || '';
            if (src.startsWith('cid:') || src.startsWith('data:image')) {
              inlineImages.push(altMatch?.[1] || 'Eingebettetes Bild');
            }
          }
        }

        // Build attachment info
        const attachmentInfo: string[] = [];
        if (email.attachments?.length) {
          for (const att of email.attachments) {
            attachmentInfo.push(`${att.filename} (${att.contentType}, ${Math.round(att.size / 1024)}KB)`);
          }
        }

        const emailData = {
          id: email.id,
          subject: email.subject,
          fromAddress: email.fromAddress,
          fromName: email.fromName || undefined,
          textBody: body,
          attachments: attachmentInfo,
          inlineImages,
        };

        this.logger.log(`processEmailWithAi: Starting agent analysis for ${emailId}`);

        // Forward agent steps to SSE subscribers for live monitoring
        const onStep = (step: any) => {
          this.emitProcessingEvent({
            type: 'step',
            emailId,
            step: {
              type: step.type,
              tool: step.tool,
              status: step.status,
              summary: step.type === 'tool_result'
                ? `${step.tool}: ${JSON.stringify(step.result).substring(0, 120)}`
                : step.content?.substring(0, 150),
            },
          });
        };

        const agentResult = await this.aiAgentService.analyzeEmail(
          emailData,
          onStep,
        );

        // Try to parse structured JSON from agent response, fall back to regex extraction
        const parsed = this.parseAgentJson(agentResult);
        const keyFacts = parsed?.keyFacts?.length ? parsed.keyFacts : this.extractKeyFacts(agentResult);
        const suggestedReply = parsed?.suggestedReply || this.extractSuggestedReply(agentResult);
        const customerPhone = parsed?.customerPhone || this.extractCustomerPhone(agentResult);

        // Strip the JSON block from the stored analysis text (keep only the readable part)
        const cleanAnalysis = agentResult.replace(/```json[\s\S]*?```/g, '').trim();

        this.logger.log(`processEmailWithAi: Agent analysis done for ${emailId} — ${keyFacts.length} key facts (JSON: ${!!parsed})`);

        // Save agent analysis immediately (before reply generation)
        await this.emailRepository.update(emailId, {
          agentAnalysis: cleanAnalysis,
          agentKeyFacts: keyFacts,
          suggestedReply: suggestedReply,
          customerPhone: customerPhone,
        });

        // ---- STEP 3: Pre-generate professional reply with JTL context ----
        try {
          this.logger.log(`processEmailWithAi: Generating pre-computed reply for ${emailId}`);
          this.emitProcessingEvent({
            type: 'step',
            emailId,
            step: { type: 'reply', status: 'running', summary: 'Antwort wird generiert...' },
          });

          // Build JTL context block from agent analysis for the reply prompt
          const contextBlock = `[JTL-KUNDENKONTEXT]\n${cleanAnalysis.substring(0, 2000)}\n[/JTL-KUNDENKONTEXT]`;
          const replyInstructions = contextBlock;

          const replyResult = await this.emailTemplatesService.generateEmailWithGPT({
            originalEmail: {
              subject: email.subject,
              from: email.fromName || email.fromAddress,
              body: body,
            },
            tone: 'professional',
            instructions: replyInstructions,
          });

          this.logger.log(`processEmailWithAi: Pre-computed reply generated for ${emailId}`);

          await this.emailRepository.update(emailId, {
            suggestedReply: replyResult.body,
            suggestedReplySubject: replyResult.subject,
            aiProcessedAt: new Date(),
            aiProcessing: false,
          });
        } catch (replyError) {
          // Reply generation failed — not critical, just log and continue
          this.logger.warn(`processEmailWithAi: Reply generation failed for ${emailId}: ${replyError?.message}`);
          await this.emailRepository.update(emailId, {
            aiProcessedAt: new Date(),
            aiProcessing: false,
          });
        }
      } catch (agentError) {
        // Agent analysis failed but basic analysis succeeded — still mark as processed
        this.logger.error(`processEmailWithAi: Agent analysis failed for ${emailId}: ${agentError?.message}`);
        await this.emailRepository.update(emailId, {
          agentAnalysis: null,
          agentKeyFacts: null,
          suggestedReply: null,
          suggestedReplySubject: null,
          aiProcessedAt: new Date(),
          aiProcessing: false,
        });
      }

      return this.emailRepository.findOne({ where: { id: emailId } });
    } catch (error) {
      const errMsg = error?.message || String(error);
      this.logger.error(`processEmailWithAi: Error for email ${emailId}: ${errMsg}`);
      
      await this.emailRepository.update(emailId, { 
        aiProcessing: false,
        aiSummary: `Fehler: ${errMsg.substring(0, 100)}`,
        aiTags: [],
        aiProcessedAt: new Date(),
      });
      return this.emailRepository.findOne({ where: { id: emailId } });
    }
  }

  // ==================== KEY FACT EXTRACTION ====================

  /** Parse the JSON block from the agent response (returns null if not found or invalid) */
  private parseAgentJson(content: string): {
    keyFacts: { icon: string; label: string; value: string }[];
    suggestedReply: string | null;
    customerPhone: string | null;
  } | null {
    if (!content) return null;

    try {
      // Match ```json ... ``` block
      const jsonMatch = content.match(/```json\s*([\s\S]*?)```/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[1].trim());

      // Validate structure
      if (!parsed || !Array.isArray(parsed.keyFacts)) return null;

      // Validate and clean each key fact
      const validIcons = new Set([
        'person', 'badge', 'business', 'mail', 'phone', 'smartphone', 'home',
        'location_on', 'calendar_today', 'payments', 'shopping_cart', 'event',
        'credit_card', 'local_shipping', 'package_2', 'confirmation_number',
        'help', 'recommend', 'block', 'info',
      ]);

      // Labels that are allowed to have longer sentence-like values
      const longValueLabels = new Set(['Anliegen', 'Empfehlung']);

      const keyFacts = parsed.keyFacts
        .filter((f: any) => f && typeof f.label === 'string' && typeof f.value === 'string' && f.value.trim().length >= 1)
        .filter((f: any) => {
          // For short data fields, reject sentence fragments
          if (!longValueLabels.has(f.label) && this.looksLikeSentenceFragment(String(f.value))) {
            this.logger.debug(`parseAgentJson: Rejected "${f.label}" = "${f.value}" (sentence fragment)`);
            return false;
          }
          return true;
        })
        .map((f: any) => ({
          icon: validIcons.has(f.icon) ? f.icon : 'info',
          label: String(f.label).substring(0, 30),
          value: String(f.value).substring(0, 100),
        }));

      this.logger.log(`parseAgentJson: Parsed ${keyFacts.length} key facts from JSON block`);

      return {
        keyFacts,
        suggestedReply: typeof parsed.suggestedReply === 'string' ? parsed.suggestedReply : null,
        customerPhone: typeof parsed.customerPhone === 'string' ? parsed.customerPhone : null,
      };
    } catch (e) {
      this.logger.warn(`parseAgentJson: Failed to parse JSON block: ${e?.message}`);
      return null;
    }
  }

  private extractKeyFacts(content: string): { icon: string; label: string; value: string }[] {
    const facts: { icon: string; label: string; value: string }[] = [];
    if (!content) return facts;

    // Strict helper: only matches lines that look like structured data ("- Label: Value" or "**Label:** Value")
    // Rejects matches that look like mid-sentence fragments
    const extractField = (pattern: RegExp, icon: string, label: string, maxLen = 60) => {
      const match = content.match(pattern);
      if (match) {
        let val = match[1].trim().replace(/\*\*/g, '').replace(/^-\s*/, '').split('\n')[0];
        if (val.length > maxLen) val = val.substring(0, maxLen) + '…';
        if (val.length >= 2 && !this.looksLikeSentenceFragment(val)) {
          facts.push({ icon, label, value: val });
        }
      }
    };

    // --- Contact data ---
    // Only match structured lines like "**Kunde:** Max Mustermann" or "- Kunde: Max Mustermann"
    extractField(/(?:^|\n)\s*[-*]*\s*\*?\*?Kunde\*?\*?[:\s]+([^\n]{2,60})/i, 'person', 'Kunde', 50);
    extractField(/(?:^|\n)\s*[-*]*\s*(?:Kundennummer|KundenNr|Kd-?Nr\.?)[:\s#]*(\d{3,10})/i, 'badge', 'Kd-Nr.', 20);
    extractField(/(?:^|\n)\s*[-*]*\s*\*?\*?(?:Firma|Unternehmen)\*?\*?[:\s]+([^\n,]{2,50})/i, 'business', 'Firma', 50);

    // E-Mail — only match actual email addresses
    const emailMatch = content.match(/(?:E-?Mail|cMail)[:\s]+([\w.+-]+@[\w.-]+)/i);
    if (emailMatch) {
      facts.push({ icon: 'mail', label: 'E-Mail', value: emailMatch[1].trim() });
    }

    // Phone — only match digit sequences that look like phone numbers
    const phoneMatch = content.match(/(?:Telefon|Tel\.?)[:\s]+([+\d][\d\s\-/()]{4,20})/i);
    if (phoneMatch && /\d{5,}/.test(phoneMatch[1].replace(/\s/g, ''))) {
      facts.push({ icon: 'phone', label: 'Telefon', value: phoneMatch[1].trim() });
    }

    // Mobile
    const mobilMatch = content.match(/(?:Mobil|Handy)[:\s]+([+\d][\d\s\-/()]{4,20})/i);
    if (mobilMatch && /\d{5,}/.test(mobilMatch[1].replace(/\s/g, '')) && mobilMatch[1].trim() !== (phoneMatch?.[1]?.trim() || '')) {
      facts.push({ icon: 'smartphone', label: 'Mobil', value: mobilMatch[1].trim() });
    }

    // --- Address ---
    // Street — must start with a capital letter or number and look like a street name (word + number)
    const streetMatch = content.match(/(?:^|\n)\s*[-*]*\s*\*?\*?(?:Stra[sß]e|Adresse)\*?\*?[:\s]+([A-ZÄÖÜ][a-zäöüßA-ZÄÖÜ\s.-]+\d[\w\s/-]*)/im);
    if (streetMatch) {
      const sv = streetMatch[1].trim().replace(/\*\*/g, '');
      if (sv.length >= 5 && sv.length <= 60 && !this.looksLikeSentenceFragment(sv)) {
        facts.push({ icon: 'home', label: 'Straße', value: sv });
      }
    }

    // City — PLZ + City only
    const ortMatch = content.match(/(?:^|\n)\s*[-*]*\s*\*?\*?(?:Ort|Stadt|PLZ)\*?\*?[:\s]+(\d{4,5}\s+[A-ZÄÖÜa-zäöüß\s.-]{2,40})/im);
    if (ortMatch) {
      const ortVal = ortMatch[1].trim().replace(/\*\*/g, '');
      if (ortVal.length <= 50 && !this.looksLikeSentenceFragment(ortVal)) {
        facts.push({ icon: 'location_on', label: 'Ort', value: ortVal });
      }
    }

    // --- Account info ---
    // Kunde seit — only match dates
    const seitMatch = content.match(/(?:Kunde seit|Registriert)[:\s]+([\d]{1,2}[./][\d]{1,2}[./][\d]{2,4}|\d{4})/i);
    if (seitMatch) {
      facts.push({ icon: 'calendar_today', label: 'Kunde seit', value: seitMatch[1].trim() });
    }

    // --- Order & revenue data ---
    // Revenue — only match currency amounts
    const umsatzMatch = content.match(/(?:Gesamt[Uu]msatz|Umsatz)[:\s]*[€]?\s*([\d.,]+\s*€?)/i);
    if (umsatzMatch) {
      const uVal = umsatzMatch[1].trim().replace(/€$/, '');
      if (/^[\d.,]+$/.test(uVal)) facts.push({ icon: 'payments', label: 'Umsatz', value: `€${uVal}` });
    }

    // Number of orders — only match digits
    const orderCountMatch = content.match(/(?:Anzahl\s*(?:Auftr[aä]ge|Bestellungen)|AnzahlAuftraege|Bestellungen)[:\s]*(\d+)/i);
    if (orderCountMatch) {
      facts.push({ icon: 'shopping_cart', label: 'Bestellungen', value: orderCountMatch[1] });
    }

    // Last order date — only match dates
    const lastOrderMatch = content.match(/(?:Letzter?\s*(?:Auftrag|Bestellung))[:\s]+([\d]{1,2}[./][\d]{1,2}[./][\d]{2,4})/i);
    if (lastOrderMatch) {
      facts.push({ icon: 'event', label: 'Letzte Bestellung', value: lastOrderMatch[1].trim() });
    }

    // Payment method — short known values only
    const payMatch = content.match(/(?:^|\n)\s*[-*]*\s*\*?\*?Zahlungsart\*?\*?[:\s]+([^\n]{2,30})/im);
    if (payMatch) {
      const pv = payMatch[1].trim().replace(/\*\*/g, '');
      if (pv.length <= 30 && !this.looksLikeSentenceFragment(pv)) {
        facts.push({ icon: 'credit_card', label: 'Zahlungsart', value: pv });
      }
    }

    // Tracking — alphanumeric tracking codes
    const trackMatch = content.match(/(?:Tracking|Sendungsnummer|Trackingnummer)[:\s]+([A-Za-z0-9\-]{8,40}(?:\s*\([^)]+\))?)/i);
    if (trackMatch) {
      facts.push({ icon: 'local_shipping', label: 'Tracking', value: trackMatch[1].trim() });
    }

    // Shipping status — short values only
    const shipMatch = content.match(/(?:^|\n)\s*[-*]*\s*\*?\*?(?:Versandstatus|Lieferstatus)\*?\*?[:\s]+([^\n]{2,30})/im);
    if (shipMatch) {
      const shv = shipMatch[1].trim().replace(/\*\*/g, '');
      if (!this.looksLikeSentenceFragment(shv)) {
        facts.push({ icon: 'package_2', label: 'Versandstatus', value: shv });
      }
    }

    // Open tickets — only digits
    const ticketMatch = content.match(/(?:Offene?\s*Tickets?)[:\s]*(\d+)/i);
    if (ticketMatch && parseInt(ticketMatch[1]) > 0) {
      facts.push({ icon: 'confirmation_number', label: 'Offene Tickets', value: ticketMatch[1] });
    }

    // --- Request context (allow slightly longer values) ---
    const anliegenMatch = content.match(/(?:^|\n)\s*[-*]*\s*\*?\*?Anliegen\*?\*?[:\s]+([^\n]{5,120})/im);
    if (anliegenMatch) {
      let av = anliegenMatch[1].trim().replace(/\*\*/g, '').replace(/^-\s*/, '');
      if (av.length > 80) av = av.substring(0, 80) + '…';
      facts.push({ icon: 'help', label: 'Anliegen', value: av });
    }

    const empfehlungMatch = content.match(/(?:^|\n)\s*[-*]*\s*\*?\*?(?:Empfohlene Aktion|Empfehlung)\*?\*?[:\s]+([^\n]{5,120})/im);
    if (empfehlungMatch) {
      let ev = empfehlungMatch[1].trim().replace(/\*\*/g, '').replace(/^-\s*/, '');
      if (ev.length > 80) ev = ev.substring(0, 80) + '…';
      facts.push({ icon: 'recommend', label: 'Empfehlung', value: ev });
    }

    return facts;
  }

  /** Check if a value looks like a sentence fragment rather than structured data */
  private looksLikeSentenceFragment(val: string): boolean {
    // Contains common sentence verbs/patterns → reject
    if (/\b(bestätigen|veranlassen|prüfen|anbieten|senden|kontaktieren|bitten|erstatten|sollte|muss|kann|wird|wurde|haben|nicht angekommen|ob \w+)\b/i.test(val)) {
      return true;
    }
    // Starts with lowercase (not a name/value, but a sentence continuation)
    if (/^[a-zäöü]/.test(val) && val.length > 15) return true;
    // Has too many words (> 8) — likely a sentence
    if (val.split(/\s+/).length > 8 && !/[\d@]/.test(val)) return true;
    return false;
  }

  private extractSuggestedReply(content: string): string | null {
    if (!content) return null;
    const replyMatch = content.match(/(?:Antwortvorschlag|Vorgeschlagene Antwort)[:\s]*\n([\s\S]+?)(?:\n\n---|\n\n##|$)/i);
    return replyMatch ? replyMatch[1].trim() : null;
  }

  private extractCustomerPhone(content: string): string | null {
    if (!content) return null;
    const phoneMatch = content.match(/(?:Telefon|Tel|Mobil|cTel|cMobil)[:\s]+([\d\s+\-/()]+)/i);
    return (phoneMatch && phoneMatch[1].trim().length >= 5) ? phoneMatch[1].trim() : null;
  }

  // ==================== BACKGROUND PROCESSING ====================

  /** Get current processing status (for polling from frontend) */
  getProcessingStatus(): ProcessingStatus {
    return { ...this.processingStatus };
  }

  /** Subscribe to processing events (for SSE) */
  addProcessingSubscriber(callback: (event: any) => void): () => void {
    this.processingSubscribers.push(callback);
    return () => {
      this.processingSubscribers = this.processingSubscribers.filter(s => s !== callback);
    };
  }

  private emitProcessingEvent(event: any): void {
    for (const sub of this.processingSubscribers) {
      try { sub(event); } catch (e) { /* subscriber disconnected */ }
    }
    // Also broadcast to global SSE event bus
    if (event.type === 'progress' && event.email) {
      this.emailEvents.emit('processing-progress', event);
    } else if (event.type === 'complete') {
      this.emailEvents.emit('processing-complete', event);
    }
  }

  /**
   * Start background processing (fire-and-forget, survives client disconnect)
   * Returns immediately.
   */
  async startBackgroundProcessing(mode: 'process' | 'recalculate'): Promise<ProcessingStatus> {
    if (this.processingStatus.isProcessing) {
      return this.processingStatus;
    }

    if (mode === 'recalculate') {
      await this.resetAllAiData();
    }

    const unprocessed = await this.getUnprocessedEmails(100);
    const total = unprocessed.length;

    if (total === 0) {
      return { isProcessing: false, total: 0, processed: 0, failed: 0, currentEmailId: null, startedAt: null, mode: null };
    }

    // Set state BEFORE starting
    this.processingStatus = {
      isProcessing: true,
      total,
      processed: 0,
      failed: 0,
      currentEmailId: null,
      startedAt: new Date(),
      mode,
    };

    this.emitProcessingEvent({ type: 'start', total, processed: 0 });

    // Fire and forget — runs in background
    this.runBackgroundProcessing(unprocessed).catch(err => {
      this.logger.error(`Background processing crashed: ${err.message}`);
      this.processingStatus.isProcessing = false;
      this.emitProcessingEvent({ type: 'fatal-error', error: err.message });
    });

    return this.processingStatus;
  }

  private async runBackgroundProcessing(emails: Email[]): Promise<void> {
    for (const email of emails) {
      try {
        const result = await this.processEmailWithAi(email.id);
        this.processingStatus.processed++;

        const analysisOk = result?.aiSummary && !result.aiSummary.startsWith('Analyse fehlgeschlagen') && !result.aiSummary.startsWith('Fehler:');
        if (!analysisOk) this.processingStatus.failed++;

        this.emitProcessingEvent({
          type: 'progress',
          processed: this.processingStatus.processed,
          total: this.processingStatus.total,
          failed: this.processingStatus.failed,
          email: result ? {
            id: result.id,
            aiSummary: result.aiSummary,
            aiTags: result.aiTags,
            cleanedBody: result.cleanedBody,
            agentAnalysis: result.agentAnalysis,
            agentKeyFacts: result.agentKeyFacts,
            suggestedReply: result.suggestedReply,
            customerPhone: result.customerPhone,
          } : null,
        });
      } catch (err) {
        this.processingStatus.processed++;
        this.processingStatus.failed++;
        this.emitProcessingEvent({
          type: 'error',
          emailId: email.id,
          error: err?.message || String(err),
          processed: this.processingStatus.processed,
          total: this.processingStatus.total,
          failed: this.processingStatus.failed,
        });
      }
    }

    this.logger.log(`Background processing complete: ${this.processingStatus.processed}/${this.processingStatus.total} (${this.processingStatus.failed} failed)`);
    this.emitProcessingEvent({
      type: 'complete',
      processed: this.processingStatus.processed,
      total: this.processingStatus.total,
      failed: this.processingStatus.failed,
    });

    this.processingStatus.isProcessing = false;
    this.processingStatus.currentEmailId = null;
  }

  /**
   * Start background reprocessing for a SINGLE email (with SSE events).
   * Resets its AI data, then runs the full pipeline in background — identical UX to batch.
   */
  async startSingleEmailReprocessing(emailId: string): Promise<ProcessingStatus> {
    if (this.processingStatus.isProcessing) {
      return this.processingStatus;
    }

    // Reset AI fields for this email
    await this.emailRepository.update(emailId, {
      aiSummary: null,
      aiTags: null,
      aiProcessedAt: null,
      cleanedBody: null,
      agentAnalysis: null,
      agentKeyFacts: null,
      suggestedReply: null,
      customerPhone: null,
    });

    const email = await this.getEmailById(emailId);
    if (!email) {
      return { isProcessing: false, total: 0, processed: 0, failed: 0, currentEmailId: null, startedAt: null, mode: null };
    }

    this.processingStatus = {
      isProcessing: true,
      total: 1,
      processed: 0,
      failed: 0,
      currentEmailId: emailId,
      startedAt: new Date(),
      mode: 'recalculate',
    };

    this.emitProcessingEvent({ type: 'start', total: 1, processed: 0 });

    // Fire and forget — same pattern as batch
    this.runBackgroundProcessing([email]).catch(err => {
      this.logger.error(`Single email reprocessing crashed: ${err.message}`);
      this.processingStatus.isProcessing = false;
      this.emitProcessingEvent({ type: 'fatal-error', error: err.message });
    });

    return this.processingStatus;
  }

  /**
   * Process all unprocessed inbox emails with AI
   * Returns immediately with count, processes in background
   */
  async processAllWithAi(): Promise<{ started: boolean; total: number }> {
    const unprocessed = await this.getUnprocessedEmails(50);
    const total = unprocessed.length;
    
    if (total === 0) {
      return { started: false, total: 0 };
    }

    // Process in background (fire and forget)
    this.processEmailsInBackground(unprocessed);

    return { started: true, total };
  }

  /**
   * Background processing - not awaited
   */
  private async processEmailsInBackground(emails: Email[]): Promise<void> {
    for (const email of emails) {
      try {
        await this.processEmailWithAi(email.id);
      } catch (error) {
        this.logger.error(`Failed to process email ${email.id}:`, error);
      }
    }
    this.logger.log(`Background AI processing complete: ${emails.length} emails`);
  }

  /**
   * Force recalculate AI analysis for ALL inbox emails
   * Resets aiProcessedAt and reprocesses everything in background
   */
  async recalculateAllWithAi(): Promise<{ started: boolean; total: number }> {
    // Reset all inbox emails to unprocessed state
    await this.resetAllAiData();

    // Now process all (returns immediately)
    return this.processAllWithAi();
  }

  /**
   * Reset all AI data for inbox emails (for recalculation)
   */
  async resetAllAiData(): Promise<void> {
    await this.emailRepository.update(
      { status: EmailStatus.INBOX },
      { 
        aiProcessedAt: null, aiProcessing: false, aiSummary: null, aiTags: null, cleanedBody: null,
        agentAnalysis: null, agentKeyFacts: null, suggestedReply: null, customerPhone: null,
        recommendedTemplateId: null, recommendedTemplateReason: null,
      }
    );
  }

  /**
   * Get AI processing status for all inbox emails
   */
  async getAiStatus(): Promise<{
    total: number;
    processed: number;
    processing: number;
    pending: number;
  }> {
    const [total, processed, processing] = await Promise.all([
      this.emailRepository.count({ where: { status: EmailStatus.INBOX } }),
      this.emailRepository.count({ where: { status: EmailStatus.INBOX, aiProcessedAt: Not(IsNull()) } }),
      this.emailRepository.count({ where: { aiProcessing: true } }),
    ]);

    return {
      total,
      processed,
      processing,
      pending: total - processed - processing,
    };
  }

  // ==================== THREADING ====================

  /**
   * Compute a threadId from email headers.
   * Strategy: use the first messageId in the References chain (= original email).
   * If no References, use inReplyTo. If neither, the email starts its own thread.
   */
  private computeThreadId(messageId: string, inReplyTo: string | null, references: string | null): string {
    if (references) {
      // References is space-separated list of messageIds, first one is the thread root
      const refs = references.split(/\s+/).filter(r => r.length > 0);
      if (refs.length > 0) return refs[0];
    }
    if (inReplyTo) {
      return inReplyTo;
    }
    // This email starts its own thread
    return messageId;
  }

  /**
   * Get all emails in the same thread as a given email (conversation view).
   * Returns emails across ALL statuses (inbox, sent, trash) for full conversation.
   */
  async getEmailThread(emailId: string): Promise<Email[]> {
    const email = await this.emailRepository.findOne({ where: { id: emailId } });
    if (!email || !email.threadId) return [];

    return this.emailRepository.find({
      where: { threadId: email.threadId },
      order: { receivedAt: 'ASC' },
      select: [
        'id', 'messageId', 'subject', 'status', 'fromAddress', 'fromName',
        'toAddresses', 'preview', 'receivedAt', 'isRead', 'hasAttachments',
        'aiSummary', 'aiTags', 'threadId', 'inReplyTo',
        'repliedAt', 'replySentSubject', 'replySentBody',
        'createdAt',
      ],
    });
  }

  /**
   * Get email history for a specific sender address (customer history).
   * Returns all emails from the same fromAddress across all statuses.
   */
  async getCustomerHistory(fromAddress: string, limit = 20): Promise<Email[]> {
    return this.emailRepository.find({
      where: [
        { fromAddress },
        { toAddresses: Raw(alias => `:addr = ANY(${alias})`, { addr: fromAddress }) },
      ],
      order: { receivedAt: 'DESC' },
      take: limit,
      select: [
        'id', 'messageId', 'subject', 'status', 'fromAddress', 'fromName',
        'toAddresses', 'preview', 'receivedAt', 'isRead',
        'aiSummary', 'aiTags', 'threadId',
        'repliedAt', 'replySentSubject',
        'createdAt',
      ],
    });
  }

  /**
   * Get all unique AI tags used across inbox emails (for filter dropdown).
   */
  async getAvailableTags(): Promise<string[]> {
    const result = await this.emailRepository
      .createQueryBuilder('email')
      .select('DISTINCT unnest(email.aiTags)', 'tag')
      .where('email.status = :status', { status: EmailStatus.INBOX })
      .andWhere('email.aiTags IS NOT NULL')
      .orderBy('tag', 'ASC')
      .getRawMany();
    return result.map(r => r.tag);
  }

  /**
   * Backfill threadIds for existing emails that don't have one yet.
   * Called on startup if needed.
   */
  async backfillThreadIds(): Promise<number> {
    const emailsWithoutThread = await this.emailRepository.find({
      where: { threadId: IsNull() },
      select: ['id', 'messageId', 'inReplyTo', 'references'],
    });

    let updated = 0;
    for (const email of emailsWithoutThread) {
      const threadId = this.computeThreadId(email.messageId, email.inReplyTo, email.references);
      await this.emailRepository.update(email.id, { threadId });
      updated++;
    }

    if (updated > 0) {
      this.logger.log(`Backfilled threadId for ${updated} emails`);
    }
    return updated;
  }
}
