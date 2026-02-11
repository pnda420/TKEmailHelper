import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Subscription, forkJoin } from 'rxjs';
import { trigger, transition, style, animate, stagger, query } from '@angular/animations';
import { ApiService, EmailStats, AiUsageStats } from '../../api/api.service';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../shared/toasts/toast.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  standalone: true,
  imports: [CommonModule, RouterModule],
  animations: [
    trigger('fadeUp', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(24px)' }),
        animate('600ms cubic-bezier(.23,1,.32,1)', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ]),
    trigger('staggerCards', [
      transition(':enter', [
        query('.stat-card', [
          style({ opacity: 0, transform: 'translateY(20px) scale(.96)' }),
          stagger(100, [
            animate('500ms cubic-bezier(.23,1,.32,1)', style({ opacity: 1, transform: 'translateY(0) scale(1)' }))
          ])
        ], { optional: true })
      ])
    ]),
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('800ms 200ms ease', style({ opacity: 1 }))
      ])
    ])
  ]
})
export class HomeComponent implements OnInit, OnDestroy {
  emailStats: EmailStats = { inbox: 0, sent: 0, trash: 0, unread: 0 };
  templateCount = 0;
  aiStats: AiUsageStats | null = null;

  loading = true;
  now = new Date();
  formattedDate = '';

  private subs: Subscription[] = [];
  private clockInterval: any;

  get isAdmin(): boolean {
    return this.authService.isAdmin();
  }

  constructor(
    public router: Router,
    private api: ApiService,
    private authService: AuthService,
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
      ai: this.api.getAiUsageStats(30),
    }).subscribe({
      next: ({ stats, templates, ai }) => {
        this.emailStats = stats;
        this.templateCount = templates.length;
        this.aiStats = ai;
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
    this.subs.push(sub);
  }

  getGreeting(): string {
    const h = this.now.getHours();
    if (h < 12) return 'Guten Morgen';
    if (h < 18) return 'Guten Tag';
    return 'Guten Abend';
  }

  formatTokens(tokens: number): string {
    if (tokens >= 1_000_000_000) {
      return (tokens / 1_000_000_000).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' Mrd';
    }
    if (tokens >= 1_000_000) {
      return (tokens / 1_000_000).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' Mio';
    }
    if (tokens >= 1_000) {
      return (tokens / 1_000).toLocaleString('de-DE', { maximumFractionDigits: 0 }) + 'k';
    }
    return tokens.toString();
  }

  formatCost(usd: number): string {
    return usd.toFixed(2).replace('.', ',') + ' $';
  }

  private updateDate(): void {
    this.formattedDate = this.now.toLocaleDateString('de-DE', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  }
}