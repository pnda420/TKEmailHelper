import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';

@Entity('spam_scans')
@Unique('UQ_spam_scans_mailbox_message', ['mailboxId', 'messageId'])
@Index('IDX_spam_scans_mailboxId', ['mailboxId'])
export class SpamScan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  mailboxId: string;

  @Column('text')
  messageId: string;

  @Column({ type: 'int', default: 0 })
  uid: number;

  @Column('text', { default: '' })
  subject: string;

  @Column('text', { default: '' })
  from: string;

  @Column('text', { default: '' })
  fromName: string;

  @Column('text', { default: '' })
  to: string;

  @Column('text', { nullable: true })
  date: string;

  @Column('text', { default: '' })
  preview: string;

  @Column({ length: 32, default: 'unknown' })
  category: string;

  @Column({ type: 'int', default: 50 })
  spamScore: number;

  @Column('text', { default: '' })
  spamReason: string;

  @Column({ default: false })
  isSpam: boolean;

  @CreateDateColumn()
  scannedAt: Date;

  @Column({ nullable: true })
  scannedByUserId: string;
}
