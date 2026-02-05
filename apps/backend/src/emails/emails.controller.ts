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
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
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
}
