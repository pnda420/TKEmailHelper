import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { ConfigService } from './config.service';
import { ConsentService } from './consent/consent.service';

// ===== ANALYTICS EVENT TYPES =====
export type AnalyticsEventType = 
  | 'pageview' 
  | 'click' 
  | 'scroll' 
  | 'form_submit' 
  | 'conversion'
  | 'error'
  | 'custom';

export interface AnalyticsEvent {
  type: AnalyticsEventType;
  page: string;
  referrer?: string;
  userAgent?: string;
  screenSize?: string;
  timestamp: number;
  sessionId: string;
  metadata?: Record<string, any>;
}

@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {
  private get API_URL(): string {
    return `${this.configService.apiUrl}/analytics`;
  }
  private sessionId: string = '';
  private isBrowser: boolean;

  constructor(
    private http: HttpClient,
    private consentService: ConsentService,
    private configService: ConfigService,
    private router: Router,
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
    if (this.isBrowser) {
      this.sessionId = this.getOrCreateSessionId();
      this.setupPageviewTracking();
    }
  }

  /**
   * Generiert oder lädt Session-ID
   */
  private getOrCreateSessionId(): string {
    const key = 'lub_session';
    let sessionId = sessionStorage.getItem(key);
    
    if (!sessionId) {
      sessionId = this.generateSessionId();
      sessionStorage.setItem(key, sessionId);
    }
    
    return sessionId;
  }

  /**
   * Generiert eine einfache Session-ID
   */
  private generateSessionId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
  }

  /**
   * Automatisches Pageview-Tracking bei Navigation
   */
  private setupPageviewTracking(): void {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      this.trackPageview(event.urlAfterRedirects);
    });

    // Initial pageview
    setTimeout(() => {
      this.trackPageview(this.router.url);
    }, 100);
  }

  /**
   * Prüft ob Analytics erlaubt ist
   */
  private mayTrack(): boolean {
    return this.consentService.isAllowed('analytics');
  }

  /**
   * Tracked einen Pageview
   */
  trackPageview(path: string): void {
    if (!this.mayTrack() || !this.isBrowser) return;

    const event: AnalyticsEvent = {
      type: 'pageview',
      page: path,
      referrer: document.referrer || undefined,
      userAgent: navigator.userAgent,
      screenSize: `${window.innerWidth}x${window.innerHeight}`,
      timestamp: Date.now(),
      sessionId: this.sessionId
    };

    this.sendEvent(event);
  }

  /**
   * Tracked ein Click-Event
   */
  trackClick(elementId: string, metadata?: Record<string, any>): void {
    if (!this.mayTrack() || !this.isBrowser) return;

    const event: AnalyticsEvent = {
      type: 'click',
      page: this.router.url,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      metadata: { elementId, ...metadata }
    };

    this.sendEvent(event);
  }

  /**
   * Tracked eine Conversion (z.B. Kontaktformular)
   */
  trackConversion(goal: string, metadata?: Record<string, any>): void {
    if (!this.mayTrack() || !this.isBrowser) return;

    const event: AnalyticsEvent = {
      type: 'conversion',
      page: this.router.url,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      metadata: { goal, ...metadata }
    };

    this.sendEvent(event);
  }

  /**
   * Tracked ein Custom Event
   */
  trackEvent(eventName: string, metadata?: Record<string, any>): void {
    if (!this.mayTrack() || !this.isBrowser) return;

    const event: AnalyticsEvent = {
      type: 'custom',
      page: this.router.url,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      metadata: { eventName, ...metadata }
    };

    this.sendEvent(event);
  }

  /**
   * Tracked einen Fehler
   */
  trackError(error: string, metadata?: Record<string, any>): void {
    if (!this.mayTrack() || !this.isBrowser) return;

    const event: AnalyticsEvent = {
      type: 'error',
      page: this.router.url,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      metadata: { error, ...metadata }
    };

    this.sendEvent(event);
  }

  /**
   * Sendet Event ans Backend
   */
  private sendEvent(event: AnalyticsEvent): void {
    const analyticsHeaders = this.consentService.getAnalyticsHeaders();
    console.log('[Analytics] Sending event:', event.type, event.page);
    console.log('[Analytics] Consent headers:', analyticsHeaders);
    console.log('[Analytics] API URL:', `${this.API_URL}/event`);
    
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      ...analyticsHeaders
    });

    // Fire and forget - aber logge Fehler für Debugging
    this.http.post(`${this.API_URL}/event`, event, { headers }).subscribe({
      next: () => console.log('[Analytics] Event sent successfully'),
      error: (err) => console.error('[Analytics] Error sending event:', err)
    });
  }
}
