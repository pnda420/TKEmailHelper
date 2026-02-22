import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { ChatMessageEntity } from './chat-message.entity';

@Entity('chat_conversations')
export class ChatConversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Owner of this conversation */
  @Index()
  @Column()
  userId: string;

  /** Auto-generated or user-set title */
  @Column({ length: 255, default: 'Neuer Chat' })
  title: string;

  @OneToMany(() => ChatMessageEntity, (m) => m.conversation, {
    cascade: true,
    eager: false,
  })
  messages: ChatMessageEntity[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
