import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Mailbox } from './mailbox.entity';
import { UserMailbox } from './user-mailbox.entity';
import { CreateMailboxDto, UpdateMailboxDto } from './mailboxes.dto';
import * as Imap from 'imap';
import * as nodemailer from 'nodemailer';
import * as tls from 'tls';
import * as net from 'net';

@Injectable()
export class MailboxesService {
  private readonly logger = new Logger(MailboxesService.name);

  constructor(
    @InjectRepository(Mailbox)
    private readonly mailboxRepo: Repository<Mailbox>,
    @InjectRepository(UserMailbox)
    private readonly userMailboxRepo: Repository<UserMailbox>,
  ) {}

  // ==================== MAILBOX CRUD ====================

  async create(dto: CreateMailboxDto): Promise<Mailbox> {
    const mailbox = this.mailboxRepo.create(dto);
    return this.mailboxRepo.save(mailbox);
  }

  async findAll(): Promise<Mailbox[]> {
    return this.mailboxRepo.find({
      order: { name: 'ASC' },
    });
  }

  async findAllActive(): Promise<Mailbox[]> {
    return this.mailboxRepo.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Mailbox> {
    const mailbox = await this.mailboxRepo.findOne({ where: { id } });
    if (!mailbox) {
      throw new NotFoundException(`Mailbox with ID ${id} not found`);
    }
    return mailbox;
  }

  async findByEmail(email: string): Promise<Mailbox | null> {
    return this.mailboxRepo.findOne({ where: { email } });
  }

  async update(id: string, dto: UpdateMailboxDto): Promise<Mailbox> {
    const mailbox = await this.findOne(id);
    Object.assign(mailbox, dto);
    return this.mailboxRepo.save(mailbox);
  }

  async delete(id: string): Promise<void> {
    const result = await this.mailboxRepo.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Mailbox with ID ${id} not found`);
    }
  }

  /**
   * Build the resolved HTML signature for a given mailbox + user.
   * Replaces placeholders: {{userName}}, {{userPosition}}, {{companyName}}, etc.
   */
  resolveSignature(
    mailbox: Mailbox,
    user: { name?: string; signatureName?: string; signaturePosition?: string },
  ): string {
    if (!mailbox.signatureTemplate) return '';

    const userName = user?.signatureName || user?.name || '';
    const userPosition = user?.signaturePosition || '';

    return mailbox.signatureTemplate
      .replace(/\{\{userName\}\}/g, userName)
      .replace(/\{\{userPosition\}\}/g, userPosition)
      .replace(/\{\{companyName\}\}/g, mailbox.companyName || '')
      .replace(/\{\{companyPhone\}\}/g, mailbox.companyPhone || '')
      .replace(/\{\{companyWebsite\}\}/g, mailbox.companyWebsite || '')
      .replace(/\{\{companyAddress\}\}/g, mailbox.companyAddress || '');
  }

  /**
   * Get the plain-text signature (for AI context and plain-text fallbacks)
   */
  getPlainSignature(
    mailbox: Mailbox,
    user: { name?: string; signatureName?: string; signaturePosition?: string },
  ): string {
    const parts: string[] = [];
    const name = user?.signatureName || user?.name || '';
    const position = user?.signaturePosition || '';
    if (name) parts.push(name);
    if (position) parts.push(position);
    if (mailbox.companyName) parts.push(mailbox.companyName);
    if (mailbox.companyPhone) parts.push(`Tel: ${mailbox.companyPhone}`);
    if (mailbox.companyWebsite) parts.push(mailbox.companyWebsite);
    return parts.length > 0 ? '\n\n--\n' + parts.join('\n') : '';
  }

  // ==================== USER <-> MAILBOX ASSIGNMENT ====================

  /**
   * Assign users to a mailbox
   */
  async assignUsers(mailboxId: string, userIds: string[]): Promise<UserMailbox[]> {
    await this.findOne(mailboxId); // Ensure mailbox exists

    // Remove users that are no longer assigned
    const currentAssignments = await this.userMailboxRepo.find({ where: { mailboxId } });
    const toRemove = currentAssignments.filter((a) => !userIds.includes(a.userId));
    if (toRemove.length > 0) {
      await this.userMailboxRepo.remove(toRemove);
    }

    // Upsert remaining/new assignments
    const results: UserMailbox[] = [];
    for (const userId of userIds) {
      let existing = await this.userMailboxRepo.findOne({
        where: { userId, mailboxId },
      });
      if (!existing) {
        existing = this.userMailboxRepo.create({ userId, mailboxId, isActive: true });
        existing = await this.userMailboxRepo.save(existing);
      }
      results.push(existing);
    }
    return results;
  }

  /**
   * Remove a user from a mailbox
   */
  async removeUser(mailboxId: string, userId: string): Promise<void> {
    await this.userMailboxRepo.delete({ mailboxId, userId });
  }

  /**
   * Get all mailboxes assigned to a specific user
   */
  async getMailboxesForUser(userId: string): Promise<(UserMailbox & { mailbox: Mailbox })[]> {
    return this.userMailboxRepo.find({
      where: { userId },
      relations: ['mailbox'],
      order: { assignedAt: 'ASC' },
    }) as any;
  }

  /**
   * Get active (selected) mailbox IDs for a user
   */
  async getActiveMailboxIdsForUser(userId: string): Promise<string[]> {
    const userMailboxes = await this.userMailboxRepo.find({
      where: { userId, isActive: true },
    });
    return userMailboxes.map((um) => um.mailboxId);
  }

  /**
   * Count how many mailboxes a user is assigned to (regardless of active state)
   */
  async getUserMailboxCount(userId: string): Promise<number> {
    return this.userMailboxRepo.count({ where: { userId } });
  }

  /**
   * Get active mailboxes for a user (with full mailbox data)
   */
  async getActiveMailboxesForUser(userId: string): Promise<Mailbox[]> {
    const userMailboxes = await this.userMailboxRepo.find({
      where: { userId, isActive: true },
      relations: ['mailbox'],
    });
    return userMailboxes.map((um) => um.mailbox).filter((m) => m && m.isActive);
  }

  /**
   * Set which mailboxes are active for a user (toggle selection)
   */
  async setActiveMailboxes(userId: string, mailboxIds: string[]): Promise<void> {
    // First, set all user's mailboxes to inactive
    await this.userMailboxRepo.update({ userId }, { isActive: false });

    // Then activate the selected ones
    if (mailboxIds.length > 0) {
      await this.userMailboxRepo
        .createQueryBuilder()
        .update()
        .set({ isActive: true })
        .where('"userId" = :userId AND "mailboxId" IN (:...mailboxIds)', { userId, mailboxIds })
        .execute();
    }
  }

  /**
   * Get all users assigned to a specific mailbox
   */
  async getUsersForMailbox(mailboxId: string): Promise<UserMailbox[]> {
    return this.userMailboxRepo.find({
      where: { mailboxId },
      relations: ['user'],
      order: { assignedAt: 'ASC' },
    });
  }

  /**
   * Generate a default signature template
   */
  generateDefaultSignatureTemplate(): string {
    return `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
<p style="margin: 0;">Mit freundlichen Grüßen</p>
<br>
<p style="margin: 0; font-weight: bold; font-size: 16px; color: #1a1a1a;">{{userName}}</p>
<p style="margin: 0; color: #555;">{{userPosition}}</p>
<p style="margin: 4px 0 0; font-weight: 600; color: #1565c0;">{{companyName}}</p>
<hr style="border: none; border-top: 2px solid #1565c0; margin: 12px 0; width: 60px;">
<p style="margin: 0; font-size: 13px; color: #666;">Tel: {{companyPhone}} &nbsp;|&nbsp; <a href="https://{{companyWebsite}}" style="color: #1565c0; text-decoration: none;">{{companyWebsite}}</a></p>
</div>`;
  }

  // ==================== CONNECTION TEST ====================

  /**
   * Test IMAP and SMTP connectivity for a mailbox (by ID or raw credentials)
   */
  async testConnection(params: {
    mailboxId?: string;
    email?: string;
    password?: string;
    imapHost?: string;
    imapPort?: number;
    imapTls?: boolean;
    smtpHost?: string;
    smtpPort?: number;
    smtpSecure?: boolean;
  }): Promise<{ imap: { success: boolean; message: string; durationMs: number }; smtp: { success: boolean; message: string; durationMs: number } }> {
    let email: string, password: string;
    let imapHost: string, imapPort: number, imapTls: boolean;
    let smtpHost: string, smtpPort: number, smtpSecure: boolean;

    if (params.mailboxId) {
      const mailbox = await this.findOne(params.mailboxId);
      email = params.email || mailbox.email;
      password = params.password || mailbox.password;
      imapHost = params.imapHost || mailbox.imapHost;
      imapPort = params.imapPort ?? mailbox.imapPort;
      imapTls = params.imapTls ?? mailbox.imapTls;
      smtpHost = params.smtpHost || mailbox.smtpHost;
      smtpPort = params.smtpPort ?? mailbox.smtpPort;
      smtpSecure = params.smtpSecure ?? mailbox.smtpSecure;
    } else {
      email = params.email!;
      password = params.password!;
      imapHost = params.imapHost!;
      imapPort = params.imapPort ?? 993;
      imapTls = params.imapTls ?? true;
      smtpHost = params.smtpHost!;
      smtpPort = params.smtpPort ?? 587;
      smtpSecure = params.smtpSecure ?? false;
    }

    // Debug: log what credentials we're using
    this.logger.debug(`Testing connection for: user=${email}, imapHost=${imapHost}:${imapPort}, smtpHost=${smtpHost}:${smtpPort}, passwordLength=${password?.length}, passwordStart=${password?.substring(0, 3)}***`);

    // Test IMAP
    const imapResult = await this.testImap(email, password, imapHost, imapPort, imapTls);
    // Test SMTP
    const smtpResult = await this.testSmtp(email, password, smtpHost, smtpPort, smtpSecure);

    return { imap: imapResult, smtp: smtpResult };
  }

  private async testImap(
    user: string, password: string, host: string, port: number, useTls: boolean,
  ): Promise<{ success: boolean; message: string; durationMs: number }> {
    // 1) Try implicit TLS on configured port
    const result = await this.tryImapConnect(user, password, host, port, useTls);
    if (result.success) return result;

    // 2) If TLS on 993 failed, try STARTTLS on 143
    if (useTls && port === 993) {
      this.logger.log(`IMAP implicit TLS failed for ${user} (${result.message}), trying STARTTLS on port 143...`);
      const starttlsResult = await this.tryImapConnect(user, password, host, 143, false);
      if (starttlsResult.success) {
        starttlsResult.message += ' (via STARTTLS Port 143)';
        return starttlsResult;
      }
      // Return the original 993 error as primary
      result.message += ` | STARTTLS 143: ${starttlsResult.message}`;
    }
    return result;
  }

  /**
   * Test IMAP connection with proper TLS/STARTTLS and multiple auth methods.
   * Tries AUTHENTICATE PLAIN (SASL) first, then LOGIN command as fallback.
   */
  private tryImapConnect(
    user: string, password: string, host: string, port: number, implicitTls: boolean,
  ): Promise<{ success: boolean; message: string; durationMs: number }> {
    const start = Date.now();
    return new Promise((resolve) => {
      let socket: any;
      let buffer = '';
      let resolved = false;
      let state: 'greeting' | 'starttls' | 'starttls-greeting' | 'auth-plain' | 'login' | 'done' = 'greeting';
      let authErrors: string[] = [];

      const finish = (success: boolean, message: string) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        try { socket?.destroy(); } catch {}
        resolve({ success, message, durationMs: Date.now() - start });
      };

      const timer = setTimeout(() => finish(false, 'Timeout nach 15 Sekunden'), 15000);

      const sendAuthPlain = () => {
        // AUTHENTICATE PLAIN: base64(\0user\0pass)
        const token = Buffer.from(`\0${user}\0${password}`).toString('base64');
        socket.write(`A001 AUTHENTICATE PLAIN ${token}\r\n`);
        state = 'auth-plain';
      };

      const sendLogin = () => {
        const escapedUser = user.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const escapedPass = password.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        socket.write(`A002 LOGIN "${escapedUser}" "${escapedPass}"\r\n`);
        state = 'login';
      };

      const handleLine = (line: string) => {
        this.logger.debug(`IMAP test [${host}:${port}]: ${line}`);

        if (state === 'greeting') {
          if (line.startsWith('* OK') || line.startsWith('* PREAUTH')) {
            if (!implicitTls && (line.includes('STARTTLS') || line.includes('LOGINDISABLED'))) {
              // Need STARTTLS before auth
              socket.write('A000 STARTTLS\r\n');
              state = 'starttls';
            } else {
              // Already TLS or no STARTTLS needed — try AUTHENTICATE PLAIN
              sendAuthPlain();
            }
          } else if (line.startsWith('* BYE')) {
            finish(false, `Server abgelehnt: ${line}`);
          }
        } else if (state === 'starttls') {
          if (line.startsWith('A000 OK')) {
            // Upgrade to TLS
            const tlsSocket = tls.connect({
              socket: socket,
              host: host,
              servername: host,
              rejectUnauthorized: false,
            });
            // Remove old listeners from plain socket
            socket.removeAllListeners('data');
            socket.removeAllListeners('error');
            socket = tlsSocket;
            buffer = '';
            socket.on('data', onData);
            socket.on('error', onError);
            // After TLS upgrade, some servers send a new greeting, some don't
            // Try auth after a short delay or on next data
            state = 'starttls-greeting';
            // If no new greeting comes, just send auth after 500ms
            setTimeout(() => {
              if (state === 'starttls-greeting') {
                sendAuthPlain();
              }
            }, 500);
          } else {
            finish(false, `STARTTLS fehlgeschlagen: ${line}`);
          }
        } else if (state === 'starttls-greeting') {
          if (line.startsWith('* OK') || line.startsWith('* PREAUTH')) {
            // Got new greeting after STARTTLS, now auth
            sendAuthPlain();
          }
          // If it's capabilities or other data, wait
        } else if (state === 'auth-plain') {
          if (line.startsWith('A001 OK')) {
            socket.write('A099 LOGOUT\r\n');
            finish(true, `Verbunden in ${Date.now() - start}ms (AUTHENTICATE PLAIN)`);
          } else if (line.startsWith('A001 NO') || line.startsWith('A001 BAD')) {
            authErrors.push(`AUTHENTICATE PLAIN: ${line.replace(/^A001 (NO|BAD) ?/, '')}`);
            // Fallback: try LOGIN command
            sendLogin();
          }
        } else if (state === 'login') {
          if (line.startsWith('A002 OK')) {
            socket.write('A099 LOGOUT\r\n');
            finish(true, `Verbunden in ${Date.now() - start}ms (LOGIN)`);
          } else if (line.startsWith('A002 NO') || line.startsWith('A002 BAD')) {
            authErrors.push(`LOGIN: ${line.replace(/^A002 (NO|BAD) ?/, '')}`);
            finish(false, `Authentifizierung fehlgeschlagen: ${authErrors.join(' | ')}`);
          }
        }
      };

      const onData = (data: Buffer) => {
        buffer += data.toString();
        const lines = buffer.split('\r\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.trim()) handleLine(line);
        }
      };

      const onError = (err: Error) => finish(false, err.message);

      try {
        if (implicitTls) {
          socket = tls.connect({
            host, port,
            servername: host,
            rejectUnauthorized: false,
          });
        } else {
          socket = net.connect({ host, port });
        }
        socket.on('data', onData);
        socket.on('error', onError);
        socket.on('close', () => {
          if (!resolved) finish(false, 'Verbindung geschlossen');
        });
      } catch (err: any) {
        finish(false, err.message);
      }
    });
  }

  private async testSmtp(
    user: string, password: string, host: string, port: number, secure: boolean,
  ): Promise<{ success: boolean; message: string; durationMs: number }> {
    const start = Date.now();
    try {
      const transporter = nodemailer.createTransport({
        host, port, secure,
        auth: { user, pass: password },
        connectionTimeout: 15000,
        greetingTimeout: 10000,
      });
      await transporter.verify();
      const dur = Date.now() - start;
      return { success: true, message: `Verbunden in ${dur}ms`, durationMs: dur };
    } catch (err: any) {
      return { success: false, message: err.message || 'Unbekannter Fehler', durationMs: Date.now() - start };
    }
  }
}
