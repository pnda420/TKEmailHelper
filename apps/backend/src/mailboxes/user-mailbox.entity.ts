import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';
import { User } from '../users/users.entity';
import { Mailbox } from './mailbox.entity';

@Entity('user_mailboxes')
@Unique(['userId', 'mailboxId'])
export class UserMailbox {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  userId: string;

  @Index()
  @Column()
  mailboxId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Mailbox, (m) => m.userMailboxes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'mailboxId' })
  mailbox: Mailbox;

  // Whether this mailbox is currently active/selected for this user
  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz', default: () => 'now()' })
  assignedAt: Date;
}
