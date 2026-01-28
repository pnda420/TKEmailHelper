import { Controller, Post, Get, Body, Req, UseGuards, HttpCode, HttpStatus, Delete, Query } from '@nestjs/common';
import { Request } from 'express';
import { AnalyticsService } from './analytics.service';
import { CreateAnalyticsEventDto, AnalyticsDashboardDto } from './analytics.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * Empfängt Analytics-Events vom Frontend
   * Nur mit Consent-Header erlaubt
   */
  @Post('event')
  @HttpCode(HttpStatus.NO_CONTENT)
  async trackEvent(
    @Body() dto: CreateAnalyticsEventDto,
    @Req() req: Request,
  ): Promise<void> {
    // Consent-Header prüfen
    const consentHeader = req.headers['x-consent-analytics'];
    const hasConsent = consentHeader === 'true';
    
    console.log('[Analytics] Received event:', dto.type, dto.page);
    console.log('[Analytics] Consent header:', consentHeader, '-> hasConsent:', hasConsent);
    
    // IP aus verschiedenen Headers extrahieren (Proxy-Support)
    const ip = this.getClientIP(req);
    
    await this.analyticsService.trackEvent(dto, ip, hasConsent);
    console.log('[Analytics] Event saved successfully');
  }

  /**
   * Dashboard-Daten für Admin
   */
  @Get('dashboard')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getDashboard(): Promise<AnalyticsDashboardDto> {
    return this.analyticsService.getDashboard();
  }

  /**
   * Overview-Statistiken
   */
  @Get('overview')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getOverview() {
    return this.analyticsService.getOverview();
  }

  /**
   * Zeitreihen-Daten
   */
  @Get('timeseries')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getTimeSeries(@Query('days') days?: string) {
    const numDays = parseInt(days || '30', 10);
    return this.analyticsService.getTimeSeries(Math.min(numDays, 90));
  }

  /**
   * Top-Seiten
   */
  @Get('pages')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getTopPages(@Query('days') days?: string) {
    const numDays = parseInt(days || '30', 10);
    return this.analyticsService.getTopPages(Math.min(numDays, 90));
  }

  /**
   * Referrer-Statistiken
   */
  @Get('referrers')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getReferrers(@Query('days') days?: string) {
    const numDays = parseInt(days || '30', 10);
    return this.analyticsService.getReferrers(Math.min(numDays, 90));
  }

  /**
   * Geräte-Statistiken
   */
  @Get('devices')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getDevices(@Query('days') days?: string) {
    const numDays = parseInt(days || '30', 10);
    return this.analyticsService.getDeviceStats(Math.min(numDays, 90));
  }

  /**
   * Cleanup alter Events (Admin-Only)
   */
  @Delete('cleanup')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async cleanup(@Query('days') days?: string): Promise<{ deleted: number }> {
    const daysToKeep = parseInt(days || '90', 10);
    const deleted = await this.analyticsService.cleanupOldEvents(daysToKeep);
    return { deleted };
  }

  /**
   * DSGVO: Auskunftsrecht - Gibt alle Daten zu einer Session-ID zurück
   * Nutzer können ihre Session-ID aus dem SessionStorage auslesen
   */
  @Get('my-data')
  async getMyData(@Query('sessionId') sessionId: string, @Req() req: Request) {
    if (!sessionId || sessionId.length < 10) {
      return { error: 'Ungültige Session-ID', data: [] };
    }
    
    const data = await this.analyticsService.getDataBySessionId(sessionId);
    return {
      sessionId,
      recordCount: data.length,
      data: data.map(event => ({
        type: event.type,
        page: event.page,
        timestamp: event.createdAt,
        screenSize: event.screenSize,
        userAgent: event.userAgent,
        // Keine IP, keine sensiblen Metadaten
      })),
      info: 'Diese Daten werden nach 90 Tagen automatisch gelöscht.'
    };
  }

  /**
   * DSGVO: Löschrecht - Löscht alle Daten zu einer Session-ID
   */
  @Delete('my-data')
  async deleteMyData(@Query('sessionId') sessionId: string) {
    if (!sessionId || sessionId.length < 10) {
      return { error: 'Ungültige Session-ID', deleted: 0 };
    }
    
    const deleted = await this.analyticsService.deleteDataBySessionId(sessionId);
    return {
      sessionId,
      deleted,
      message: deleted > 0 
        ? `${deleted} Analytics-Einträge wurden gelöscht.`
        : 'Keine Daten zu dieser Session-ID gefunden.'
    };
  }

  /**
   * Extrahiert die echte Client-IP (berücksichtigt Proxys)
   */
  private getClientIP(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
      return ips.split(',')[0].trim();
    }
    
    const realIp = req.headers['x-real-ip'];
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }
    
    return req.ip || req.socket?.remoteAddress || '';
  }
}
