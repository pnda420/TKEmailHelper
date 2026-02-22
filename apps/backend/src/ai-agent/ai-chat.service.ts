import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { JtlToolsService } from '../jtl-tools/jtl-tools.service';
import { JTL_TOOLS } from './tools/jtl-tools.definitions';
import { CHAT_SYSTEM_PROMPT } from './prompts/chat-system-prompt';
import { AI_MODELS } from '../config/ai-models.config';
import { AiUsageService } from '../ai-usage/ai-usage.service';

export interface ChatStep {
  type: 'tool_call' | 'tool_result' | 'thinking' | 'chunk' | 'complete' | 'error';
  tool?: string;
  args?: Record<string, any>;
  result?: any;
  content?: string;
  status: 'running' | 'done' | 'error';
}

@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);
  private openai: OpenAI;

  constructor(
    private readonly jtlTools: JtlToolsService,
    private readonly configService: ConfigService,
    private readonly aiUsageService: AiUsageService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
      timeout: 90000,
    });
  }

  /**
   * Chat with AI agent — supports tool calling and conversation history.
   * Streams steps back via onStep callback for SSE.
   */
  async chat(
    userMessage: string,
    history: { role: 'user' | 'assistant'; content: string }[],
    onStep: (step: ChatStep) => void,
    userInfo?: { userId?: string; userEmail?: string },
  ): Promise<string> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: CHAT_SYSTEM_PROMPT },
    ];

    // Add conversation history (limit to last 20 messages to keep context manageable)
    const recentHistory = history.slice(-20);
    for (const msg of recentHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }

    // Add current user message
    messages.push({ role: 'user', content: userMessage });

    const MAX_ITERATIONS = 6;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      this.logger.debug(`Chat iteration ${i + 1}`);

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
          this.aiUsageService
            .track({
              feature: 'chat',
              model: AI_MODELS.powerful,
              userId: userInfo?.userId,
              userEmail: userInfo?.userEmail,
              promptTokens: usage.prompt_tokens || 0,
              completionTokens: usage.completion_tokens || 0,
              totalTokens: usage.total_tokens || 0,
              durationMs: Date.now() - callStart,
              context: userMessage.substring(0, 200),
            })
            .catch(() => {});
        }
      } catch (error) {
        this.logger.error(`OpenAI API error in chat: ${error.message}`);
        onStep({
          type: 'error',
          content: `OpenAI Fehler: ${error.message}`,
          status: 'error',
        });
        return 'Chat fehlgeschlagen: OpenAI-API nicht erreichbar.';
      }

      const choice = response.choices[0];
      const message = choice.message;

      messages.push(message);

      // No tool calls → final text response
      if (!message.tool_calls || message.tool_calls.length === 0) {
        const finalContent = message.content || 'Keine Antwort erhalten.';
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

        onStep({
          type: 'tool_result',
          tool: toolName,
          args,
          result: toolResult,
          status: 'done',
        });

        // Truncate large results before sending to OpenAI
        const resultStr = JSON.stringify(toolResult);
        const truncated =
          resultStr.length > 2000
            ? resultStr.substring(0, 2000) + '... (gekürzt)'
            : resultStr;

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: truncated,
        });
      }
    }

    // Max iterations reached — force a final summary
    messages.push({
      role: 'user',
      content:
        'Du hast genügend Daten gesammelt. Antworte jetzt mit einer Zusammenfassung. Keine weiteren Tool-Aufrufe!',
    });

    try {
      const finalResponse = await this.openai.chat.completions.create({
        model: AI_MODELS.powerful,
        messages,
      });

      const finalContent =
        finalResponse.choices[0]?.message?.content || 'Keine Antwort möglich.';
      onStep({ type: 'complete', content: finalContent, status: 'done' });
      return finalContent;
    } catch (error) {
      this.logger.error(`Final chat summary failed: ${error.message}`);
      onStep({
        type: 'error',
        content: 'Maximale Iterationen erreicht.',
        status: 'error',
      });
      return 'Chat abgebrochen.';
    }
  }

  /**
   * Generate a short conversation title using the nano model (fast & cheap).
   */
  async generateTitle(
    userMessage: string,
    assistantReply: string,
  ): Promise<string> {
    const response = await this.openai.chat.completions.create({
      model: AI_MODELS.nano,
      messages: [
        {
          role: 'system',
          content:
            'Generiere einen kurzen, prägnanten Titel (max 40 Zeichen) für diese Chat-Konversation. ' +
            'Nur den Titel ausgeben, keine Anführungszeichen, keine Erklärung.',
        },
        {
          role: 'user',
          content: `User: ${userMessage.substring(0, 300)}\nAssistant: ${assistantReply.substring(0, 300)}`,
        },
      ],
      max_tokens: 30,
      temperature: 0.3,
    });

    const title = response.choices[0]?.message?.content?.trim() || userMessage.substring(0, 50);
    return title.length > 50 ? title.substring(0, 50) + '…' : title;
  }
}
