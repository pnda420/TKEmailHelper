import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ChatConversation } from './chat-conversation.entity';

@Entity('chat_messages')
export class ChatMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  conversationId: string;

  @ManyToOne(() => ChatConversation, (c) => c.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation: ChatConversation;

  /** 'user' | 'assistant' */
  @Column({ length: 20 })
  role: string;

  /** Message text */
  @Column('text')
  content: string;

  /** Serialised tool-call info (stored as JSON) */
  @Column('jsonb', { nullable: true })
  toolCalls: any[] | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
