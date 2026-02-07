import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
}

@Entity('app_logs')
export class AppLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'enum', enum: LogLevel, enumName: 'log_level', default: LogLevel.ERROR })
  level: LogLevel;

  @Column('text')
  message: string;

  @Column('text', { nullable: true })
  stack: string | null;

  /** HTTP method (GET, POST, etc.) */
  @Column({ length: 10, nullable: true })
  method: string | null;

  /** Request path / URL */
  @Column({ length: 500, nullable: true })
  url: string | null;

  /** HTTP status code */
  @Column({ type: 'int', nullable: true })
  statusCode: number | null;

  /** User ID if authenticated */
  @Index()
  @Column({ nullable: true })
  userId: string | null;

  /** User email (snapshot at log time) */
  @Column({ length: 255, nullable: true })
  userEmail: string | null;

  /** Request body (truncated) */
  @Column('text', { nullable: true })
  requestBody: string | null;

  /** IP address */
  @Column({ length: 50, nullable: true })
  ip: string | null;

  /** User agent */
  @Column({ length: 500, nullable: true })
  userAgent: string | null;

  /** Source class/module where the error occurred */
  @Column({ length: 255, nullable: true })
  source: string | null;

  /** Duration of the request in ms */
  @Column({ type: 'int', nullable: true })
  duration: number | null;

  /** Extra payload (JSON) for any additional context */
  @Column('text', { nullable: true })
  extra: string | null;

  @Index()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
