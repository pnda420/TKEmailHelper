import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * Stores AI configuration: reply rules and system prompts.
 * Each row is a config entry identified by a unique `key`.
 */
@Entity('ai_config')
export class AiConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Unique config key, e.g. 'reply_rules', 'prompt_generate_reply', 'prompt_analyze_email' */
  @Column({ unique: true })
  key: string;

  /** Human-readable label for the admin UI */
  @Column({ default: '' })
  label: string;

  /** Description shown in the admin UI */
  @Column({ default: '' })
  description: string;

  /**
   * The value — for rules this is a JSON string array,
   * for prompts this is the full prompt text.
   */
  @Column({ type: 'text', default: '' })
  value: string;

  /** Config type: 'rules' = JSON string array, 'prompt' = raw text */
  @Column({ default: 'prompt' })
  type: 'rules' | 'prompt';

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
