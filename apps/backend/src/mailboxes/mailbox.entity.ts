import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { UserMailbox } from './user-mailbox.entity';


@Entity('mailboxes')
export class Mailbox {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string; // Display name, e.g. "Service Postfach" or "Bewerbungen"

  @Column()
  email: string; // The email address, e.g. "service@tuerklingel-shop.de"

  @Column()
  password: string; // IMAP/SMTP password

  @Column()
  imapHost: string; // e.g. "mail.your-server.de"

  @Column()
  smtpHost: string; // e.g. "mail.your-server.de"

  @Column({ default: 993 })
  imapPort: number;

  @Column({ default: 587 })
  smtpPort: number;

  @Column({ default: true })
  imapTls: boolean;

  @Column({ default: false })
  smtpSecure: boolean;

  // IMAP Folder config
  @Column({ default: 'INBOX' })
  imapSourceFolder: string;

  @Column({ default: 'Sent' })
  imapSentFolder: string;

  @Column({ nullable: true })
  imapDoneFolder: string;

  @Column({ nullable: true })
  imapTrashFolder: string;

  // Company / Signature info for this mailbox
  @Column()
  companyName: string; // e.g. "Türklingel Shop"

  @Column({ nullable: true })
  companyPhone: string;

  @Column({ nullable: true })
  companyWebsite: string;

  @Column({ nullable: true })
  companyAddress: string;

  // Global signature template (HTML with placeholders)
  // Available placeholders: {{userName}}, {{userPosition}}, {{companyName}}, {{companyPhone}}, {{companyWebsite}}, {{companyAddress}}
  @Column('text', { nullable: true })
  signatureTemplate: string;

  // Color for visual identification in the UI
  @Column({ default: '#1565c0' })
  color: string;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => UserMailbox, (um) => um.mailbox)
  userMailboxes: UserMailbox[];

  @CreateDateColumn({ type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;
}
