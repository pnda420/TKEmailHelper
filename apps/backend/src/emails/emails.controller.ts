import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  ParseBoolPipe,
  Res,
  Sse,
  NotFoundException,
  Req,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { Observable, interval, map, takeWhile, startWith, switchMap, of, concat, delay } from 'rxjs';
import { EmailsService } from './emails.service';
import { EmailEventsService } from './email-events.service';
import { ImapIdleService } from './imap-idle.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { EmailStatus } from './emails.entity';
import { MailboxesService } from '../mailboxes/mailboxes.service';
import { User } from '../users/users.entity';

@Controller('emails')
@UseGuards(JwtAuthGuard) // All email routes require authentication
export class EmailsController {
  constructor(
    private readonly emailsService: EmailsService,
    private readonly emailEvents: EmailEventsService,
    private readonly imapIdle: ImapIdleService,
    private readonly mailboxesService: MailboxesService,
  ) {}

  /**
   * GET /emails - Get inbox emails with pagination, search & filter
   */
  @Get()
  async getAllEmails(
    @CurrentUser() user: User,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Query('search') search?: string,
    @Query('tag') tag?: string,
    @Query('read') read?: string,
  ) {
    const filterRead = read === 'true' ? true : read === 'false' ? false : undefined;
    const mailboxIds = await this.mailboxesService.getActiveMailboxIdsForUser(user.id);
    // If user has mailbox assignments but none active → return empty
    const userMailboxCount = await this.mailboxesService.getUserMailboxCount(user.id);
    if (userMailboxCount > 0 && mailboxIds.length === 0) {
      return { emails: [], total: 0 };
    }
    return this.emailsService.getAllEmails(limit, offset, undefined, search, tag, filterRead, mailboxIds.length > 0 ? mailboxIds : undefined);
  }

  /**
   * GET /emails/sent - Get sent emails
   */
  @Get('sent')
  async getSentEmails(
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.emailsService.getSentEmails(limit, offset);
  }

  /**
   * GET /emails/trash - Get trashed emails
   */
  @Get('trash')
  async getTrashedEmails(
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.emailsService.getTrashedEmails(limit, offset);
  }

  /**
   * GET /emails/stats - Get email statistics
   */
  @Get('stats')
  async getStats() {
    return this.emailsService.getStats();
  }

  /**
   * GET /emails/unread-count - Get count of unread emails
   */
  @Get('unread-count')
  async getUnreadCount() {
    const count = await this.emailsService.getUnreadCount();
    return { unreadCount: count };
  }

  /**
   * POST /emails/refresh - Fetch new emails from IMAP
   */
  @Post('refresh')
  async refreshEmails() {
    const result = await this.emailsService.refreshEmails();
    return {
      message: 'E-Mails erfolgreich abgerufen',
      ...result,
    };
  }

  /**
   * POST /emails/unlock-all - Unlock all emails for current user (on disconnect/logout)
   * NOTE: Must be before :id routes!
   */
  @Post('unlock-all')
  async unlockAllEmails(@CurrentUser() user: any) {
    await this.emailsService.unlockAllForUser(user.id);
    return { unlocked: true };
  }

  /**
   * GET /emails/:id/attachments/:index - Get attachment content by index
   * NOTE: This route MUST be defined BEFORE the generic /:id route!
   */
  @Get(':id/attachments/:index')
  async getAttachment(
    @Param('id') id: string,
    @Param('index', ParseIntPipe) index: number,
    @Res() res: Response,
  ) {
    const email = await this.emailsService.getEmailById(id);
    if (!email) {
      throw new NotFoundException('E-Mail nicht gefunden');
    }

    if (!email.attachments || index >= email.attachments.length) {
      throw new NotFoundException('Anhang nicht gefunden');
    }

    const attachmentMeta = email.attachments[index];
    
    try {
      const attachmentData = await this.emailsService.getAttachmentContent(
        email,
        index,
      );

      if (!attachmentData) {
        throw new NotFoundException('Anhang konnte nicht geladen werden');
      }

      // Set headers for download/preview
      res.setHeader('Content-Type', attachmentMeta.contentType);
      res.setHeader('Content-Length', attachmentData.length);
      
      // For images and PDFs, allow inline display; others force download
      const isPreviewable = 
        attachmentMeta.contentType.startsWith('image/') || 
        attachmentMeta.contentType === 'application/pdf';
      
      res.setHeader(
        'Content-Disposition',
        `${isPreviewable ? 'inline' : 'attachment'}; filename="${encodeURIComponent(attachmentMeta.filename)}"`,
      );

      res.send(attachmentData);
    } catch (error) {
      throw new NotFoundException('Fehler beim Laden des Anhangs');
    }
  }

