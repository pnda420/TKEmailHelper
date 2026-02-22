import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Sse,
  MessageEvent,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SpamKillerService, SpamScanResult, SpamScanEmail } from './spam-killer.service';
import { SpamKillerEventsService } from './spam-killer-events.service';
import { MailboxesService } from '../mailboxes/mailboxes.service';
import { Observable, Subject } from 'rxjs';

@Controller('spam-killer')
@UseGuards(JwtAuthGuard)
export class SpamKillerController {
  constructor(
    private readonly spamKillerService: SpamKillerService,
    private readonly spamKillerEvents: SpamKillerEventsService,
    private readonly mailboxesService: MailboxesService,
  ) {}

  /**
   * POST /spam-killer/scan/:mailboxId
   * Scans a mailbox for spam emails using AI classification.
   * Returns full scan result with all classified emails.
   */
  @Post('scan/:mailboxId')
  async scanMailbox(
    @Param('mailboxId') mailboxId: string,
    @CurrentUser() user: any,
  ): Promise<SpamScanResult> {
    return this.spamKillerService.scanMailbox(
      mailboxId,
      undefined,
      { userId: user.id, userEmail: user.email },
    );
  }

  /**
   * SSE /spam-killer/scan-live/:mailboxId
   * Live scanning with progress updates via Server-Sent Events.
   */
  @Sse('scan-live/:mailboxId')
  scanMailboxLive(
    @Param('mailboxId') mailboxId: string,
    @CurrentUser() user: any,
  ): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();

    // Send immediate start event so frontend knows we're working
    subject.next({
      data: JSON.stringify({ type: 'started' }),
    });

    // Start scan in background
    this.spamKillerService.scanMailbox(
      mailboxId,
      (scanned, total) => {
        subject.next({
          data: JSON.stringify({ type: 'progress', scanned, total }),
        });
      },
      { userId: user.id, userEmail: user.email },
    ).then((result) => {
      subject.next({
        data: JSON.stringify({ type: 'complete', result }),
      });
      subject.complete();
    }).catch((err) => {
      subject.next({
        data: JSON.stringify({ type: 'error', message: err.message }),
      });
      subject.complete();
    });

    return subject.asObservable();
  }

  /**
   * DELETE /spam-killer/delete/:mailboxId
   * Deletes specified emails by UID from the mailbox INBOX via IMAP.
   * Logs deletion to spam_deletion_logs table.
   */
  @Delete('delete/:mailboxId')
  async deleteEmails(
    @Param('mailboxId') mailboxId: string,
    @Body() body: { uids: number[] },
    @CurrentUser() user: any,
  ): Promise<{ deleted: number; failed: number }> {
    return this.spamKillerService.deleteEmails(mailboxId, body.uids, {
      userId: user.id,
      userEmail: user.email,
    });
  }

  /**
   * GET /spam-killer/deletion-logs/:mailboxId
   * Returns deletion log entries for a specific mailbox.
   */
  @Get('deletion-logs/:mailboxId')
  async getDeletionLogs(
    @Param('mailboxId') mailboxId: string,
    @Query('limit') limit?: string,
  ) {
    return this.spamKillerService.getDeletionLogs(mailboxId, parseInt(limit || '50', 10));
  }

  /**
   * GET /spam-killer/deletion-logs
   * Returns deletion log entries across all user's mailboxes.
   */
  @Get('deletion-logs')
  async getAllDeletionLogs(
    @CurrentUser() user: any,
    @Query('limit') limit?: string,
  ) {
    const userMailboxes = await this.mailboxesService.getMailboxesForUser(user.id);
    const mailboxIds = userMailboxes.map(um => um.mailboxId);
    return this.spamKillerService.getDeletionLogsForMailboxes(mailboxIds, parseInt(limit || '50', 10));
  }

  /**
   * GET /spam-killer/deletion-history
   * Paginated deletion history with search & filters for the dedicated page.
   */
  @Get('deletion-history')
  async getDeletionHistory(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('search') search?: string,
    @Query('userEmail') userEmail?: string,
    @Query('mailboxId') mailboxId?: string,
    @Query('category') category?: string,
  ) {
    return this.spamKillerService.getDeletionHistory({
      limit: parseInt(limit || '30', 10),
      offset: parseInt(offset || '0', 10),
      search,
      userEmail,
      mailboxId,
      category,
    });
  }

  /**
   * GET /spam-killer/deletion-users
   * Returns distinct user emails that have performed deletions (for filter dropdown).
   */
  @Get('deletion-users')
  async getDeletionUsers() {
    return this.spamKillerService.getDeletionUsers();
  }

  /**
   * GET /spam-killer/email-body/:mailboxId/:uid
   * Returns the full email body text from DB cache.
   */
  @Get('email-body/:mailboxId/:uid')
  async getEmailBody(
    @Param('mailboxId') mailboxId: string,
    @Param('uid') uid: string,
  ): Promise<{ bodyText: string }> {
    return this.spamKillerService.getEmailBody(mailboxId, parseInt(uid, 10));
  }

  /**
   * GET /spam-killer/results/:mailboxId
   * Returns cached scan results from DB (no new scan).
   */
  @Get('results/:mailboxId')
  async getCachedResults(
    @Param('mailboxId') mailboxId: string,
  ): Promise<SpamScanResult | null> {
    return this.spamKillerService.getCachedResults(mailboxId);
  }

  /**
   * GET /spam-killer/counts
   * Returns flagged email counts per mailbox for the current user (for header badge).
   */
  @Get('counts')
  async getSpamCounts(
    @CurrentUser() user: any,
  ): Promise<Record<string, number>> {
    const userMailboxes = await this.mailboxesService.getMailboxesForUser(user.id);
    const mailboxIds = userMailboxes.map(um => um.mailboxId);
    return this.spamKillerService.getSpamCounts(mailboxIds);
  }

  /**
   * SSE /spam-killer/live
   * Persistent event stream for real-time spam-killer updates.
   * Broadcasts to all connected clients when:
   *  - counts change (scan, delete, stale cleanup)
   *  - emails are removed (deleted in Outlook, via spam-killer, or stale cleanup)
   * Frontend uses this to keep header badge + spam-killer list in sync.
   */
  @Sse('live')
  liveUpdates(): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      // Send initial keepalive so the connection is established
      subscriber.next({ data: { type: 'connected', timestamp: new Date() } } as MessageEvent);

      const unsubscribe = this.spamKillerEvents.subscribe((event) => {
        try {
          subscriber.next({
            data: { type: event.type, ...event.data, timestamp: event.timestamp },
          } as MessageEvent);
        } catch (e) {
          // Client disconnected
        }
      });

      // Keepalive every 30s to prevent proxy timeouts
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
}
