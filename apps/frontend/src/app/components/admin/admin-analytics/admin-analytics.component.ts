import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { interval, Subscription } from 'rxjs';
import { AdminLayoutComponent } from '../admin-layout/admin-layout.component';
import { ConfigService } from '../../../services/config.service';
import { ConfirmationService } from '../../../shared/confirmation/confirmation.service';

interface OverviewStats {
  today: { pageviews: number; uniqueSessions: number; conversions: number };
  yesterday: { pageviews: number; uniqueSessions: number; conversions: number };
  last7Days: { pageviews: number; uniqueSessions: number; conversions: number };
  last30Days: { pageviews: number; uniqueSessions: number; conversions: number };
}

interface TimeSeriesPoint {
  date: string;
  pageviews: number;
  uniqueSessions: number;
  conversions: number;
}

interface PageStats {
  page: string;
  views: number;
  uniqueSessions: number;
}

interface ReferrerStats {
  referrer: string;
  count: number;
}

interface DeviceStats {
  desktop: number;
  mobile: number;
  tablet: number;
}

interface RecentEvent {
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

interface DashboardData {
  overview: OverviewStats;
  timeSeries: TimeSeriesPoint[];
  topPages: PageStats[];
  referrers: ReferrerStats[];
  devices: DeviceStats;
  recentEvents: RecentEvent[];
}

@Component({
  selector: 'app-admin-analytics',
  standalone: true,
  imports: [CommonModule, AdminLayoutComponent],
  templateUrl: './admin-analytics.component.html',
  styleUrls: ['./admin-analytics.component.scss']
})
export class AdminAnalyticsComponent implements OnInit, OnDestroy {
  private get API_URL(): string {
    return `${this.configService.apiUrl}/analytics`;
  }
  
  loading = true;
  error = false;
  autoReload = true;
  countdown = 15;
  
  data: DashboardData | null = null;
  selectedPeriod: 'today' | 'yesterday' | 'last7Days' | 'last30Days' = 'today';
  periods: ('today' | 'yesterday' | 'last7Days' | 'last30Days')[] = ['today', 'yesterday', 'last7Days', 'last30Days'];
  
  private refreshSub?: Subscription;
  private countdownSub?: Subscription;

  constructor(
    private http: HttpClient,
    private confirmationService: ConfirmationService,
    private configService: ConfigService
  ) {}

  ngOnInit(): void {
    this.loadDashboard();
    this.startAutoReload();
  }

  ngOnDestroy(): void {
    this.refreshSub?.unsubscribe();
    this.countdownSub?.unsubscribe();
  }

  startAutoReload(): void {
    this.stopAutoReload();
    if (this.autoReload) {
      this.countdown = 15;
      
      // Countdown Timer (every second)
      this.countdownSub = interval(1000).subscribe(() => {
        this.countdown--;
        if (this.countdown <= 0) {
          this.countdown = 15;
          this.loadDashboard(false);
        }
      });

      // Backup: Auto-Refresh alle 15 Sekunden (fallback)
      this.refreshSub = interval(15000).subscribe(() => {
        this.countdown = 15;
        this.loadDashboard(false);
      });
    }
  }

  stopAutoReload(): void {
    this.refreshSub?.unsubscribe();
    this.refreshSub = undefined;
    this.countdownSub?.unsubscribe();
    this.countdownSub = undefined;
    this.countdown = 60;
  }

  toggleAutoReload(): void {
    this.autoReload = !this.autoReload;
    if (this.autoReload) {
      this.startAutoReload();
    } else {
      this.stopAutoReload();
    }
  }

  loadDashboard(showLoading = true): void {
    if (showLoading) this.loading = true;
    this.error = false;

    this.http.get<DashboardData>(`${this.API_URL}/dashboard`).subscribe({
      next: (data) => {
        this.data = data;
        this.loading = false;
      },
      error: () => {
        this.error = true;
        this.loading = false;
      }
    });
  }

  get currentStats() {
    if (!this.data) return null;
    return this.data.overview[this.selectedPeriod];
  }

