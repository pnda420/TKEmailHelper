import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

export interface ServiceItem {
  title: string;
  short: string;
  price?: string;
  badge?: string;
  features: string[];
  cta?: string;
  route: string;
}


@Component({
  selector: 'app-it-services',
  standalone: true,
  imports: [RouterLink, CommonModule],
  templateUrl: './it-services.component.html',
  styleUrl: './it-services.component.scss'
})
export class ItServicesComponent {

  constructor(public router: Router) {}

  public services: ServiceItem[] = [
    {
      title: 'IT-Support & Wartung',
      short: 'Zuverlässige Betreuung deiner IT-Infrastruktur mit schneller Reaktionszeit und proaktiver Wartung.',
      price: 'ab 89€/Monat',
      badge: '🚀 Schnellstart',
      features: [
        'Remote-Support binnen 4 Stunden',
        'Monatliche System-Updates',
        'Backup-Monitoring',
        'Sicherheits-Checks',
        'Helpdesk per E-Mail & Telefon'
      ],
      cta: 'Support-Paket wählen',
      route: '/services/support'
    },
    {
      title: 'Cloud & Server Management',
      short: 'Professionelle Verwaltung deiner Server und Cloud-Infrastruktur für maximale Verfügbarkeit und Performance.',
      price: 'ab 299€/Monat',
      badge: '⭐ Am beliebtesten',
      features: [
        '24/7 Server-Monitoring',
        'Automatische Backups',
        'Performance-Optimierung',
        'Sicherheits-Updates',
        'Cloud-Migration Support',
        'Monatliche Reports'
      ],
      cta: 'Cloud-Lösung anfragen',
      route: '/services/cloud'
    },
    {
      title: 'IT-Projekt & Beratung',
      short: 'Individuelle IT-Projekte und strategische Beratung für deine digitale Transformation.',
      price: 'auf Anfrage',
      badge: '💎 Individuell',
      features: [
        'Analyse deiner IT-Landschaft',
        'Individuelle Lösungskonzepte',
        'Projekt-Management',
        'Technologie-Beratung',
        'Implementierung & Schulung',
        'Langfristige Partnerschaft'
      ],
      cta: 'Projekt besprechen',
      route: '/services/consulting'
    }
  ];

  getServices(): ServiceItem[] {
    return this.services;
  }

  getServiceByRoute(route: string): ServiceItem | undefined {
    return this.services.find(s => s.route === route);
  }
}
