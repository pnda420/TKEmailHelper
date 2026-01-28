import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type AnalyticsEventType = 
  | 'pageview' 
  | 'click' 
  | 'scroll' 
  | 'form_submit' 
  | 'conversion'
  | 'error'
  | 'custom';

@Entity('analytics_events')
@Index(['createdAt'])
@Index(['sessionId'])
@Index(['type'])
@Index(['page'])
export class AnalyticsEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  type: AnalyticsEventType;

  @Column({ type: 'varchar', length: 500 })
  page: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  referrer?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  userAgent?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  screenSize?: string;

  @Column({ type: 'varchar', length: 50 })
  sessionId: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  ipAnonymized?: string; // Anonymisierte IP (z.B. 192.168.1.0)

  @Column({ type: 'varchar', length: 100, nullable: true })
  country?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @Column({ type: 'bigint' })
  clientTimestamp: number;

  @CreateDateColumn()
  createdAt: Date;
}

// ===== AGGREGATED STATS ENTITY =====
@Entity('analytics_daily_stats')
@Index(['date'], { unique: true })
export class AnalyticsDailyStats {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'date', unique: true })
  date: string;

  @Column({ type: 'int', default: 0 })
  pageviews: number;

  @Column({ type: 'int', default: 0 })
  uniqueSessions: number;

  @Column({ type: 'int', default: 0 })
  conversions: number;

  @Column({ type: 'jsonb', nullable: true })
  topPages?: Record<string, number>;

  @Column({ type: 'jsonb', nullable: true })
  referrers?: Record<string, number>;

  @Column({ type: 'jsonb', nullable: true })
  devices?: { desktop: number; mobile: number; tablet: number };

  @CreateDateColumn()
  createdAt: Date;
}
