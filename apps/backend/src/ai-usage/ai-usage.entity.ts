import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

@Entity('ai_usage')
export class AiUsage {
  @PrimaryGeneratedColumn()
  id: number;

  /** Which feature triggered this call (agent-analyze, generate-email, summarize, recommend-template, etc.) */
  @Index()
  @Column({ length: 100 })
  feature: string;

  /** OpenAI model used (gpt-5, gpt-5-mini, etc.) */
  @Column({ length: 50 })
  model: string;

  /** User who triggered the request */
  @Index()
  @Column({ nullable: true })
  userId: string | null;

  @Column({ length: 255, nullable: true })
  userEmail: string | null;

  /** Input tokens (prompt) */
  @Column({ type: 'int', default: 0 })
  promptTokens: number;

  /** Output tokens (completion) */
  @Column({ type: 'int', default: 0 })
  completionTokens: number;

  /** Total tokens */
  @Column({ type: 'int', default: 0 })
  totalTokens: number;

  /** Estimated cost in USD */
  @Column({ type: 'decimal', precision: 10, scale: 6, default: 0 })
  costUsd: number;

  /** Duration of the API call in ms */
  @Column({ type: 'int', nullable: true })
  durationMs: number | null;

  /** Whether the request was successful */
  @Column({ default: true })
  success: boolean;

  /** Error message if failed */
  @Column('text', { nullable: true })
  errorMessage: string | null;

  /** Optional context (e.g. email subject, short description) */
  @Column({ length: 500, nullable: true })
  context: string | null;

  @Index()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
