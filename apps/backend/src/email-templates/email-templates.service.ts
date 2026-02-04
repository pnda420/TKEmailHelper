import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import OpenAI from 'openai';
import { EmailTemplate } from './email-templates.entity';

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

  private getSignature(): string {
    const name = this.configService.get<string>('MAIL_SIGNATURE_NAME') || '';
    const position = this.configService.get<string>('MAIL_SIGNATURE_POSITION') || '';
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

  async generateEmailWithGPT(dto: GenerateEmailDto): Promise<{ subject: string; body: string }> {
    const { originalEmail, instructions, tone = 'professional', templateId } = dto;

    let baseContent = '';
    if (templateId) {
      const template = await this.getTemplateById(templateId);
      baseContent = `\n\nVerwende dieses Template als Basis:\n${template.body}`;
      await this.incrementUsage(templateId);
    }

    const signature = this.getSignature();

    const toneDescriptions = {
      professional: 'professionell und sachlich',
      friendly: 'freundlich und persönlich',
      formal: 'sehr formell und höflich',
      casual: 'locker und ungezwungen',
    };

    const systemPrompt = `Du bist ein professioneller E-Mail-Assistent. Schreibe Antworten auf Deutsch.
Der Ton soll ${toneDescriptions[tone]} sein.
Schreibe eine passende Antwort auf die erhaltene E-Mail.
Füge am Ende IMMER diese Signatur an:
${signature}

Gib die Antwort im folgenden JSON-Format zurück:
{"subject": "Betreff der Antwort", "body": "Der E-Mail-Text inkl. Signatur"}
Verwende KEINE Markdown-Formatierung im Body, nur reinen Text mit Absätzen.`;

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

  async sendReply(dto: SendReplyDto): Promise<{ success: boolean; messageId?: string }> {
    const mailFrom = this.configService.get<string>('MAIL');
    const companyName = this.configService.get<string>('COMPANY_NAME') || 'Email Helper';

    try {
      const info = await this.transporter.sendMail({
        from: `"${companyName}" <${mailFrom}>`,
        to: dto.to,
        subject: dto.subject,
        text: dto.body,
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
}
