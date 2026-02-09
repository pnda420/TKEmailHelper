import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  Res,
  Sse,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import { Observable, interval, map, takeWhile, startWith, switchMap, of, concat, delay } from 'rxjs';
import { EmailsService } from './emails.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('emails')
@UseGuards(JwtAuthGuard) // All email routes require authentication
export class EmailsController {
  constructor(private readonly emailsService: EmailsService) {}

  /**
   * GET /emails - Get inbox emails with pagination
   */
  @Get()
  async getAllEmails(
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.emailsService.getAllEmails(limit, offset);
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
        email.messageId,
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
}
