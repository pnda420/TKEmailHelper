import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum EmailStatus {
  INBOX = 'inbox',
  SENT = 'sent',
  TRASH = 'trash',
}

@Entity('emails')
@Index('IDX_emails_status_receivedAt', ['status', 'receivedAt'])
@Index('IDX_emails_fromAddress', ['fromAddress'])
@Index('IDX_emails_threadId', ['threadId'])
export class Email {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ unique: true })
  messageId: string; // Unique Message-ID from IMAP

  @Column({ nullable: true })
  inReplyTo: string; // In-Reply-To header from original email

  @Column('text', { nullable: true })
  references: string; // References header chain for threading

  // Thread grouping — computed from inReplyTo/references/subject
  @Column({ nullable: true })
  threadId: string; // Shared across all emails in a thread

  @Column()
  subject: string;

  @Index()
  @Column({ type: 'enum', enum: EmailStatus, default: EmailStatus.INBOX })
  status: EmailStatus;

  @Column()
  fromAddress: string;

  @Column({ nullable: true })
  fromName: string;

  @Column('text', { array: true, default: [] })
  toAddresses: string[];

  @Column('text', { nullable: true })
  textBody: string;

  @Column('text', { nullable: true })
  htmlBody: string;

  @Column({ nullable: true })
  preview: string; // First ~200 chars for list preview

  @Index()
  @Column({ type: 'timestamptz' })
  receivedAt: Date;

  @Column({ default: false })
  isRead: boolean;

  @Column({ default: false })
  hasAttachments: boolean;

  @Column('jsonb', { nullable: true })
  attachments: { filename: string; contentType: string; size: number }[];

  // Reply tracking
  @Column({ nullable: true })
  repliedAt: Date;

  @Column({ nullable: true })
  replySentSubject: string;

  @Column('text', { nullable: true })
  replySentBody: string;

  // AI Analysis (computed once when email is pulled)
  @Column('text', { nullable: true })
  aiSummary: string;

  @Column('text', { array: true, nullable: true })
  aiTags: string[];

  @Column({ nullable: true })
  recommendedTemplateId: string;

  @Column('text', { nullable: true })
  recommendedTemplateReason: string;

  @Column({ type: 'timestamptz', nullable: true })
  aiProcessedAt: Date;

  @Column({ default: false })
  aiProcessing: boolean;

  // Clean body without reply chains
  @Column('text', { nullable: true })
  cleanedBody: string;

  // Pre-computed Agent Analysis (JTL customer data, orders, etc.)
  @Column('text', { nullable: true })
  agentAnalysis: string;

  @Column('jsonb', { nullable: true })
  agentKeyFacts: { icon: string; label: string; value: string }[];

  @Column('text', { nullable: true })
  suggestedReply: string;

  @Column({ nullable: true })
  suggestedReplySubject: string;

  @Column({ nullable: true })
  customerPhone: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