  get previousStats() {
    if (!this.data) return null;
    // Vergleich mit vorheriger Periode
    if (this.selectedPeriod === 'today') return this.data.overview.yesterday;
    if (this.selectedPeriod === 'yesterday') return this.data.overview.yesterday; // Same
    if (this.selectedPeriod === 'last7Days') return this.data.overview.last7Days;
    return this.data.overview.last30Days;
  }

  setPeriod(period: 'today' | 'yesterday' | 'last7Days' | 'last30Days'): void {
    this.selectedPeriod = period;
  }

  getPagesPerVisit(): number {
    const stats = this.currentStats;
    if (!stats || !stats.uniqueSessions) return 0;
    return stats.pageviews / stats.uniqueSessions;
  }

  getFirstDate(): string {
    if (!this.data?.timeSeries?.length) return '';
    return this.formatDate(this.data.timeSeries[0].date);
  }

  getLastDate(): string {
    if (!this.data?.timeSeries?.length) return '';
    return this.formatDate(this.data.timeSeries[this.data.timeSeries.length - 1].date);
  }

  getChange(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  }

  get totalDevices(): number {
    if (!this.data) return 0;
    const d = this.data.devices;
    return d.desktop + d.mobile + d.tablet;
  }

  getDevicePercent(count: number): number {
    if (this.totalDevices === 0) return 0;
    return Math.round((count / this.totalDevices) * 100);
  }

  getMaxPageviews(): number {
    if (!this.data?.timeSeries.length) return 1;
    return Math.max(...this.data.timeSeries.map(p => p.pageviews), 1);
  }

  formatDate(date: string): string {
    const d = new Date(date);
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  }

  formatEventTime(timestamp: Date): string {
    const d = new Date(timestamp);
    return d.toLocaleString('de-DE', { 
      day: '2-digit', 
      month: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }

  getEventIcon(type: string): string {
    const icons: Record<string, string> = {
      'pageview': 'visibility',
      'click': 'touch_app',
      'conversion': 'check_circle',
      'error': 'error',
      'custom': 'code',
      'form_submit': 'send',
      'scroll': 'swap_vert'
    };
    return icons[type] || 'analytics';
  }

  getEventLabel(type: string): string {
    const labels: Record<string, string> = {
      'pageview': 'Seitenaufruf',
      'click': 'Klick',
      'conversion': 'Conversion',
      'error': 'Fehler',
      'custom': 'Event',
      'form_submit': 'Formular',
      'scroll': 'Scroll'
    };
    return labels[type] || type;
  }

  getDeviceIcon(deviceType?: 'desktop' | 'mobile' | 'tablet'): string {
    const icons: Record<string, string> = {
      'desktop': 'computer',
      'mobile': 'smartphone',
      'tablet': 'tablet'
    };
    return icons[deviceType || 'desktop'] || 'devices';
  }

  async cleanupOldData(): Promise<void> {
    const confirmed = await this.confirmationService.confirm({
      title: 'Analytics bereinigen',
      message: 'Möchtest du alte Analytics-Daten (älter als 90 Tage) wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.',
      confirmText: 'Ja, löschen',
      cancelText: 'Abbrechen',
      type: 'danger',
      icon: 'delete_sweep'
    });

    if (!confirmed) return;
    
    this.http.delete<{ deleted: number }>(`${this.API_URL}/cleanup`).subscribe({
      next: (result) => {
        this.confirmationService.confirm({
          title: 'Erfolgreich bereinigt',
          message: `${result.deleted} Analytics-Events wurden erfolgreich gelöscht.`,
          confirmText: 'OK',
          type: 'success',
          icon: 'check_circle'
        });
        this.loadDashboard();
      },
      error: () => {
        this.confirmationService.confirm({
          title: 'Fehler beim Löschen',
          message: 'Die Analytics-Daten konnten nicht gelöscht werden. Bitte versuche es später erneut.',
          confirmText: 'OK',
          type: 'danger',
          icon: 'error'
        });
      }
    });
  }
}
