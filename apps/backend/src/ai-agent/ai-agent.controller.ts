import {
  Controller,
  Get,
  Query,
  Sse,
  UseGuards,
  Logger,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { AiAgentService, AnalysisStep } from './ai-agent.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EmailsService } from '../emails/emails.service';

interface MessageEvent {
  data: string | object;
}

@Controller('api/ai')
@UseGuards(JwtAuthGuard)
export class AiAgentController {
  private readonly logger = new Logger(AiAgentController.name);

  constructor(
    private readonly aiAgent: AiAgentService,
    private readonly emailsService: EmailsService,
  ) {}

  /**
   * GET /api/ai/analyze?emailId=xxx – SSE-Stream: Analysiert eine E-Mail mit dem KI-Agenten.
   * Sendet live Tool-Call-Steps ans Frontend.
   * Verwendet GET statt POST, da NestJS @Sse() nur mit GET funktioniert.
   * Auth-Token wird als Query-Parameter oder Authorization-Header übergeben.
   */
  @Get('analyze')
  @Sse()
  analyzeEmail(@Query('emailId') emailId: string, @Req() req: any): Observable<MessageEvent> {
    if (!emailId) {
      throw new BadRequestException('emailId ist erforderlich');
    }

    return new Observable((subscriber) => {
      (async () => {
        try {
          // E-Mail aus Datenbank laden
          const email = await this.emailsService.getEmailById(emailId);
          if (!email) {
            subscriber.next({
              data: JSON.stringify({
                type: 'error',
                content: 'E-Mail nicht gefunden',
                status: 'error',
              }),
            });
            subscriber.complete();
            return;
          }

          const textBody =
            email.textBody ||
            email.htmlBody?.replace(/<[^>]*>/g, ' ') ||
            email.preview ||
            '';

          // Detect inline images from HTML (cid: references, data:image, or <img> tags)
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
            textBody,
            attachments: attachmentInfo,
            inlineImages,
          };

          // Start-Event senden
          subscriber.next({
            data: JSON.stringify({
              type: 'start',
              content: `Analyse startet für: ${email.subject}`,
              status: 'running',
            }),
          });

          // Analyse mit Live-Steps
          const userInfo = req.user ? { userId: req.user.id, userEmail: req.user.email } : undefined;
          const finalResponse = await this.aiAgent.analyzeEmail(
            emailData,
            (step: AnalysisStep) => {
              subscriber.next({ data: JSON.stringify(step) });
            },
            userInfo,
          );

          // End-Event (redundant, da analyzeEmail schon 'complete' sendet)
          subscriber.complete();
        } catch (error) {
          this.logger.error(`Analysis failed: ${error.message}`);
          subscriber.next({
            data: JSON.stringify({
              type: 'error',
              content: `Analyse fehlgeschlagen: ${error.message}`,
              status: 'error',
            }),
          });
          subscriber.complete();
        }
      })();
    });
  }
}
