import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('spam_deletion_logs')
@Index('IDX_spam_deletion_logs_mailboxId', ['mailboxId'])
@Index('IDX_spam_deletion_logs_deletedAt', ['deletedAt'])
@Index('IDX_spam_deletion_logs_deletedByUserEmail', ['deletedByUserEmail'])
export class SpamDeletionLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  mailboxId: string;

  /** Mailbox email address (denormalized for display) */
  @Column({ nullable: true })
  mailboxEmail: string;

  @Column({ nullable: true })
  deletedByUserId: string;

  @Column({ nullable: true })
  deletedByUserEmail: string;

  /** Number of emails deleted in this batch */
  @Column({ type: 'int', default: 0 })
  count: number;

  /** JSON array of deleted email summaries [{uid, subject, from, category, spamScore}] */
  @Column('text', { default: '[]' })
  emailSummaries: string;

  @CreateDateColumn()
  deletedAt: Date;
}
