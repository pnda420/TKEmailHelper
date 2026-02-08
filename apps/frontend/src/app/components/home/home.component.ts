import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Subscription, forkJoin } from 'rxjs';
import { ApiService, Email, EmailStats, AiUsageStats } from '../../api/api.service';
import { ToastService } from '../../shared/toasts/toast.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  standalone: true,
  imports: [CommonModule, RouterModule]
})
export class HomeComponent implements OnInit, OnDestroy {
  // Stats
  emailStats: EmailStats = { inbox: 0, sent: 0, trash: 0, unread: 0 };
  templateCount = 0;
  aiStats: AiUsageStats | null = null;

  // Recent emails
  recentEmails: Email[] = [];

  // State
  loading = true;
  refreshing = false;
  now = new Date();
  formattedDate = '';

  private subs: Subscription[] = [];
  private clockInterval: any;

  constructor(
    public router: Router,
    private api: ApiService,
    private toasts: ToastService
  ) {}

  ngOnInit(): void {
    this.updateDate();
    this.loadDashboard();
    this.clockInterval = setInterval(() => { this.now = new Date(); this.updateDate(); }, 60_000);
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    clearInterval(this.clockInterval);
  }

  loadDashboard(): void {
    this.loading = true;

    const sub = forkJoin({
      stats: this.api.getEmailStats(),
      templates: this.api.getEmailTemplates(),
      emails: this.api.getEmails(8, 0),
      ai: this.api.getAiUsageStats(30),
    }).subscribe({
      next: ({ stats, templates, emails, ai }) => {
        this.emailStats = stats;
        this.templateCount = templates.length;
        this.recentEmails = emails.emails.slice(0, 8);
        this.aiStats = ai;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
    this.subs.push(sub);
  }

  refreshEmails(): void {
    this.refreshing = true;
    const sub = this.api.refreshEmails().subscribe({
      next: (res) => {
        this.toasts.success(`${res.stored} neue E-Mails abgerufen`);
        this.refreshing = false;
        this.loadDashboard();
      },
      error: () => {
        this.toasts.error('Fehler beim Abrufen der E-Mails');
        this.refreshing = false;
      }
    });
    this.subs.push(sub);
  }

  // Helpers
  getGreeting(): string {
    const h = this.now.getHours();
    if (h < 12) return 'Guten Morgen';
    if (h < 18) return 'Guten Tag';
    return 'Guten Abend';
  }

  getInitials(email: Email): string {
    const name = email.fromName || email.fromAddress || '?';
    const parts = name.trim().split(/\s+/);
    return parts.length > 1
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : name.substring(0, 2).toUpperCase();
  }

  timeAgo(date: string | Date): string {
    const d = new Date(date);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'gerade eben';
    if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min`;
    if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std`;
    if (diff < 604800) return `vor ${Math.floor(diff / 86400)} Tag${Math.floor(diff / 86400) > 1 ? 'en' : ''}`;
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  }

  formatCost(usd: number): string {
    return usd.toFixed(2).replace('.', ',') + ' $';
  }

  private updateDate(): void {
    this.formattedDate = this.now.toLocaleDateString('de-DE', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    }) + ' · ' + this.now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }
}