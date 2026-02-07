import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { JtlToolsService } from '../jtl-tools/jtl-tools.service';
import { JTL_TOOLS } from './tools/jtl-tools.definitions';
import { AGENT_SYSTEM_PROMPT } from './prompts/system-prompt';
import { AI_MODELS } from '../config/ai-models.config';
import { AiUsageService } from '../ai-usage/ai-usage.service';

export interface AnalysisStep {
  type: 'tool_call' | 'tool_result' | 'thinking' | 'complete' | 'error';
  tool?: string;
  args?: Record<string, any>;
  result?: any;
  summary?: string;
  content?: string;
  status: 'running' | 'done' | 'error';
}

export interface AnalysisResult {
  steps: AnalysisStep[];
  finalResponse: string;
}

@Injectable()
export class AiAgentService {
  private readonly logger = new Logger(AiAgentService.name);
  private openai: OpenAI;

  constructor(
    private readonly jtlTools: JtlToolsService,
    private readonly configService: ConfigService,
    private readonly aiUsageService: AiUsageService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
      timeout: 90000, // 90s timeout
    });
  }

  /**
   * Analysiert eine E-Mail mit dem KI-Agent (Tool-Calling Loop).
   * Ruft den Callback für jeden Schritt auf (für SSE Live-Updates).
   */
  async analyzeEmail(
    emailData: {
      id: string;
      subject: string;
      fromAddress: string;
      fromName?: string;
      textBody: string;
      attachments?: string[];
      inlineImages?: string[];
    },
    onStep: (step: AnalysisStep) => void,
    userInfo?: { userId?: string; userEmail?: string },
  ): Promise<string> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: AGENT_SYSTEM_PROMPT },
      {
        role: 'user',
        content: this.buildUserPrompt(emailData),
      },
    ];

    const MAX_ITERATIONS = 6;
    const collectedData: { tool: string; args: any; result: any }[] = [];

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      this.logger.debug(`Agent iteration ${i + 1}`);

      let response: OpenAI.ChatCompletion;
      const callStart = Date.now();
      try {
        response = await this.openai.chat.completions.create({
          model: AI_MODELS.powerful,
          messages,
          tools: JTL_TOOLS as any,
          tool_choice: 'auto',
        });

        // Track usage
        const usage = response.usage;
        if (usage) {
          this.aiUsageService.track({
            feature: 'agent-analyze',
            model: AI_MODELS.powerful,
            userId: userInfo?.userId,
            userEmail: userInfo?.userEmail,
            promptTokens: usage.prompt_tokens || 0,
            completionTokens: usage.completion_tokens || 0,
            totalTokens: usage.total_tokens || 0,
            durationMs: Date.now() - callStart,
            context: emailData.subject?.substring(0, 200),
          }).catch(() => {});
        }
      } catch (error) {
        this.logger.error(`OpenAI API error: ${error.message}`);

        // Track failed call
        this.aiUsageService.track({
          feature: 'agent-analyze',
          model: AI_MODELS.powerful,
          userId: userInfo?.userId,
          userEmail: userInfo?.userEmail,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          durationMs: Date.now() - callStart,
          success: false,
          errorMessage: error.message,
          context: emailData.subject?.substring(0, 200),
        }).catch(() => {});

        // If we already have data, build a fallback summary instead of failing
        if (collectedData.length > 0) {
          this.logger.warn('Timeout but we have data — building fallback summary');
          const fallback = this.buildFallbackSummary(collectedData, emailData);
          onStep({ type: 'complete', content: fallback, status: 'done' });
          return fallback;
        }

        onStep({
          type: 'error',
          content: `OpenAI Fehler: ${error.message}`,
          status: 'error',
        });
        return 'Analyse fehlgeschlagen: OpenAI-API nicht erreichbar.';
      }

      const choice = response.choices[0];
      const message = choice.message;

      // Add assistant message to conversation
      messages.push(message);

      // If no tool calls → final response
      if (!message.tool_calls || message.tool_calls.length === 0) {
        const finalContent = message.content || 'Keine Analyse möglich.';
        onStep({
          type: 'complete',
          content: finalContent,
          status: 'done',
        });
        return finalContent;
      }

      // Execute tool calls
      for (const toolCall of message.tool_calls) {
        const fn = (toolCall as any).function;
        const toolName: string = fn?.name || 'unknown';
        let args: Record<string, any>;

        try {
          args = JSON.parse(fn?.arguments || '{}');
        } catch {
          args = {};
        }

        // Emit "running" step
        onStep({
          type: 'tool_call',
          tool: toolName,
          args,
          status: 'running',
        });

        let toolResult: any;
        try {
          toolResult = await this.jtlTools.executeTool(toolName, args);
        } catch (error) {
          this.logger.error(`Tool ${toolName} failed: ${error.message}`);
          toolResult = { error: error.message };
        }

        // Keep a copy for fallback
        collectedData.push({ tool: toolName, args, result: toolResult });

        // Emit "done" step
        onStep({
          type: 'tool_result',
          tool: toolName,
          args,
          result: toolResult,
          status: 'done',
        });

        // Truncate large results before sending to OpenAI to keep context small
        const resultStr = JSON.stringify(toolResult);
        const truncated = resultStr.length > 2000
          ? resultStr.substring(0, 2000) + '... (gekürzt)'
          : resultStr;

        // Add tool result to conversation
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: truncated,
        });
      }
    }

    // If we hit MAX_ITERATIONS, make one final call WITHOUT tools to force a summary
    if (collectedData.length > 0) {
      this.logger.warn('Max iterations reached — forcing final summary call');
      messages.push({
        role: 'user',
        content: 'Du hast jetzt genügend Daten gesammelt. Erstelle jetzt SOFORT die Zusammenfassung im geforderten Format. Keine weiteren Tool-Aufrufe!',
      });

      try {
        const summaryStart = Date.now();
        const finalResponse = await this.openai.chat.completions.create({
          model: AI_MODELS.powerful,
          messages,
          // No tools → model MUST produce text
        });

        // Track final summary call
        const sUsage = finalResponse.usage;
        if (sUsage) {
          this.aiUsageService.track({
            feature: 'agent-analyze-summary',
            model: AI_MODELS.powerful,
            userId: userInfo?.userId,
            userEmail: userInfo?.userEmail,
            promptTokens: sUsage.prompt_tokens || 0,
            completionTokens: sUsage.completion_tokens || 0,
            totalTokens: sUsage.total_tokens || 0,
            durationMs: Date.now() - summaryStart,
            context: emailData.subject?.substring(0, 200),
          }).catch(() => {});
        }

        const finalContent = finalResponse.choices[0]?.message?.content;
        if (finalContent) {
          onStep({ type: 'complete', content: finalContent, status: 'done' });
          return finalContent;
        }
      } catch (error) {
        this.logger.error(`Final summary call failed: ${error.message}`);
      }

      // If even that fails, fall back to raw data summary
      const fallback = this.buildFallbackSummary(collectedData, emailData);
      onStep({ type: 'complete', content: fallback, status: 'done' });
      return fallback;
    }

    onStep({
      type: 'error',
      content: 'Maximale Iterationen erreicht.',
      status: 'error',
    });
    return 'Analyse abgebrochen: zu viele Schritte.';
  }

  /**
   * Builds a structured summary from collected tool data when OpenAI times out.
   */
  private buildFallbackSummary(
    data: { tool: string; args: any; result: any }[],
    emailData: { fromAddress: string; fromName?: string; subject: string },
  ): string {
    const lines: string[] = [];

    // Find customer info
    const customerResult = data.find(
      d => (d.tool === 'find_customer_by_email' || d.tool === 'find_customer' || d.tool === 'get_customer_full_context')
        && d.result && !d.result.error,
    );
    const customer = customerResult?.result;

    if (customer) {
      const c = Array.isArray(customer) ? customer[0] : customer;
      if (c) {
        lines.push(`**Kunde:** ${c.cVorname || ''} ${c.cName || ''} ${c.cFirma ? '(' + c.cFirma + ')' : ''} — Kd.-Nr. ${c.kKunde || 'unbekannt'}`);
      }
    } else {
      lines.push(`**Kunde:** ${emailData.fromName || emailData.fromAddress} (nicht in JTL gefunden)`);
    }

    lines.push(`**Anliegen:** ${emailData.subject}`);

    // Orders
    const orderData = data.filter(d => d.tool === 'get_customer_orders' || d.tool === 'get_order_details');
    for (const od of orderData) {
      if (od.result && !od.result.error) {
        const orders = Array.isArray(od.result) ? od.result : (od.result.header ? [od.result.header] : []);
        if (orders.length > 0) {
          lines.push(`**Bestellungen:** ${orders.length} gefunden`);
          break;
        }
      }
    }

    // Shipping
    const shippingData = data.find(d => d.tool === 'get_order_shipping' && d.result && !d.result.error);
    if (shippingData?.result) {
      const s = Array.isArray(shippingData.result) ? shippingData.result[0] : shippingData.result;
      if (s?.cTrackingID) {
        lines.push(`**Versand:** Tracking ${s.cTrackingID}`);
      }
    }

    lines.push('');
    lines.push('*Hinweis: Zusammenfassung wurde aus den gesammelten Daten erstellt (KI-Zusammenfassung war nicht verfügbar).*');

    return lines.join('\n');
  }

  private buildUserPrompt(emailData: {
    subject: string;
    fromAddress: string;
    fromName?: string;
    textBody: string;
    attachments?: string[];
    inlineImages?: string[];
  }): string {
    let prompt = `Analysiere diese E-Mail und finde alle relevanten Kundeninformationen:

Von: ${emailData.fromName || 'Unbekannt'} <${emailData.fromAddress}>
Betreff: ${emailData.subject}

Inhalt:
${emailData.textBody.substring(0, 3000)}`;

    // Add attachment info
    if (emailData.attachments?.length) {
      prompt += `\n\nAnhänge (${emailData.attachments.length}):\n`;
      prompt += emailData.attachments.map(a => `- ${a}`).join('\n');
    }

    // Add inline image info
    if (emailData.inlineImages?.length) {
      prompt += `\n\nEingebettete Bilder im E-Mail-Text (${emailData.inlineImages.length}):\n`;
      prompt += emailData.inlineImages.map(img => `- ${img}`).join('\n');
      prompt += '\nHINWEIS: Der Kunde hat bereits Bilder in der E-Mail mitgeschickt (eingebettet oder als Anhang). Berücksichtige das bei deiner Analyse!';
    } else if (emailData.attachments?.length) {
      const imageAttachments = emailData.attachments.filter(a => 
        /\.(jpg|jpeg|png|gif|bmp|webp|tiff?)/i.test(a) || a.includes('image/')
      );
      if (imageAttachments.length > 0) {
        prompt += `\nHINWEIS: Der Kunde hat bereits ${imageAttachments.length} Bild(er) als Anhang mitgeschickt. Berücksichtige das bei deiner Analyse und fordere diese Bilder NICHT erneut an!`;
      }
    }

    prompt += '\n\nStarte mit der Kundensuche und lade dann relevanten Kontext.';
    return prompt;
  }
}
