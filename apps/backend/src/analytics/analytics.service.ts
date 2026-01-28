import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, Between, Raw } from 'typeorm';
import { AnalyticsEvent, AnalyticsDailyStats } from './analytics.entity';
import { 
  CreateAnalyticsEventDto, 
  AnalyticsDashboardDto, 
  AnalyticsOverviewDto,
  TimeSeriesPointDto,
  PageStatsDto,
  ReferrerStatsDto,
  DeviceStatsDto,
  RecentEventDto
} from './analytics.dto';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(AnalyticsEvent)
    private eventRepo: Repository<AnalyticsEvent>,
    @InjectRepository(AnalyticsDailyStats)
    private dailyStatsRepo: Repository<AnalyticsDailyStats>,
  ) {}

  /**
   * Speichert ein Analytics-Event
   */
  async trackEvent(dto: CreateAnalyticsEventDto, ip: string, hasConsent: boolean): Promise<void> {
    if (!hasConsent) {
      throw new ForbiddenException('Analytics consent required');
    }

    const event = this.eventRepo.create({
      type: dto.type,
      page: dto.page,
      referrer: this.cleanReferrer(dto.referrer),
      userAgent: this.anonymizeUserAgent(dto.userAgent),
      screenSize: this.categorizeScreenSize(dto.screenSize),
      sessionId: dto.sessionId,
      clientTimestamp: dto.timestamp,
      ipAnonymized: this.anonymizeIP(ip),
      metadata: dto.metadata,
    });

    await this.eventRepo.save(event);
  }

  /**
   * Anonymisiert IP-Adresse (DSGVO-konform)
   */
  private anonymizeIP(ip: string): string {
    if (!ip) return '';
    
    // IPv4: Letztes Oktett auf 0 setzen
    if (ip.includes('.')) {
      return ip.replace(/\.\d+$/, '.0');
    }
    
    // IPv6: Letzte 80 Bits nullen
    if (ip.includes(':')) {
      const parts = ip.split(':');
      return parts.slice(0, 3).join(':') + '::0';
    }
    
    return '';
  }

  /**
   * Anonymisiert User-Agent (DSGVO-konform)
   * Behält nur OS und Browser-Typ, keine Versionen oder Details
   */
  private anonymizeUserAgent(userAgent?: string): string {
    if (!userAgent) return 'Unknown';
    
    // Betriebssystem erkennen
    let os = 'Unknown OS';
    if (/Windows/i.test(userAgent)) os = 'Windows';
    else if (/Mac OS X|Macintosh/i.test(userAgent)) os = 'MacOS';
    else if (/iPhone|iPad|iPod/i.test(userAgent)) os = 'iOS';
    else if (/Android/i.test(userAgent)) os = 'Android';
    else if (/Linux/i.test(userAgent)) os = 'Linux';
    else if (/CrOS/i.test(userAgent)) os = 'ChromeOS';
    
    // Browser erkennen (Reihenfolge wichtig wegen User-Agent-Strings)
    let browser = 'Unknown Browser';
    if (/Edg\//i.test(userAgent)) browser = 'Edge';
    else if (/OPR|Opera/i.test(userAgent)) browser = 'Opera';
    else if (/Firefox/i.test(userAgent)) browser = 'Firefox';
    else if (/Chrome/i.test(userAgent)) browser = 'Chrome';
    else if (/Safari/i.test(userAgent)) browser = 'Safari';
    else if (/MSIE|Trident/i.test(userAgent)) browser = 'IE';
    
    return `${os} / ${browser}`;
  }

  /**
   * Kategorisiert Bildschirmgröße (DSGVO-konform)
   * Keine exakten Werte, nur Kategorien
   */
  private categorizeScreenSize(screenSize?: string): string {
    if (!screenSize) return 'unknown';
    
    const match = screenSize.match(/^(\d+)x(\d+)$/);
    if (!match) return 'unknown';
    
    const width = parseInt(match[1], 10);
    
    // Kategorisieren statt exakte Werte
    if (width <= 480) return 'mobile-small';
    if (width <= 768) return 'mobile';
    if (width <= 1024) return 'tablet';
    if (width <= 1440) return 'desktop';
    return 'desktop-large';
  }

  /**
   * Bereinigt Referrer (entfernt Query-Parameter mit sensiblen Daten)
   */
  private cleanReferrer(referrer?: string): string | undefined {
    if (!referrer) return undefined;
    
    try {
      const url = new URL(referrer);
      // Nur Origin + Pathname, keine Query-Parameter
      return url.origin + url.pathname;
    } catch {
      return referrer;
    }
  }

  /**
   * Dashboard-Daten für Admin
   */
  async getDashboard(): Promise<AnalyticsDashboardDto> {
    const [overview, timeSeries, topPages, referrers, devices, recentEvents] = await Promise.all([
      this.getOverview(),
      this.getTimeSeries(30),
      this.getTopPages(30),
      this.getReferrers(30),
      this.getDeviceStats(30),
      this.getRecentEvents(20),
    ]);

    return {
      overview,
      timeSeries,
      topPages,
      referrers,
      devices,
      recentEvents,
    };
  }

  /**
   * Overview-Statistiken
   */
  async getOverview(): Promise<AnalyticsOverviewDto> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const last7Days = new Date(today);
    last7Days.setDate(last7Days.getDate() - 7);
    const last30Days = new Date(today);
    last30Days.setDate(last30Days.getDate() - 30);

    const [todayStats, yesterdayStats, last7Stats, last30Stats] = await Promise.all([
      this.getStatsForPeriod(today, now),
      this.getStatsForPeriod(yesterday, today),
      this.getStatsForPeriod(last7Days, now),
      this.getStatsForPeriod(last30Days, now),
    ]);

    return {
      today: todayStats,
      yesterday: yesterdayStats,
      last7Days: last7Stats,
      last30Days: last30Stats,
    };
  }

  /**
   * Statistiken für einen Zeitraum
   */
  private async getStatsForPeriod(from: Date, to: Date): Promise<{ pageviews: number; uniqueSessions: number; conversions: number }> {
    const events = await this.eventRepo.find({
      where: {
        createdAt: Between(from, to),
      },
      select: ['type', 'sessionId'],
    });

    const pageviews = events.filter(e => e.type === 'pageview').length;
    const uniqueSessions = new Set(events.map(e => e.sessionId)).size;
    const conversions = events.filter(e => e.type === 'conversion').length;

    return { pageviews, uniqueSessions, conversions };
  }

  /**
   * Zeitreihen-Daten
   */
  async getTimeSeries(days: number): Promise<TimeSeriesPointDto[]> {
    const result: TimeSeriesPointDto[] = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const events = await this.eventRepo.find({
        where: {
          createdAt: Between(dayStart, dayEnd),
        },
        select: ['type', 'sessionId'],
      });

      result.push({
        date: dateStr,
        pageviews: events.filter(e => e.type === 'pageview').length,
        uniqueSessions: new Set(events.map(e => e.sessionId)).size,
        conversions: events.filter(e => e.type === 'conversion').length,
      });
    }

    return result;
  }

  /**
   * Top-Seiten
   */
  async getTopPages(days: number): Promise<PageStatsDto[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const events = await this.eventRepo.find({
      where: {
        type: 'pageview',
        createdAt: MoreThanOrEqual(since),
      },
      select: ['page', 'sessionId'],
    });

    const pageMap = new Map<string, { views: number; sessions: Set<string> }>();

    for (const event of events) {
      const existing = pageMap.get(event.page) || { views: 0, sessions: new Set<string>() };
      existing.views++;
      existing.sessions.add(event.sessionId);
      pageMap.set(event.page, existing);
    }

    return Array.from(pageMap.entries())
      .map(([page, stats]) => ({
        page,
        views: stats.views,
        uniqueSessions: stats.sessions.size,
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 10);
  }

  /**
   * Referrer-Statistiken
   */
  async getReferrers(days: number): Promise<ReferrerStatsDto[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const events = await this.eventRepo.find({
      where: {
        type: 'pageview',
        createdAt: MoreThanOrEqual(since),
      },
      select: ['referrer'],
    });

    const referrerMap = new Map<string, number>();

    for (const event of events) {
      const referrer = event.referrer ? this.parseReferrer(event.referrer) : 'Direkt';
      referrerMap.set(referrer, (referrerMap.get(referrer) || 0) + 1);
    }

    return Array.from(referrerMap.entries())
      .map(([referrer, count]) => ({ referrer, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  /**
   * Extrahiert Domain aus Referrer
   */
  private parseReferrer(referrer: string): string {
    try {
      const url = new URL(referrer);
      return url.hostname.replace('www.', '');
    } catch {
      return referrer || 'Direkt';
    }
  }

  /**
   * Geräte-Statistiken (basierend auf User-Agent)
   */
  async getDeviceStats(days: number): Promise<DeviceStatsDto> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const events = await this.eventRepo.find({
      where: {
        type: 'pageview',
        createdAt: MoreThanOrEqual(since),
      },
      select: ['userAgent', 'sessionId'],
    });

    // Unique sessions
    const sessionDevices = new Map<string, string>();

    for (const event of events) {
      if (!sessionDevices.has(event.sessionId)) {
        sessionDevices.set(event.sessionId, this.detectDevice(event.userAgent));
      }
    }

    const stats: DeviceStatsDto = { desktop: 0, mobile: 0, tablet: 0 };

    for (const device of sessionDevices.values()) {
      if (device === 'mobile') stats.mobile++;
      else if (device === 'tablet') stats.tablet++;
      else stats.desktop++;
    }

    return stats;
  }

  /**
   * Erkennt Gerätetyp aus User-Agent
   */
  private detectDevice(userAgent?: string): 'desktop' | 'mobile' | 'tablet' {
    if (!userAgent) return 'desktop';
    
    const ua = userAgent.toLowerCase();
    
    if (/ipad|tablet|playbook|silk/i.test(ua)) {
      return 'tablet';
    }
    
    if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) {
      return 'mobile';
    }
    
    return 'desktop';
  }

  /**
   * Letzte Events
   */
  async getRecentEvents(limit: number): Promise<RecentEventDto[]> {
    const events = await this.eventRepo.find({
      order: { createdAt: 'DESC' },
      take: limit,
      select: ['type', 'page', 'createdAt', 'metadata', 'sessionId', 'userAgent', 'screenSize', 'referrer'],
    });

    return events.map(e => ({
      type: e.type,
      page: e.page,
      timestamp: e.createdAt,
      sessionId: e.sessionId,
      userAgent: e.userAgent,
      screenSize: e.screenSize,
      referrer: e.referrer,
      metadata: e.metadata,
      deviceType: this.detectDevice(e.userAgent),
    }));
  }

  /**
   * Löscht alte Events (Datensparsamkeit)
   */
  async cleanupOldEvents(daysToKeep: number = 90): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysToKeep);

    const result = await this.eventRepo
      .createQueryBuilder()
      .delete()
      .where('createdAt < :cutoff', { cutoff })
      .execute();

    return result.affected || 0;
  }

  /**
   * DSGVO: Auskunftsrecht - Gibt alle Daten zu einer Session-ID zurück
   */
  async getDataBySessionId(sessionId: string): Promise<AnalyticsEvent[]> {
    return this.eventRepo.find({
      where: { sessionId },
      order: { createdAt: 'DESC' },
      select: ['type', 'page', 'createdAt', 'screenSize', 'userAgent'],
    });
  }

  /**
   * DSGVO: Löschrecht - Löscht alle Daten zu einer Session-ID
   */
  async deleteDataBySessionId(sessionId: string): Promise<number> {
    const result = await this.eventRepo
      .createQueryBuilder()
      .delete()
      .where('sessionId = :sessionId', { sessionId })
      .execute();

    return result.affected || 0;
  }
}
