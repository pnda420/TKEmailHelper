import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable } from 'rxjs';
import { 
  ConsentState, 
  ConsentCategory, 
  DEFAULT_CONSENT, 
  CONSENT_VERSION, 
  CONSENT_STORAGE_KEY 
} from './consent.model';

@Injectable({
  providedIn: 'root'
})
export class ConsentService {
  private consentSubject = new BehaviorSubject<ConsentState>(DEFAULT_CONSENT);
  private showBannerSubject = new BehaviorSubject<boolean>(false);
  private isBrowser: boolean;

  consent$ = this.consentSubject.asObservable();
  showBanner$ = this.showBannerSubject.asObservable();

  constructor(@Inject(PLATFORM_ID) platformId: Object) {
    this.isBrowser = isPlatformBrowser(platformId);
    this.loadConsent();
  }

  /**
   * Lädt gespeicherten Consent aus localStorage
   */
  private loadConsent(): void {
    if (!this.isBrowser) return;

    try {
      const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
      if (stored) {
        const consent: ConsentState = JSON.parse(stored);
        // Prüfe ob Version aktuell ist
        if (consent.version === CONSENT_VERSION && consent.timestamp > 0) {
          this.consentSubject.next(consent);
          this.showBannerSubject.next(false);
          return;
        }
      }
      // Kein oder veralteter Consent -> Banner zeigen
      this.showBannerSubject.next(true);
    } catch {
      this.showBannerSubject.next(true);
    }
  }

  /**
   * Speichert Consent in localStorage
   */
  private saveConsent(consent: ConsentState): void {
    if (!this.isBrowser) return;
    
    try {
      localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(consent));
    } catch (e) {
      console.error('Consent konnte nicht gespeichert werden:', e);
    }
  }

  /**
   * Aktueller Consent-Status
   */
  get consent(): ConsentState {
    return this.consentSubject.getValue();
  }

  /**
   * Prüft ob eine Kategorie erlaubt ist
   */
  isAllowed(category: ConsentCategory): boolean {
    if (category === 'necessary') return true;
    return this.consent[category] === true;
  }

  /**
   * Alle Cookies akzeptieren
   */
  acceptAll(): void {
    const consent: ConsentState = {
      necessary: true,
      functional: true,
      analytics: true,
      timestamp: Date.now(),
      version: CONSENT_VERSION
    };
    this.consentSubject.next(consent);
    this.saveConsent(consent);
    this.showBannerSubject.next(false);
  }

  /**
   * Nur notwendige Cookies akzeptieren
   */
  acceptNecessaryOnly(): void {
    const consent: ConsentState = {
      necessary: true,
      functional: false,
      analytics: false,
      timestamp: Date.now(),
      version: CONSENT_VERSION
    };
    this.consentSubject.next(consent);
    this.saveConsent(consent);
    this.showBannerSubject.next(false);
  }

  /**
   * Individuelle Auswahl speichern
   */
  saveCustomConsent(functional: boolean, analytics: boolean): void {
    const consent: ConsentState = {
      necessary: true,
      functional,
      analytics,
      timestamp: Date.now(),
      version: CONSENT_VERSION
    };
    this.consentSubject.next(consent);
    this.saveConsent(consent);
    this.showBannerSubject.next(false);
  }

  /**
   * Banner wieder anzeigen (für Einstellungen-Link im Footer)
   */
  showSettings(): void {
    this.showBannerSubject.next(true);
  }

  /**
   * Banner schließen ohne Änderungen
   */
  closeBanner(): void {
    this.showBannerSubject.next(false);
  }

  /**
   * Consent zurücksetzen (für Testzwecke)
   */
  resetConsent(): void {
    if (!this.isBrowser) return;
    localStorage.removeItem(CONSENT_STORAGE_KEY);
    this.consentSubject.next(DEFAULT_CONSENT);
    this.showBannerSubject.next(true);
  }

  /**
   * Gibt Header für Analytics-Requests zurück
   */
  getAnalyticsHeaders(): Record<string, string> {
    return this.isAllowed('analytics') 
      ? { 'X-Consent-Analytics': 'true' } 
      : {};
  }
}
