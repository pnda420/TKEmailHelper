import { IsString, IsOptional, IsNumber, IsObject, MaxLength, IsIn } from 'class-validator';

const EVENT_TYPES = ['pageview', 'click', 'scroll', 'form_submit', 'conversion', 'error', 'custom'] as const;

export class CreateAnalyticsEventDto {
  @IsString()
  @IsIn(EVENT_TYPES)
  type: typeof EVENT_TYPES[number];

  @IsString()
  @MaxLength(500)
  page: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  referrer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  userAgent?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  screenSize?: string;

  @IsNumber()
  timestamp: number;

  @IsString()
  @MaxLength(50)
  sessionId: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

// ===== RESPONSE DTOs =====

export interface AnalyticsOverviewDto {
  today: {
    pageviews: number;
    uniqueSessions: number;
    conversions: number;
  };
  yesterday: {
    pageviews: number;
    uniqueSessions: number;
    conversions: number;
  };
  last7Days: {
    pageviews: number;
    uniqueSessions: number;
    conversions: number;
  };
  last30Days: {
    pageviews: number;
    uniqueSessions: number;
    conversions: number;
  };
}

export interface PageStatsDto {
  page: string;
  views: number;
  uniqueSessions: number;
}

export interface TimeSeriesPointDto {
  date: string;
  pageviews: number;
  uniqueSessions: number;
  conversions: number;
}

export interface ReferrerStatsDto {
  referrer: string;
  count: number;
}

export interface DeviceStatsDto {
  desktop: number;
  mobile: number;
  tablet: number;
}

export interface RecentEventDto {
  type: string;
  page: string;
  timestamp: Date;
  sessionId: string;
  userAgent?: string;
  screenSize?: string;
  referrer?: string;
  metadata?: Record<string, any>;
  deviceType?: 'desktop' | 'mobile' | 'tablet';
}

export interface AnalyticsDashboardDto {
  overview: AnalyticsOverviewDto;
  timeSeries: TimeSeriesPointDto[];
  topPages: PageStatsDto[];
  referrers: ReferrerStatsDto[];
  devices: DeviceStatsDto;
  recentEvents: RecentEventDto[];
}
