import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import OpenAI from 'openai';
import { EmailTemplate } from './email-templates.entity';
import { User } from '../users/users.entity';
import { AI_MODELS } from '../config/ai-models.config';
import { AiUsageService } from '../ai-usage/ai-usage.service';

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
    private aiUsageService: AiUsageService,
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

    const systemPrompt = `Du bist ein E-Mail-Assistent für Kundenanfragen. Analysiere die GESAMTE E-Mail inkl. Reply-Ketten und extrahiere:

1. summary: Fasse den KERN der Anfrage zusammen - was will der Kunde? (max. 100 Zeichen)
   - Bei Reply-Ketten: Fasse den gesamten Kontext zusammen, nicht nur die letzte Nachricht
   - Ignoriere Grußformeln, Signaturen, Disclaimer
   - Nur die wichtigste Information/Frage/Problem

2. tags: Genau 3 Schlagwörter für Kategorisierung (jeweils max. 12 Zeichen)

3. cleanedContent: Extrahiere NUR die Kerninhalte der E-Mail - schön formatiert:
   - Entferne: Grußformeln, Signaturen, Disclaimer, Werbung, Rechtliches
   - Entferne: Leere Zeilen, unnötige Whitespaces, Quote-Marker (>)
   - Behalte: Wichtige Infos, Fragen, Anfragen, Namen, Daten, Nummern
   - Bei Reply-Ketten: Fasse chronologisch zusammen was passiert ist
   - Format: Klar strukturiert, kurze Absätze, max 500 Zeichen

4. templateId: ID der best passenden Vorlage ODER null wenn keine passt
5. templateReason: Kurze Begründung (max. 50 Zeichen)

${templates.length > 0 ? `Verfügbare Vorlagen:\n${templateList}` : ''}

Antworte NUR mit JSON:
{"summary": "...", "tags": ["...", "...", "..."], "cleanedContent": "...", "templateId": "..." oder null, "templateReason": "..."}`;

    const userPrompt = `E-Mail analysieren (inkl. aller Reply-Nachrichten):
Betreff: ${emailSubject}

Vollständiger Inhalt:
${emailBody}`;

    try {
      const callStart = Date.now();
      const response = await this.openai.chat.completions.create({
        model: AI_MODELS.fast,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_completion_tokens: 600,
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

      const content = response.choices[0]?.message?.content?.trim();
      if (content) {
        const parsed = JSON.parse(content);
        return {
          summary: parsed.summary || 'Keine Zusammenfassung',
          tags: parsed.tags || [],
          cleanedBody: parsed.cleanedContent || cleanedBody,
          recommendedTemplateId: parsed.templateId || null,
          recommendedTemplateReason: parsed.templateReason || '',
        };
      }
    } catch (error) {
      this.logger.error('Email analysis error:', error);
    }
    
    return {
      summary: 'Analyse fehlgeschlagen',
      tags: [],
      cleanedBody,
      recommendedTemplateId: null,
      recommendedTemplateReason: '',
    };
  }

  async summarizeEmail(emailSubject: string, emailBody: string): Promise<{ summary: string; tags: string[] }> {
    const systemPrompt = `Du bist ein E-Mail-Assistent. Analysiere die E-Mail und gib zurück:
1. Eine kurze Zusammenfassung in EINEM Satz (max. 80 Zeichen)
2. Genau 3 kurze Tags/Schlagwörter die den Inhalt beschreiben (jeweils max. 15 Zeichen)

Antworte NUR mit diesem JSON-Format:
{"summary": "Die Zusammenfassung", "tags": ["Tag1", "Tag2", "Tag3"]}`;

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

    const systemPrompt = `Du bist ein intelligenter E-Mail-Assistent. Deine Aufgabe ist es, die beste passende E-Mail-Vorlage für eine eingehende E-Mail zu finden.

Analysiere die E-Mail und wähle die am besten passende Vorlage aus der Liste.

WICHTIG:
- Wähle nur eine Vorlage, wenn sie WIRKLICH gut zur E-Mail passt
- Es ist VÖLLIG IN ORDNUNG wenn keine Vorlage passt — gib dann null zurück mit confidence 0
- Erzwinge KEINE Empfehlung wenn du unsicher bist
- Bewerte dein Vertrauen von 0-100. Nur über 75 ist eine relevante Empfehlung
- Bei allgemeinen Anfragen die nicht klar zu einer Vorlage passen: null zurückgeben

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
