import {
  Controller,
  Post,
  Body,
  Get,
  Delete,
  Patch,
  Param,
  Query,
  Sse,
  UseGuards,
  Logger,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiChatService, ChatStep } from './ai-chat.service';
import { ChatPersistenceService } from './chat-persistence.service';

interface MessageEvent {
  data: string | object;
}

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class AiChatController {
  private readonly logger = new Logger(AiChatController.name);

  constructor(
    private readonly chatService: AiChatService,
    private readonly persistence: ChatPersistenceService,
  ) {}

  // ── Conversation CRUD ──

  /** GET /chat/conversations — list all conversations for current user */
  @Get('conversations')
  async listConversations(@Req() req: any) {
    return this.persistence.listConversations(req.user.id);
  }

  /** POST /chat/conversations — create a new conversation */
  @Post('conversations')
  async createConversation(
    @Req() req: any,
    @Body('title') title?: string,
  ) {
    return this.persistence.createConversation(req.user.id, title);
  }

  /** GET /chat/conversations/:id/messages — get all messages */
  @Get('conversations/:id/messages')
  async getMessages(@Param('id') id: string, @Req() req: any) {
    return this.persistence.getMessages(id, req.user.id);
  }

  /** PATCH /chat/conversations/:id — update title */
  @Patch('conversations/:id')
  async updateTitle(
    @Param('id') id: string,
    @Body('title') title: string,
    @Req() req: any,
  ) {
    return this.persistence.updateTitle(id, req.user.id, title);
  }

  /** DELETE /chat/conversations/:id — delete conversation */
  @Delete('conversations/:id')
  async deleteConversation(@Param('id') id: string, @Req() req: any) {
    await this.persistence.deleteConversation(id, req.user.id);
    return { ok: true };
  }

  // ── SSE Chat Stream ──

  /**
   * GET /chat/stream?message=xxx&conversationId=xxx&token=xxx
   * Streams AI response via SSE. Messages are auto-persisted to the DB.
   */
  @Get('stream')
  @Sse()
  streamChat(
    @Query('message') message: string,
    @Query('conversationId') conversationId: string,
    @Req() req: any,
  ): Observable<MessageEvent> {
    if (!message) {
      throw new BadRequestException('message is required');
    }
    if (!conversationId) {
      throw new BadRequestException('conversationId is required');
    }

    return new Observable((subscriber) => {
      (async () => {
        try {
          const userId: string = req.user.id;

          // Verify ownership
          const conv = await this.persistence.getConversation(
            conversationId,
            userId,
          );
          if (!conv) {
            subscriber.next({
              data: JSON.stringify({
                type: 'error',
                content: 'Conversation nicht gefunden.',
                status: 'error',
              }),
            });
            subscriber.complete();
            return;
          }

          // Persist user message
          await this.persistence.addMessage(conversationId, 'user', message);

          // Load history from DB
          const dbMessages = await this.persistence.getMessages(
            conversationId,
            userId,
          );
          const history = dbMessages
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .slice(0, -1) // exclude the user message we just added (it's added by chat())
            .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

          const userInfo = { userId, userEmail: req.user.email };
          let assistantContent = '';
          const toolCalls: any[] = [];

          await this.chatService.chat(
            message,
            history,
            (step: ChatStep) => {
              subscriber.next({ data: JSON.stringify(step) });

              if (step.type === 'tool_call') {
                toolCalls.push({
                  tool: step.tool,
                  args: step.args,
                  status: 'running',
                });
              }
              if (step.type === 'tool_result') {
                const tc = toolCalls.find(
                  (t) => t.tool === step.tool && t.status === 'running',
                );
                if (tc) {
                  tc.status = step.status === 'error' ? 'error' : 'done';
                }
              }
              if (step.type === 'complete') {
                assistantContent = step.content || '';
              }
              if (step.type === 'error') {
                assistantContent = step.content || 'Fehler';
              }
            },
            userInfo,
          );

          // Persist assistant response
          if (assistantContent) {
            await this.persistence.addMessage(
              conversationId,
              'assistant',
              assistantContent,
              toolCalls.length > 0 ? toolCalls : null,
            );
          }

          // Auto-generate title if this is the first exchange
          if (dbMessages.length <= 1 && assistantContent) {
            try {
              const generatedTitle =
                await this.chatService.generateTitle(message, assistantContent);
              await this.persistence.updateTitle(
                conversationId,
                userId,
                generatedTitle,
              );
              subscriber.next({
                data: JSON.stringify({
                  type: 'title_update',
                  content: generatedTitle,
                  status: 'done',
                }),
              });
            } catch (e) {
              this.logger.warn(`Title generation failed: ${e.message}`);
              // Fallback: truncate user message
              const fallback =
                message.length > 50
                  ? message.substring(0, 50) + '…'
                  : message;
              await this.persistence.updateTitle(
                conversationId,
                userId,
                fallback,
              );
              subscriber.next({
                data: JSON.stringify({
                  type: 'title_update',
                  content: fallback,
                  status: 'done',
                }),
              });
            }
          }

          subscriber.complete();
        } catch (error) {
          this.logger.error(`Chat failed: ${error.message}`);
          subscriber.next({
            data: JSON.stringify({
              type: 'error',
              content: `Chat fehlgeschlagen: ${error.message}`,
              status: 'error',
            }),
          });
          subscriber.complete();
        }
      })();
    });
  }
}
