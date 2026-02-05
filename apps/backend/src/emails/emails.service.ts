import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as Imap from 'imap';
import { simpleParser } from 'mailparser';
import { Readable } from 'stream';
import { Email, EmailStatus } from './emails.entity';

@Injectable()
export class EmailsService {
  private readonly logger = new Logger(EmailsService.name);
  private imap: Imap;
  
  // IMAP folder configuration
  private readonly SOURCE_FOLDER = 'KUNDEN';
  private readonly DONE_FOLDER = 'KUNDEN_FERTIG';

  constructor(
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    private configService: ConfigService,
  ) {
    this.initImapConnection();
  }

  private initImapConnection(): void {
    const user = this.configService.get<string>('MAIL');
    const password = this.configService.get<string>('MAIL_PASS');
    const host = this.configService.get<string>('MAIL_EINGANG');
    
    this.logger.log(`IMAP Config - User: ${user}, Host: ${host}, Password length: ${password?.length || 0}`);
    this.logger.debug(`Full password for debug: "${password}"`);

    this.imap = new Imap({
      user: user,
      password: password,
      host: host,
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: 10000, // 10 Sekunden Auth-Timeout
    });

    this.imap.on('error', (err: Error) => {
      this.logger.error('IMAP connection error:', err.message);
    });
  }

  /**
   * Fetches emails from IMAP and stores them in the database
   */
  async fetchAndStoreEmails(): Promise<{ fetched: number; stored: number }> {
    return new Promise((resolve, reject) => {
      let fetchedCount = 0;
      let storedCount = 0;

      this.imap.once('ready', () => {
        this.imap.openBox(this.SOURCE_FOLDER, true, (err, box) => {
          if (err) {
            this.logger.error(`Error opening ${this.SOURCE_FOLDER}:`, err.message);
            this.imap.end();
            return reject(err);
          }

          this.logger.log(`${this.SOURCE_FOLDER} opened. Total messages: ${box.messages.total}`);

          // Fetch last 50 emails (or all if less)
          const fetchCount = Math.min(box.messages.total, 50);
          if (fetchCount === 0) {
            this.imap.end();
            return resolve({ fetched: 0, stored: 0 });
          }

          const fetchRange = `${Math.max(1, box.messages.total - fetchCount + 1)}:*`;
          const fetch = this.imap.seq.fetch(fetchRange, {
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
              this.imap.end();
              this.logger.log(
                `Fetch complete. Fetched: ${fetchedCount}, Stored: ${storedCount}`,
              );
              resolve({ fetched: fetchedCount, stored: storedCount });
            });
          });
        });
      });

      this.imap.once('error', (imapErr: Error) => {
        reject(imapErr);
      });

      this.imap.once('end', () => {
        this.logger.log('IMAP connection ended');
      });

      this.imap.connect();
    });
  }

  private async parseAndStoreEmail(stream: Readable): Promise<boolean> {
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

    const email = this.emailRepository.create({
      messageId: parsed.messageId,
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
    });

    await this.emailRepository.save(email);
    return true;
  }

  /**
   * Get all emails, newest first
   */
  async getAllEmails(limit = 50, offset = 0, status?: EmailStatus): Promise<{ emails: Email[]; total: number }> {
    const whereClause = status ? { status } : { status: EmailStatus.INBOX };
    
    const [emails, total] = await this.emailRepository.findAndCount({
      where: whereClause,
      order: { receivedAt: 'DESC' },
      take: limit,
      skip: offset,
    });

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
   * Move email on IMAP server from KUNDEN to KUNDEN_FERTIG folder
   */
  private async moveEmailToImapFolder(messageId: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.initImapConnection();
      
      this.imap.once('ready', () => {
        // Open source folder with write access (false = read-write)
        this.imap.openBox(this.SOURCE_FOLDER, false, (err) => {
          if (err) {
            this.logger.error(`Error opening ${this.SOURCE_FOLDER} for move:`, err.message);
            this.imap.end();
            return resolve(false);
          }

          // Search for the email by message-id
          this.imap.search([['HEADER', 'MESSAGE-ID', messageId]], (searchErr, uids) => {
            if (searchErr) {
              this.logger.error('Error searching for email:', searchErr.message);
              this.imap.end();
              return resolve(false);
            }

            if (!uids || uids.length === 0) {
              this.logger.warn(`Email with messageId ${messageId} not found in ${this.SOURCE_FOLDER}`);
              this.imap.end();
              return resolve(false);
            }

            const uid = uids[0];
            this.logger.log(`Found email with UID ${uid}, moving to ${this.DONE_FOLDER}`);

            // Move email to KUNDEN_FERTIG folder
            this.imap.move(uid, this.DONE_FOLDER, (moveErr) => {
              if (moveErr) {
                this.logger.error(`Error moving email to ${this.DONE_FOLDER}:`, moveErr.message);
                this.imap.end();
                return resolve(false);
              }

              this.logger.log(`Successfully moved email to ${this.DONE_FOLDER}`);
              this.imap.end();
              resolve(true);
            });
          });
        });
      });

      this.imap.once('error', (imapErr: Error) => {
        this.logger.error('IMAP error during move:', imapErr.message);
        resolve(false);
      });

      this.imap.connect();
    });
  }

  /**
   * Mark email as sent (replied) and move to KUNDEN_FERTIG folder
   */
  async markAsSent(id: string, replySubject: string, replyBody: string): Promise<Email | null> {
    const email = await this.getEmailById(id);
    
    if (email?.messageId) {
      // Move email to KUNDEN_FERTIG folder on IMAP server
      await this.moveEmailToImapFolder(email.messageId);
    }

    await this.emailRepository.update(id, { 
      status: EmailStatus.SENT,
      repliedAt: new Date(),
      replySentSubject: replySubject,
      replySentBody: replyBody,
      isRead: true,
    });
    return this.getEmailById(id);
  }

  /**
   * Move email to trash (no reply needed) and move to KUNDEN_FERTIG folder
   */
  async moveToTrash(id: string): Promise<Email | null> {
    const email = await this.getEmailById(id);
    
    if (email?.messageId) {
      // Move email to KUNDEN_FERTIG folder on IMAP server
      await this.moveEmailToImapFolder(email.messageId);
    }

    await this.emailRepository.update(id, { 
      status: EmailStatus.TRASH,
      isRead: true,
    });
    return this.getEmailById(id);
  }

  /**
   * Restore email from trash back to inbox
   */
  async restoreFromTrash(id: string): Promise<Email | null> {
    await this.emailRepository.update(id, { 
      status: EmailStatus.INBOX,
    });
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

  /**
   * Refresh emails - fetch new ones from IMAP
   */
  async refreshEmails(): Promise<{ fetched: number; stored: number }> {
    // Re-initialize connection for fresh fetch
    this.initImapConnection();
    return this.fetchAndStoreEmails();
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
        tlsOptions: { rejectUnauthorized: false },
        authTimeout: 10000,
      });

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
}
