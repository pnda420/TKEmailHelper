import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import OpenAI from 'openai';
import { EmailTemplate } from './email-templates.entity';
import { User } from '../users/users.entity';

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

export interface SendReplyDto {
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string; // Original message ID for threading
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
  ) {
    // Initialize OpenAI
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });

    // Initialize SMTP transporter
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
   * Get signature from user settings, fallback to env variables
   */
  private getSignature(user?: User): string {
    // Prioritize user-specific signature if available
    const name = user?.signatureName || this.configService.get<string>('MAIL_SIGNATURE_NAME') || '';
    const position = user?.signaturePosition || this.configService.get<string>('MAIL_SIGNATURE_POSITION') || '';
    const company = user?.signatureCompany || this.configService.get<string>('MAIL_SIGNATURE_COMPANY') || '';
    const phone = user?.signaturePhone || this.configService.get<string>('MAIL_SIGNATURE_PHONE') || '';
    const website = user?.signatureWebsite || this.configService.get<string>('MAIL_SIGNATURE_WEBSITE') || '';

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

    const systemPrompt = `Du bist ein professioneller E-Mail-Assistent. Schreibe Antworten auf Deutsch.
Der Ton soll ${toneDescriptions[tone]} sein.
Schreibe eine passende Antwort auf die erhaltene E-Mail.

WICHTIG: 
- Füge KEINE Signatur mit Kontaktdaten hinzu (wird automatisch vom System angehängt).
- Die E-Mail kann mit einer Grußformel wie "Mit freundlichen Grüßen" enden.
- Falls in den Anweisungen ein Name angegeben ist, verwende diesen nach der Grußformel.
- Verwende Absätze (Leerzeilen) für bessere Lesbarkeit.
- Schreibe den Text mit normalen Zeilenumbrüchen, NICHT als einen einzigen Block.

Gib die Antwort im folgenden JSON-Format zurück:
{"subject": "Betreff der Antwort", "body": "Der E-Mail-Text mit Zeilenumbrüchen (\\n) für Absätze"}
Verwende KEINE Markdown-Formatierung im Body, nur reinen Text mit Absätzen (\\n\\n für Absätze).`;

    const userPrompt = `Original E-Mail:
Von: ${originalEmail.from}
Betreff: ${originalEmail.subject}
Inhalt:
${originalEmail.body}

${instructions ? `Zusätzliche Anweisungen: ${instructions}` : ''}${baseContent}

Bitte schreibe eine passende Antwort.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' },
      });

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

  // ==================== SEND EMAIL ====================

  /**
   * Get the user's real HTML email signature (like Outlook)
   */
  private getRealSignatureHtml(user?: User): string {
    if (user?.emailSignature && user.emailSignature.trim()) {
      return `<br><br>${user.emailSignature}`;
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

  async sendReply(dto: SendReplyDto, user?: User): Promise<{ success: boolean; messageId?: string }> {
    const mailFrom = this.configService.get<string>('MAIL');
    // Use user's signature company name or fallback to company name or default
    const senderName = user?.signatureCompany || user?.signatureName || this.configService.get<string>('COMPANY_NAME') || 'Email Helper';

    // Build HTML version with real signature
    const bodyHtml = this.textToHtml(dto.body);
    const signatureHtml = this.getRealSignatureHtml(user);
    const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.5;">
${bodyHtml}
${signatureHtml}
</body>
</html>`;

    try {
      const info = await this.transporter.sendMail({
        from: `"${senderName}" <${mailFrom}>`,
        to: dto.to,
        subject: dto.subject,
        text: dto.body, // Plain text fallback
        html: fullHtml, // HTML version with signature
        inReplyTo: dto.inReplyTo,
        references: dto.inReplyTo,
      });

      this.logger.log(`Email sent: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      this.logger.error('Send email error:', error);
      throw new Error('Fehler beim Senden der E-Mail');
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

    const systemPrompt = `Du bist ein intelligenter E-Mail-Assistent. Deine Aufgabe ist es, die beste passende E-Mail-Vorlage für eine eingehende E-Mail zu finden.

Analysiere die E-Mail und wähle die am besten passende Vorlage aus der Liste.

WICHTIG:
- Wähle nur eine Vorlage, die thematisch zur E-Mail passt
- Wenn keine Vorlage gut passt, gib null zurück
- Bewerte dein Vertrauen von 0-100 (nur über 60 ist eine gute Empfehlung)

Antworte NUR mit diesem JSON-Format:
{"templateId": "die-id-oder-null", "reason": "Kurze Begründung auf Deutsch", "confidence": 0-100}`;

    const userPrompt = `Eingehende E-Mail:
Betreff: ${emailSubject}
Inhalt:
${emailBody.substring(0, 1000)}

Verfügbare Vorlagen:
${templateSummary}

Welche Vorlage passt am besten?`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3, // Lower temperature for more consistent recommendations
        response_format: { type: 'json_object' },
      });

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
