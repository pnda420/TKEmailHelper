import { Injectable, Logger, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
const MailComposer = require('nodemailer/lib/mail-composer');
import OpenAI from 'openai';
import { EmailTemplate } from './email-templates.entity';
import { User } from '../users/users.entity';
import { Mailbox } from '../mailboxes/mailbox.entity';
import { AI_MODELS } from '../config/ai-models.config';
import { AiUsageService } from '../ai-usage/ai-usage.service';
import { AiConfigService } from '../ai-config/ai-config.service';
import { EmailsService } from '../emails/emails.service';
import { MailboxesService } from '../mailboxes/mailboxes.service';
import {
  PROMPT_GENERATE_REPLY,
  PROMPT_REVISE_REPLY,
  PROMPT_ANALYZE_EMAIL,
  PROMPT_SUMMARIZE_EMAIL,
  PROMPT_RECOMMEND_TEMPLATE,
  resolvePromptVars,
} from '../ai-config/prompts';

export interface CreateTemplateDto {
  name: string;
  subject?: string;
  body: string;
  category?: string;
}

export interface UpdateTemplateDto {
  name?: string;
  subject?: string;
  body?: string;
  category?: string;
  isActive?: boolean;
}

export interface GenerateEmailDto {
  originalEmail: {
    subject: string;
    from: string;
    body: string;
  };
  instructions?: string; // Additional instructions for GPT
  tone?: 'professional' | 'friendly' | 'formal' | 'casual';
  templateId?: string; // Optional: Use template as base
}

export interface ReviseEmailDto {
  originalEmail: {
    subject: string;
    from: string;
    body: string;
  };
  originalReply: string;      // The original AI-generated reply
  editedReply: string;        // The user's edited version
  revisionInstructions: string; // Additional TTS/text instructions
  tone?: 'professional' | 'friendly' | 'formal' | 'casual';
  currentSubject?: string;
}

export interface SendReplyDto {
  to: string;
  subject: string;
  body: string;
  mailboxId?: string; // Which mailbox to send from (uses its SMTP config + signature)
  emailId?: string; // DB id of the original email (to mark as sent + move on IMAP)
  inReplyTo?: string; // Original message ID for threading
  references?: string; // Full References header chain
  originalFrom?: string; // Original sender (for quote header)
  originalDate?: string; // Original date (for quote header)
  originalHtmlBody?: string; // Original HTML body (for quoting)
  originalTextBody?: string; // Original text body (for quoting)
}

@Injectable()
export class EmailTemplatesService {
  private readonly logger = new Logger(EmailTemplatesService.name);
  private openai: OpenAI;
  private transporter: nodemailer.Transporter;

  constructor(
    @InjectRepository(EmailTemplate)
    private templateRepository: Repository<EmailTemplate>,
    private configService: ConfigService,
    private aiUsageService: AiUsageService,
    private aiConfigService: AiConfigService,
    @Inject(forwardRef(() => EmailsService))
    private emailsService: EmailsService,
    private mailboxesService: MailboxesService,
  ) {
    // Initialize OpenAI
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });

    // Initialize legacy SMTP transporter (fallback when no mailbox specified)
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('MAIL_AUSGANG'),
      port: 587,
      secure: false, // TLS
      auth: {
        user: this.configService.get<string>('MAIL'),
        pass: this.configService.get<string>('MAIL_PASS'),
      },
    });
  }

  /**
   * Create SMTP transporter for a specific mailbox
   */
  private createTransporterForMailbox(mailbox: Mailbox): nodemailer.Transporter {
    return nodemailer.createTransport({
      host: mailbox.smtpHost,
      port: mailbox.smtpPort || 587,
      secure: mailbox.smtpSecure || false,
      auth: {
        user: mailbox.email,
        pass: mailbox.password,
      },
    });
  }

  // ==================== TEMPLATE CRUD ====================

  async createTemplate(dto: CreateTemplateDto): Promise<EmailTemplate> {
    const template = this.templateRepository.create(dto);
    return this.templateRepository.save(template);
  }

  async getAllTemplates(): Promise<EmailTemplate[]> {
    return this.templateRepository.find({
      where: { isActive: true },
      order: { usageCount: 'DESC', name: 'ASC' },
    });
  }

  async getTemplateById(id: string): Promise<EmailTemplate> {
    const template = await this.templateRepository.findOne({ where: { id } });
    if (!template) {
      throw new NotFoundException('Template nicht gefunden');
    }
    return template;
  }

  async updateTemplate(id: string, dto: UpdateTemplateDto): Promise<EmailTemplate> {
    await this.templateRepository.update(id, dto);
    return this.getTemplateById(id);
  }

  async deleteTemplate(id: string): Promise<void> {
    await this.templateRepository.update(id, { isActive: false });
  }

  async incrementUsage(id: string): Promise<void> {
    await this.templateRepository.increment({ id }, 'usageCount', 1);
  }

  // ==================== GPT EMAIL GENERATION ====================

  /**
   * Get plain-text signature for AI context.
   * Prefers mailbox-based signature, falls back to env variables.
   */
  private getSignature(user?: User, mailbox?: Mailbox): string {
    if (mailbox) {
      return this.mailboxesService.getPlainSignature(mailbox, user);
    }
    // Legacy fallback
    const name = user?.signatureName || this.configService.get<string>('MAIL_SIGNATURE_NAME') || '';
    const position = user?.signaturePosition || this.configService.get<string>('MAIL_SIGNATURE_POSITION') || '';
    const company = this.configService.get<string>('MAIL_SIGNATURE_COMPANY') || '';
    const phone = this.configService.get<string>('MAIL_SIGNATURE_PHONE') || '';
    const website = this.configService.get<string>('MAIL_SIGNATURE_WEBSITE') || '';

    const parts = [];
    if (name) parts.push(name);
    if (position) parts.push(position);
    if (company) parts.push(company);
    if (phone) parts.push(`Tel: ${phone}`);
    if (website) parts.push(website);

    return parts.length > 0 ? '\n\n--\n' + parts.join('\n') : '';
  }

  async generateEmailWithGPT(dto: GenerateEmailDto, user?: User): Promise<{ subject: string; body: string }> {
    const { originalEmail, instructions, tone = 'professional', templateId } = dto;

    let baseContent = '';
    if (templateId) {
      const template = await this.getTemplateById(templateId);
      baseContent = `\n\nVerwende dieses Template als Basis:\n${template.body}`;
      await this.incrementUsage(templateId);
    }

    const toneDescriptions = {
      professional: 'professionell und sachlich',
      friendly: 'freundlich und persönlich',
      formal: 'sehr formell und höflich',
      casual: 'locker und ungezwungen',
    };

    // Use hardcoded prompt with tone variable replacement + reply rules from DB
    let systemPrompt = resolvePromptVars(PROMPT_GENERATE_REPLY, {
      tone: toneDescriptions[tone],
    });

    // Append reply rules if any exist
    const replyRules = await this.aiConfigService.getReplyRules();
    if (replyRules.length > 0) {
      systemPrompt += `\n\nZUSÄTZLICHE REGELN (müssen IMMER beachtet werden):\n${replyRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`;
    }

    const userPrompt = `Original E-Mail:
Von: ${originalEmail.from}
Betreff: ${originalEmail.subject}
Inhalt:
${originalEmail.body}

${instructions ? `Zusätzliche Anweisungen: ${instructions}` : ''}${baseContent}

Bitte schreibe eine passende Antwort.`;

    try {
      const callStart = Date.now();
      const response = await this.openai.chat.completions.create({
        model: AI_MODELS.powerful,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      });

      // Track usage
      const usage = response.usage;
      if (usage) {
        this.aiUsageService.track({
          feature: 'generate-email',
          model: AI_MODELS.powerful,
          userId: user?.id,
          userEmail: user?.email,
          promptTokens: usage.prompt_tokens || 0,
          completionTokens: usage.completion_tokens || 0,
          totalTokens: usage.total_tokens || 0,
          durationMs: Date.now() - callStart,
          context: originalEmail.subject?.substring(0, 200),
        }).catch(() => {});
      }

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Keine Antwort von GPT erhalten');
      }

      const parsed = JSON.parse(content);
      return {
        subject: parsed.subject || `Re: ${originalEmail.subject}`,
        body: parsed.body || '',
      };
    } catch (error) {
      this.logger.error('GPT generation error:', error);
      throw new Error('Fehler bei der E-Mail-Generierung');
    }
  }

  // ==================== GPT EMAIL REVISION ====================

  async reviseEmailWithGPT(dto: ReviseEmailDto, user?: User): Promise<{ subject: string; body: string }> {
    const { originalEmail, originalReply, editedReply, revisionInstructions, tone = 'professional', currentSubject } = dto;

    const toneDescriptions = {
      professional: 'professionell und sachlich',
      friendly: 'freundlich und persönlich',
      formal: 'sehr formell und höflich',
      casual: 'locker und ungezwungen',
    };

    let systemPrompt = resolvePromptVars(PROMPT_REVISE_REPLY, {
      tone: toneDescriptions[tone],
    });

    // Append reply rules if any exist
    const replyRules = await this.aiConfigService.getReplyRules();
    if (replyRules.length > 0) {
      systemPrompt += `\n\nZUSÄTZLICHE REGELN (müssen IMMER beachtet werden):\n${replyRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`;
    }

    const hasUserEdits = originalReply.trim() !== editedReply.trim();

    let userPrompt = `Ursprüngliche Kunden-E-Mail:
Von: ${originalEmail.from}
Betreff: ${originalEmail.subject}
Inhalt:
${originalEmail.body}

--- ORIGINALE KI-ANTWORT ---
${originalReply}
--- ENDE ORIGINALE KI-ANTWORT ---
`;

    if (hasUserEdits) {
      userPrompt += `
--- VOM NUTZER BEARBEITETE VERSION ---
${editedReply}
--- ENDE BEARBEITUNG ---

Der Nutzer hat manuelle Änderungen vorgenommen. Diese Änderungen sollen respektiert werden.
`;
    }

    if (revisionInstructions.trim()) {
      userPrompt += `
Zusätzliche Anweisungen des Nutzers:
${revisionInstructions}
`;
    }

    userPrompt += '\nBitte überarbeite die Antwort entsprechend.';

    try {
      const callStart = Date.now();
      const response = await this.openai.chat.completions.create({
        model: AI_MODELS.fast,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      });

      const usage = response.usage;
      if (usage) {
        this.aiUsageService.track({
          feature: 'revise-email',
          model: AI_MODELS.fast,
          userId: user?.id,
          userEmail: user?.email,
          promptTokens: usage.prompt_tokens || 0,
          completionTokens: usage.completion_tokens || 0,
          totalTokens: usage.total_tokens || 0,
          durationMs: Date.now() - callStart,
          context: originalEmail.subject?.substring(0, 200),
        }).catch(() => {});
      }

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Keine Antwort von GPT erhalten');
      }

      const parsed = JSON.parse(content);
      return {
        subject: parsed.subject || currentSubject || `Re: ${originalEmail.subject}`,
        body: parsed.body || '',
      };
    } catch (error) {
      this.logger.error('GPT revision error:', error);
      throw new Error('Fehler bei der E-Mail-Überarbeitung');
    }
  }

  // ==================== SEND EMAIL ====================

  /**
   * Get the real HTML email signature.
   * Uses mailbox-based signature template (with user placeholders resolved).
   */
  private getRealSignatureHtml(user?: User, mailbox?: Mailbox): string {
    if (mailbox && mailbox.signatureTemplate) {
      const resolved = this.mailboxesService.resolveSignature(mailbox, user);
      return `<br><br>${resolved}`;
    }
    return '';
  }

  /**
   * Convert plain text body to HTML with proper line breaks
   */
  private textToHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async sendReply(dto: SendReplyDto, user?: User, files?: Express.Multer.File[]): Promise<{ success: boolean; messageId?: string }> {
    // Resolve mailbox (from DTO or from the email's stored mailboxId)
    let mailbox: Mailbox | null = null;
    if (dto.mailboxId) {
      mailbox = await this.mailboxesService.findOne(dto.mailboxId).catch(() => null);
    } else if (dto.emailId) {
      // Try to get the mailboxId from the original email
      const email = await this.emailsService.getEmailById(dto.emailId);
      if (email?.mailboxId) {
        mailbox = await this.mailboxesService.findOne(email.mailboxId).catch(() => null);
      }
    }

    const mailFrom = mailbox?.email || this.configService.get<string>('MAIL');
    const senderName = mailbox?.companyName || user?.signatureName || this.configService.get<string>('COMPANY_NAME') || 'Email Helper';
    const activeTransporter = mailbox ? this.createTransporterForMailbox(mailbox) : this.transporter;

    // Build HTML version with real signature
    const bodyHtml = this.textToHtml(dto.body);
    const signatureHtml = this.getRealSignatureHtml(user, mailbox);

    // Build quoted original email (like Outlook reply)
    let quotedOriginalHtml = '';
    if (dto.originalHtmlBody || dto.originalTextBody) {
      const originalDate = dto.originalDate
        ? new Date(dto.originalDate).toLocaleString('de-DE', { dateStyle: 'full', timeStyle: 'short' })
        : '';
      const originalFrom = dto.originalFrom || dto.to;

      quotedOriginalHtml = `
<br><br>
<div style="border-left: 2px solid #1565c0; padding-left: 12px; margin-left: 0; color: #555;">
  <p style="margin: 0 0 8px 0; font-size: 13px; color: #666;">
    <b>Von:</b> ${this.escapeHtml(originalFrom)}<br>
    <b>Gesendet:</b> ${originalDate}<br>
    <b>Betreff:</b> ${this.escapeHtml(dto.subject?.replace(/^Re:\s*/i, '') || '')}
  </p>
  ${dto.originalHtmlBody || this.textToHtml(dto.originalTextBody || '')}
</div>`;
    }

    // Build References header chain (for proper threading)
    let referencesChain = '';
    if (dto.references && dto.inReplyTo) {
      // Append the original message ID to the existing chain
      referencesChain = dto.references.includes(dto.inReplyTo)
        ? dto.references
        : `${dto.references} ${dto.inReplyTo}`;
    } else if (dto.inReplyTo) {
      referencesChain = dto.inReplyTo;
    }

    const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.5;">
${bodyHtml}
${signatureHtml}
${quotedOriginalHtml}
</body>
</html>`;

    // Build plain text with quoted original
    let fullText = dto.body;
    if (dto.originalTextBody) {
      const originalDate = dto.originalDate
        ? new Date(dto.originalDate).toLocaleString('de-DE', { dateStyle: 'full', timeStyle: 'short' })
        : '';
      fullText += `\n\n-------- Ursprüngliche Nachricht --------\nVon: ${dto.originalFrom || dto.to}\nGesendet: ${originalDate}\nBetreff: ${dto.subject?.replace(/^Re:\s*/i, '') || ''}\n\n${dto.originalTextBody}`;
    }

    try {
      const mailOptions: any = {
        from: `"${senderName}" <${mailFrom}>`,
        to: dto.to,
        subject: dto.subject,
        text: fullText,
        html: fullHtml,
        inReplyTo: dto.inReplyTo,
        references: referencesChain || undefined,
      };

      // Attach uploaded files if any
      if (files?.length) {
        mailOptions.attachments = files.map((file) => ({
          filename: file.originalname,
          content: file.buffer,
          contentType: file.mimetype,
        }));
      }

      const info = await activeTransporter.sendMail(mailOptions);
      this.logger.log(`Email sent: ${info.messageId}`);

      // Build raw MIME message and append to IMAP Sent folder (non-blocking)
      try {
        const rawMailOptions = {
          ...mailOptions,
          messageId: info.messageId,
        };
        const composer = new MailComposer(rawMailOptions);
        const message = composer.compile();
        const rawMessage: string = await new Promise((resolve, reject) => {
          message.build((err: Error | null, buf: Buffer) => {
            if (err) return reject(err);
            resolve(buf.toString('utf-8'));
          });
        });
        const appended = await this.emailsService.appendToSentFolder(rawMessage);
        this.logger.log(`Append to sent folder: ${appended ? 'success' : 'failed'}`);
      } catch (appendErr) {
        this.logger.warn('Could not append to sent folder (email was still sent):', appendErr?.message || appendErr);
      }

      // Mark email as sent in DB + move original on IMAP (AI-INBOX → AI-DONE)
      if (dto.emailId) {
        try {
          await this.emailsService.markAsSent(dto.emailId, dto.subject, dto.body);
          this.logger.log(`Email ${dto.emailId} marked as sent and moved to DONE folder`);
        } catch (markErr) {
          this.logger.warn('Could not mark email as sent (email was still sent):', markErr?.message || markErr);
        }
      }

      return { success: true, messageId: info.messageId };
    } catch (error) {
      this.logger.error('Send email error:', error);
      throw new Error('Fehler beim Senden der E-Mail');
    }
  }

  // ==================== AI EMAIL SUMMARY ====================

  /**
   * Extract the main/current message from an email, removing quote chains
   */
  extractMainContent(body: string): string {
    if (!body) return '';
    
    // Common reply chain patterns to remove
    const replyPatterns = [
      // German patterns
      /(?:^|\n)[-_]+\s*(?:Ursprüngliche Nachricht|Original Message|Von:|From:)[\s\S]*/im,
      /(?:^|\n)Am\s+\d+[\.\-\/]\d+[\.\-\/]\d+.*schrieb.*:[\s\S]*/im,
      /(?:^|\n)Von:.*\nGesendet:.*\nAn:.*\n(?:Cc:.*\n)?Betreff:[\s\S]*/im,
      // English patterns  
      /(?:^|\n)On\s+.*\d{4}.*wrote:[\s\S]*/im,
      /(?:^|\n)From:.*\nSent:.*\nTo:.*\n(?:Cc:.*\n)?Subject:[\s\S]*/im,
      // Generic quote markers
      /(?:^|\n)>{2,}[\s\S]*/m,
      // Outlook style separators
      /(?:^|\n)_{10,}[\s\S]*/m,
      /(?:^|\n)-{10,}[\s\S]*/m,
    ];

    let cleaned = body;
    for (const pattern of replyPatterns) {
      cleaned = cleaned.replace(pattern, '');
    }

    // Also clean up excessive whitespace and trim
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
    
    return cleaned || body.substring(0, 500); // Fallback to first 500 chars if all removed
  }

  /**
   * Perform full AI analysis on an email in ONE API call
   * Returns: summary, tags, recommended template, and cleaned body
   */
  async analyzeEmail(emailSubject: string, emailBody: string): Promise<{
    summary: string;
    tags: string[];
    cleanedBody: string;
    recommendedTemplateId: string | null;
    recommendedTemplateReason: string;
  }> {
    // First extract the main content
    const cleanedBody = this.extractMainContent(emailBody);
    
    // Get all templates for recommendation
    const templates = await this.getAllTemplates();
    
    const templateList = templates.length > 0 
      ? templates.map((t, i) => `${i + 1}. ID: ${t.id} | "${t.name}" (${t.category || 'Allgemein'}): ${t.body.substring(0, 150)}...`).join('\n')
      : 'Keine Vorlagen verfügbar';

    // Use hardcoded prompt + append dynamic template list
    let systemPrompt = PROMPT_ANALYZE_EMAIL;
    if (templates.length > 0) {
      systemPrompt += `\n\nVerfügbare Vorlagen:\n${templateList}`;
    }

    const userPrompt = `E-Mail analysieren (inkl. aller Reply-Nachrichten):
Betreff: ${emailSubject}

Vollständiger Inhalt:
${emailBody}`;

    const MAX_RETRIES = 2;
    let lastError: string = 'Unbekannter Fehler';

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const callStart = Date.now();
        this.logger.debug(`analyzeEmail attempt ${attempt}/${MAX_RETRIES} for: ${emailSubject?.substring(0, 80)}`);
        
        const response = await this.openai.chat.completions.create({
          model: AI_MODELS.fast,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_completion_tokens: 2000,
          response_format: { type: 'json_object' },
        });

        // Track usage
        const usage = response.usage;
        if (usage) {
          this.aiUsageService.track({
            feature: 'analyze-email-for-reply',
            model: AI_MODELS.fast,
            promptTokens: usage.prompt_tokens || 0,
            completionTokens: usage.completion_tokens || 0,
            totalTokens: usage.total_tokens || 0,
            durationMs: Date.now() - callStart,
            context: emailSubject?.substring(0, 200),
          }).catch(() => {});
        }

        // Check for truncation
        const finishReason = response.choices[0]?.finish_reason;
        if (finishReason === 'length') {
          this.logger.warn(`analyzeEmail: Response truncated (finish_reason=length) for "${emailSubject}" — attempt ${attempt}`);
          lastError = 'Antwort wurde abgeschnitten (Token-Limit)';
          if (attempt < MAX_RETRIES) continue; // Retry
        }

        const content = response.choices[0]?.message?.content?.trim();
        if (!content) {
          this.logger.warn(`analyzeEmail: Empty response content for "${emailSubject}" (finish_reason=${finishReason})`);
          lastError = 'Leere Antwort vom AI-Modell';
          if (attempt < MAX_RETRIES) continue; // Retry
        }

        if (content) {
          try {
            const parsed = JSON.parse(content);
            this.logger.debug(`analyzeEmail: Success for "${emailSubject}" — summary: ${parsed.summary?.substring(0, 50)}`);
            return {
              summary: parsed.summary || 'Keine Zusammenfassung',
              tags: Array.isArray(parsed.tags) ? parsed.tags : [],
              cleanedBody: parsed.cleanedContent || cleanedBody,
              recommendedTemplateId: parsed.templateId || null,
              recommendedTemplateReason: parsed.templateReason || '',
            };
          } catch (parseError) {
            this.logger.error(`analyzeEmail: JSON parse failed for "${emailSubject}" — content (first 500 chars): ${content.substring(0, 500)}`);
            lastError = `JSON-Parse-Fehler: ${parseError.message}`;
            if (attempt < MAX_RETRIES) continue; // Retry
          }
        }
      } catch (error) {
        const errMsg = error?.message || String(error);
        const statusCode = error?.status || error?.statusCode || 'N/A';
        this.logger.error(`analyzeEmail: API error (attempt ${attempt}/${MAX_RETRIES}, status=${statusCode}) for "${emailSubject}": ${errMsg}`);
        lastError = `API-Fehler (${statusCode}): ${errMsg.substring(0, 200)}`;
        
        // Don't retry on auth/model errors (4xx), only on transient errors (5xx, timeout)
        if (error?.status && error.status >= 400 && error.status < 500) {
          this.logger.error(`analyzeEmail: Non-retryable error (${error.status}), giving up`);
          break;
        }
        
        if (attempt < MAX_RETRIES) {
          // Wait before retry (exponential backoff)
          const waitMs = attempt * 2000;
          this.logger.warn(`analyzeEmail: Retrying in ${waitMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitMs));
        }
      }
    }
    
    this.logger.error(`analyzeEmail: All attempts failed for "${emailSubject}" — ${lastError}`);
    return {
      summary: `Analyse fehlgeschlagen: ${lastError.substring(0, 80)}`,
      tags: [],
      cleanedBody,
      recommendedTemplateId: null,
      recommendedTemplateReason: '',
    };
  }

  async summarizeEmail(emailSubject: string, emailBody: string): Promise<{ summary: string; tags: string[] }> {
    const systemPrompt = PROMPT_SUMMARIZE_EMAIL;

    const userPrompt = `E-Mail:
Betreff: ${emailSubject}
Inhalt:
${emailBody.substring(0, 1500)}`;

    try {
      const callStart = Date.now();
      const response = await this.openai.chat.completions.create({
        model: AI_MODELS.fast,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_completion_tokens: 150,
        response_format: { type: 'json_object' },
      });

      // Track usage
      const usage = response.usage;
      if (usage) {
        this.aiUsageService.track({
          feature: 'summarize-email',
          model: AI_MODELS.fast,
          promptTokens: usage.prompt_tokens || 0,
          completionTokens: usage.completion_tokens || 0,
          totalTokens: usage.total_tokens || 0,
          durationMs: Date.now() - callStart,
          context: emailSubject?.substring(0, 200),
        }).catch(() => {});
      }

      const content = response.choices[0]?.message?.content?.trim();
      if (content) {
        const parsed = JSON.parse(content);
        return { 
          summary: parsed.summary || 'Zusammenfassung nicht verfügbar',
          tags: parsed.tags || []
        };
      }
      return { summary: 'Zusammenfassung nicht verfügbar', tags: [] };
    } catch (error) {
      this.logger.error('Email summary error:', error);
      return { summary: 'Zusammenfassung konnte nicht erstellt werden', tags: [] };
    }
  }

  // ==================== AI TEMPLATE RECOMMENDATION ====================

  async recommendTemplate(emailSubject: string, emailBody: string): Promise<{
    templateId: string | null;
    templateName: string | null;
    reason: string;
    confidence: number;
  }> {
    // Get all active templates
    const templates = await this.getAllTemplates();
    
    if (templates.length === 0) {
      return {
        templateId: null,
        templateName: null,
        reason: 'Keine Vorlagen verfügbar',
        confidence: 0,
      };
    }

    // Build template summary for AI
    const templateSummary = templates.map((t, i) => 
      `${i + 1}. ID: ${t.id} | Name: "${t.name}" | Kategorie: ${t.category || 'Keine'} | Inhalt: ${t.body.substring(0, 200)}...`
    ).join('\n');

    const systemPrompt = PROMPT_RECOMMEND_TEMPLATE;

    const userPrompt = `Eingehende E-Mail:
Betreff: ${emailSubject}
Inhalt:
${emailBody.substring(0, 1000)}

Verfügbare Vorlagen:
${templateSummary}

Welche Vorlage passt am besten?`;

    try {
      const callStart = Date.now();
      const response = await this.openai.chat.completions.create({
        model: AI_MODELS.fast,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      });

      // Track usage
      const rUsage = response.usage;
      if (rUsage) {
        this.aiUsageService.track({
          feature: 'recommend-template',
          model: AI_MODELS.fast,
          promptTokens: rUsage.prompt_tokens || 0,
          completionTokens: rUsage.completion_tokens || 0,
          totalTokens: rUsage.total_tokens || 0,
          durationMs: Date.now() - callStart,
          context: emailSubject?.substring(0, 200),
        }).catch(() => {});
      }

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Keine Antwort von GPT erhalten');
      }

      const parsed = JSON.parse(content);
      
      // Find the template name if we have an ID
      let templateName: string | null = null;
      if (parsed.templateId) {
        const template = templates.find(t => t.id === parsed.templateId);
        templateName = template?.name || null;
      }

      return {
        templateId: parsed.templateId || null,
        templateName,
        reason: parsed.reason || 'KI-Empfehlung',
        confidence: parsed.confidence || 0,
      };
    } catch (error) {
      this.logger.error('Template recommendation error:', error);
      return {
        templateId: null,
        templateName: null,
        reason: 'Fehler bei der Analyse',
        confidence: 0,
      };
    }
  }
}
