import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('email_templates')
export class EmailTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  name: string; // Template name for quick selection

  @Column({ nullable: true })
  subject: string; // Optional subject template

  @Column('text')
  body: string; // The template content

  @Column({ nullable: true })
  category: string; // e.g., "Support", "Sales", "General"

  @Column({ default: 0 })
  usageCount: number; // Track how often this template is used

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