  // ==================== AI PROCESSING ====================
  // NOTE: These routes MUST be defined BEFORE the generic /:id route!

  /**
   * GET /emails/ai/status - Get AI processing status (DB + background state)
   */
  @Get('ai/status')
  async getAiStatus() {
    const dbStatus = await this.emailsService.getAiStatus();
    const bgStatus = this.emailsService.getProcessingStatus();
    return {
      ...dbStatus,
      isProcessing: bgStatus.isProcessing,
      bgTotal: bgStatus.total,
      bgProcessed: bgStatus.processed,
      bgFailed: bgStatus.failed,
      bgMode: bgStatus.mode,
      bgStartedAt: bgStatus.startedAt,
    };
  }

  /**
   * GET /emails/ai/processing-status - Lightweight polling endpoint for background processing
   */
  @Get('ai/processing-status')
  getProcessingStatus() {
    return this.emailsService.getProcessingStatus();
  }

  /**
   * POST /emails/ai/process - Start background processing for unprocessed emails
   */
  @Post('ai/process')
  async processAllWithAi() {
    return this.emailsService.startBackgroundProcessing('process');
  }

  /**
   * POST /emails/ai/recalculate - Start background recalculation for ALL inbox emails
   */
  @Post('ai/recalculate')
  async recalculateAllWithAi() {
    return this.emailsService.startBackgroundProcessing('recalculate');
  }

  /**
   * GET /emails/ai/process-stream - SSE stream for live processing updates
   * Connects to the background processing. If processing is already running,
   * immediately sends current state. Client can disconnect/reconnect safely.
   */
  @Sse('ai/process-stream')
  processWithAiStream(): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      const bgStatus = this.emailsService.getProcessingStatus();

      // Send current state immediately on connect
      if (bgStatus.isProcessing) {
        subscriber.next({ data: { 
          type: 'reconnect', 
          total: bgStatus.total, 
          processed: bgStatus.processed,
          failed: bgStatus.failed,
          mode: bgStatus.mode,
        } } as MessageEvent);
      }

      // Subscribe to live events from background processing
      const unsubscribe = this.emailsService.addProcessingSubscriber((event) => {
        try {
          subscriber.next({ data: event } as MessageEvent);
          if (event.type === 'complete' || event.type === 'fatal-error') {
            subscriber.complete();
          }
        } catch (e) {
          // Client disconnected — fine, processing continues
        }
      });

