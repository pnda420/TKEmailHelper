import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatConversation } from './chat-conversation.entity';
import { ChatMessageEntity } from './chat-message.entity';

@Injectable()
export class ChatPersistenceService {
  private readonly logger = new Logger(ChatPersistenceService.name);

  constructor(
    @InjectRepository(ChatConversation)
    private readonly convRepo: Repository<ChatConversation>,
    @InjectRepository(ChatMessageEntity)
    private readonly msgRepo: Repository<ChatMessageEntity>,
  ) {}

  // ── Conversations ──

  /** List all conversations for a user, newest first */
  async listConversations(userId: string): Promise<ChatConversation[]> {
    return this.convRepo.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
      select: ['id', 'title', 'createdAt', 'updatedAt'],
    });
  }

  /** Create a new conversation */
  async createConversation(
    userId: string,
    title?: string,
  ): Promise<ChatConversation> {
    const conv = this.convRepo.create({
      userId,
      title: title || 'Neuer Chat',
    });
    return this.convRepo.save(conv);
  }

  /** Update conversation title */
  async updateTitle(
    conversationId: string,
    userId: string,
    title: string,
  ): Promise<ChatConversation> {
    const conv = await this.convRepo.findOne({
      where: { id: conversationId, userId },
    });
    if (!conv) throw new NotFoundException('Conversation not found');
    conv.title = title;
    return this.convRepo.save(conv);
  }

  /** Delete a conversation (cascade deletes messages) */
  async deleteConversation(conversationId: string, userId: string): Promise<void> {
    const conv = await this.convRepo.findOne({
      where: { id: conversationId, userId },
    });
    if (!conv) throw new NotFoundException('Conversation not found');
    await this.convRepo.remove(conv);
  }

  // ── Messages ──

  /** Get all messages for a conversation (oldest first) */
  async getMessages(
    conversationId: string,
    userId: string,
  ): Promise<ChatMessageEntity[]> {
    // Verify ownership
    const conv = await this.convRepo.findOne({
      where: { id: conversationId, userId },
    });
    if (!conv) throw new NotFoundException('Conversation not found');

    return this.msgRepo.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });
  }

  /** Add a message to a conversation and touch updatedAt */
  async addMessage(
    conversationId: string,
    role: string,
    content: string,
    toolCalls?: any[] | null,
  ): Promise<ChatMessageEntity> {
    const msg = this.msgRepo.create({
      conversationId,
      role,
      content,
      toolCalls: toolCalls || null,
    });
    const saved = await this.msgRepo.save(msg);

    // Touch updatedAt on conversation so it floats to top
    await this.convRepo.update(conversationId, { updatedAt: new Date() });

    return saved;
  }

  /** Get conversation if owned by user */
  async getConversation(
    conversationId: string,
    userId: string,
  ): Promise<ChatConversation | null> {
    return this.convRepo.findOne({
      where: { id: conversationId, userId },
    });
  }
}
