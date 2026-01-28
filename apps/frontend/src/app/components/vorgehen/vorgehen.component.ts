import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { PageTitleComponent } from '../../shared/page-title/page-title.component';
import { CommonModule } from '@angular/common';
import { IconComponent } from "../../shared/icon/icon.component";

type Step = {
  id: string;
  title: string;
  summary: string;
  duration?: string;
  output?: string;
  you?: string[];
  me?: string[];
  icon: string;   // inline SVG
  done?: boolean; // für eventuelles Styling
};

@Component({
  selector: 'app-vorgehen',
  standalone: true,
  imports: [PageTitleComponent, CommonModule, IconComponent],
  templateUrl: './vorgehen.component.html',
  styleUrl: './vorgehen.component.scss'
})
export class VorgehenComponent {
  constructor(public router: Router) {}

  steps: Step[] = [
    {
      id: 'kickoff',
      title: 'Kickoff',
      summary: 'Kurzes Gespräch: Ziel, Scope, Rahmenbedingungen. Danach klare To-dos.',
      duration: '30–45 Min',
      output: 'Kurzprotokoll & nächste Schritte',
      you: ['Ziele & Rahmen (Budget/Timing)', 'Ansprechpartner & Entscheidungsweg'],
      me: ['Machbarkeitseinschätzung', 'Risiken & Annahmen'],
      icon: 'flag'
    },
    {
      id: 'scope',
      title: 'Angebot & Scope',
      summary: 'Konkreter Umfang, Aufwandsschätzung, Meilensteine, Schnittstellen.',
      duration: '1–3 Tage',
      output: 'Angebot / Statement of Work',
      you: ['Feedback zum Scope', 'Zugang zu relevanten Unterlagen'],
      me: ['Konkretes Angebot mit Milestones', 'Roadmap & Deliverables'],
      icon: 'target'
    },
    {
      id: 'build',
      title: 'Umsetzung',
      summary: 'Iterativ entwickeln; kurze Feedbackschleifen. Kein Overengineering.',
      duration: 'abhängig vom Umfang',
      output: 'Inkremente, Doku, Tests',
      you: ['Review der Inkremente', 'Zugänge/Accounts bei Bedarf'],
      me: ['Frontend (Angular/TS)', 'API (NestJS/Node.js)', 'DB (PostgreSQL)'],
      icon: 'code'
    },
    {
      id: 'handover',
      title: 'Übergabe & Go-Live',
      summary: 'Deployment, Smoke-Tests, Übergabedoku. Klarer Verantwortungswechsel.',
      duration: '1–2 Tage',
      output: 'Release + Übergabedokumentation',
      you: ['Go-Live-Fenster', 'Finales OK'],
      me: ['Deployment (Docker/CI/CD)', 'Monitoring-Checks', 'Übergabe-Call'],
      icon: 'publish'
    },
    {
      id: 'support',
      title: 'Support',
      summary: 'Störungsbehebung nach vereinbarten Reaktionszeiten. Optionale Weiterentwicklung.',
      duration: 'laufend',
      output: 'SLA nach Bedarf',
      you: ['Kontaktkanal (Mail/Phone)', 'Priorität des Tickets'],
      me: ['Fehleranalyse & Fix', 'Kleine Verbesserungen nach Absprache'],
      icon: 'support'
    }
  ];

  trackById = (_: number, s: Step) => s.id;

}
