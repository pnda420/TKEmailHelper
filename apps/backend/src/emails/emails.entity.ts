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
export class Email {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ unique: true })
  messageId: string; // Unique Message-ID from IMAP

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

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
