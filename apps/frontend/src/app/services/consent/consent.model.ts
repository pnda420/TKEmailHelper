// ===== CONSENT MODEL =====
// Single Source of Truth für Cookie/Tracking Consent

export interface ConsentState {
  necessary: true;       // Immer true - technisch notwendig
  functional: boolean;   // Komfort-Features (Theme, Preferences)
  analytics: boolean;    // Nutzungsstatistiken
  timestamp: number;     // Wann wurde Consent gegeben
  version: string;       // Version der Consent-Policy
}

export type ConsentCategory = 'necessary' | 'functional' | 'analytics';

export interface ConsentCategoryInfo {
  id: ConsentCategory;
  name: string;
  description: string;
  required: boolean;
  icon: string;
}

export const CONSENT_CATEGORIES: ConsentCategoryInfo[] = [
  {
    id: 'necessary',
    name: 'Notwendig',
    description: 'Diese Cookies sind für die Grundfunktionen der Website erforderlich (z.B. Login, Sicherheit).',
    required: true,
    icon: 'lock'
  },
  {
    id: 'functional',
    name: 'Funktional',
    description: 'Ermöglicht erweiterte Funktionen wie Theme-Einstellungen und gespeicherte Präferenzen.',
    required: false,
    icon: 'tune'
  },
  {
    id: 'analytics',
    name: 'Statistiken',
    description: 'Hilft uns zu verstehen, wie Besucher die Website nutzen, um sie zu verbessern. Alle Daten sind anonymisiert.',
    required: false,
    icon: 'bar_chart'
  }
];

export const DEFAULT_CONSENT: ConsentState = {
  necessary: true,
  functional: false,
  analytics: false,
  timestamp: 0,
  version: '1.0'
};

export const CONSENT_VERSION = '1.0';
export const CONSENT_STORAGE_KEY = 'lub_consent';