      // Cleanup when SSE disconnects
      return () => {
        unsubscribe();
      };
    });
  }

  /**
   * GET /emails/ai/recalculate-stream - Alias for process-stream (same SSE)
   */
  @Sse('ai/recalculate-stream')
  recalculateWithAiStream(): Observable<MessageEvent> {
    return this.processWithAiStream();
  }

  // ==================== REAL-TIME EVENTS ====================

  /**
   * GET /emails/events - Global SSE stream for ALL email events
   * Frontend connects once on page load and keeps open.
   * Events: new-emails, processing-started, processing-progress, processing-complete, idle-status
   */
  @Sse('events')
  emailEventsStream(): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      // Send initial status
      const idleStatus = this.imapIdle.getStatus();
      subscriber.next({ data: { type: 'idle-status', ...idleStatus } } as MessageEvent);

      const unsubscribe = this.emailEvents.subscribe((event) => {
        try {
          subscriber.next({ data: { type: event.type, ...event.data, timestamp: event.timestamp } } as MessageEvent);
        } catch (e) {
          // Client disconnected
        }
      });

      // Send keepalive every 30s to prevent proxy timeouts
      const keepAlive = setInterval(() => {
        try {
          subscriber.next({ data: { type: 'keepalive', timestamp: new Date() } } as MessageEvent);
        } catch (e) {
          clearInterval(keepAlive);
        }
      }, 30000);

      return () => {
        unsubscribe();
        clearInterval(keepAlive);
      };
    });
  }

  // ==================== THREADING & CUSTOMER HISTORY ====================

  /**
   * GET /emails/tags - Get all unique AI tags (for filter dropdown)
   */
  @Get('tags')
  async getAvailableTags() {
    const tags = await this.emailsService.getAvailableTags();
    return { tags };
  }

  /**
   * GET /emails/idle-status - Get IMAP IDLE watcher status
   */
  @Get('idle-status')
  getIdleStatus() {
    return this.imapIdle.getStatus();
  }

  /**
   * GET /emails/thread/:id - Get all emails in the same thread
   */
  @Get('thread/:id')
  async getEmailThread(@Param('id') id: string) {
    const thread = await this.emailsService.getEmailThread(id);
    return { thread };
  }

  /**
   * GET /emails/customer-history/:address - Get email history for a sender
   */
  @Get('customer-history/:address')
  async getCustomerHistory(
    @Param('address') address: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const decodedAddress = decodeURIComponent(address);
    const history = await this.emailsService.getCustomerHistory(decodedAddress, limit);
    return { history };
  }

  /**
   * GET /emails/:id - Get a single email
   */
  @Get(':id')
  async getEmailById(@Param('id') id: string) {
    const email = await this.emailsService.getEmailById(id);
    if (!email) {
      return { error: 'E-Mail nicht gefunden' };
    }
    return email;
  }

  /**
   * POST /emails/:id/read - Mark email as read
   */
  @Post(':id/read')
  async markAsRead(@Param('id') id: string) {
    const email = await this.emailsService.markAsRead(id);
    if (!email) {
      return { error: 'E-Mail nicht gefunden' };
    }
    return email;
  }

  /**
   * POST /emails/:id/sent - Mark email as sent (after replying)
   */
  @Post(':id/sent')
  async markAsSent(
    @Param('id') id: string,
    @Body() body: { subject: string; body: string },
  ) {
    const email = await this.emailsService.markAsSent(id, body.subject, body.body);
    if (!email) {
      return { error: 'E-Mail nicht gefunden' };
    }
    return email;
  }

  /**
   * POST /emails/:id/trash - Move email to trash
   */
  @Post(':id/trash')
  async moveToTrash(@Param('id') id: string) {
    const email = await this.emailsService.moveToTrash(id);
    if (!email) {
      return { error: 'E-Mail nicht gefunden' };
    }
    return email;
  }

  /**
   * POST /emails/:id/restore - Restore email from trash
   */
  @Post(':id/restore')
  async restoreFromTrash(@Param('id') id: string) {
    const email = await this.emailsService.restoreFromTrash(id);
    if (!email) {
      return { error: 'E-Mail nicht gefunden' };
    }
    return email;
  }

  /**
   * POST /emails/:id/ai/process - Process a single email with AI
   */
  @Post(':id/ai/process')
  async processEmailWithAi(@Param('id') id: string) {
    const email = await this.emailsService.processEmailWithAi(id);
    if (!email) {
      return { error: 'E-Mail nicht gefunden oder Verarbeitung fehlgeschlagen' };
    }
    return email;
  }

  /**
   * POST /emails/:id/ai/reprocess - Reprocess a single email with AI (background, with SSE)
   * Returns immediately; live progress via /ai/process-stream SSE
   */
  @Post(':id/ai/reprocess')
  async reprocessEmailWithAi(@Param('id') id: string) {
    return this.emailsService.startSingleEmailReprocessing(id);
  }

  // ==================== EMAIL LOCKING ====================

  /**
   * POST /emails/:id/lock - Lock email for current user
   */
  @Post(':id/lock')
  async lockEmail(@Param('id') id: string, @CurrentUser() user: any) {
    return this.emailsService.lockEmail(id, user.id, user.name || user.email);
  }

  /**
   * POST /emails/:id/unlock - Unlock email
   */
  @Post(':id/unlock')
  async unlockEmail(@Param('id') id: string, @CurrentUser() user: any) {
    await this.emailsService.unlockEmail(id, user.id);
    return { unlocked: true };
  }

  // ==================== DATABASE MANAGEMENT (Admin) ====================

  /**
   * DELETE /emails/db/all - Clear ALL emails from database
   */
  @Delete('db/all')
  async clearAllEmails() {
    const result = await this.emailsService.clearAllEmails();
    return { message: `${result.deleted} E-Mails gelöscht`, ...result };
  }

  /**
   * DELETE /emails/db/inbox - Clear only inbox emails
   */
  @Delete('db/inbox')
  async clearInboxEmails() {
    const result = await this.emailsService.clearEmailsByStatus(EmailStatus.INBOX);
    return { message: `${result.deleted} Inbox-E-Mails gelöscht`, ...result };
  }

  /**
   * DELETE /emails/db/sent - Clear only sent emails
   */
  @Delete('db/sent')
  async clearSentEmails() {
    const result = await this.emailsService.clearEmailsByStatus(EmailStatus.SENT);
    return { message: `${result.deleted} gesendete E-Mails gelöscht`, ...result };
  }

  /**
   * DELETE /emails/db/trash - Clear only trashed emails
   */
  @Delete('db/trash')
  async clearTrashEmails() {
    const result = await this.emailsService.clearEmailsByStatus(EmailStatus.TRASH);
    return { message: `${result.deleted} Papierkorb-E-Mails gelöscht`, ...result };
  }

  /**
   * DELETE /emails/db/ai-data - Clear AI processing data (keeps emails)
   */
  @Delete('db/ai-data')
  async clearAiData() {
    const result = await this.emailsService.clearAiData();
    return { message: `AI-Daten von ${result.updated} E-Mails zurückgesetzt`, ...result };
  }
}
