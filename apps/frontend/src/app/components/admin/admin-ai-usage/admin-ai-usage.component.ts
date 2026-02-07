import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ApiService,
  AiUsageEntry,
  AiUsageQueryParams,
  AiUsageStats,
  AiBalance,
} from '../../../api/api.service';
import { AdminLayoutComponent } from '../admin-layout/admin-layout.component';

@Component({
  selector: 'app-admin-ai-usage',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminLayoutComponent],
  templateUrl: './admin-ai-usage.component.html',
  styleUrl: './admin-ai-usage.component.scss',
})
export class AdminAiUsageComponent implements OnInit, OnDestroy {
  // Data
  entries: AiUsageEntry[] = [];
  stats: AiUsageStats | null = null;
  balance: AiBalance | null = null;
  total = 0;
  page = 1;
  limit = 50;

  // Filters
  featureFilter = '';
  modelFilter = '';
  userFilter = '';
  dateFrom = '';
  dateTo = '';
  statsDays = 30;

  // UI
  loading = true;
  statsLoading = true;
  balanceLoading = true;

  // Auto-refresh
  private refreshInterval: any;

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.loadAll();
    this.refreshInterval = setInterval(() => this.loadAll(true), 60000);
  }

  ngOnDestroy(): void {
    clearInterval(this.refreshInterval);
  }

  loadAll(silent = false): void {
    this.loadStats();
    this.loadBalance();
    this.loadEntries(silent);
  }

  // ==================== DATA ====================

  loadStats(): void {
    this.statsLoading = true;
    this.api.getAiUsageStats(this.statsDays).subscribe({
      next: (s) => { this.stats = s; this.statsLoading = false; },
      error: () => this.statsLoading = false,
    });
  }

  loadBalance(): void {
    this.balanceLoading = true;
    this.api.getAiBalance().subscribe({
      next: (b) => { this.balance = b; this.balanceLoading = false; },
      error: () => this.balanceLoading = false,
    });
  }

  loadEntries(silent = false): void {
    if (!silent) this.loading = true;
    const params: AiUsageQueryParams = { page: this.page, limit: this.limit };
    if (this.featureFilter) params.feature = this.featureFilter;
    if (this.modelFilter) params.model = this.modelFilter;
    if (this.userFilter) params.userId = this.userFilter;
    if (this.dateFrom) params.from = this.dateFrom;
    if (this.dateTo) params.to = this.dateTo;

    this.api.getAiUsage(params).subscribe({
      next: (res) => {
        this.entries = res.data;
        this.total = res.total;
        this.loading = false;
      },
      error: () => this.loading = false,
    });
  }

  // ==================== FILTERS ====================

  applyFilters(): void {
    this.page = 1;
    this.loadEntries();
  }

  clearFilters(): void {
    this.featureFilter = '';
    this.modelFilter = '';
    this.userFilter = '';
    this.dateFrom = '';
    this.dateTo = '';
    this.page = 1;
    this.loadEntries();
  }

  get hasActiveFilters(): boolean {
    return !!(this.featureFilter || this.modelFilter || this.userFilter || this.dateFrom || this.dateTo);
  }

  // ==================== PAGINATION ====================

  get totalPages(): number {
    return Math.ceil(this.total / this.limit);
  }

  get pageNumbers(): number[] {
    const pages: number[] = [];
    const start = Math.max(1, this.page - 2);
    const end = Math.min(this.totalPages, this.page + 2);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  goToPage(p: number): void {
    if (p >= 1 && p <= this.totalPages && p !== this.page) {
      this.page = p;
      this.loadEntries();
    }
  }

  // ==================== HELPERS ====================

  formatCost(usd: number | string): string {
    const val = Number(usd) || 0;
    if (val < 0.01) return `$${val.toFixed(4)}`;
    return `$${val.toFixed(2)}`;
  }

  formatTokens(n: number | string): string {
    const val = Number(n) || 0;
    if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
    return val.toString();
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('de-DE', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  }

  formatDuration(ms: number | null): string {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  getFeatureLabel(f: string): string {
    const map: Record<string, string> = {
      'agent-analyze': 'KI-Agent',
      'agent-analyze-summary': 'KI-Agent (Summary)',
      'generate-email': 'E-Mail generieren',
      'analyze-email-for-reply': 'E-Mail analysieren',
      'summarize-email': 'Zusammenfassung',
      'recommend-template': 'Template-Empfehlung',
    };
    return map[f] || f;
  }

  getFeatureIcon(f: string): string {
    const map: Record<string, string> = {
      'agent-analyze': 'smart_toy',
      'agent-analyze-summary': 'smart_toy',
      'generate-email': 'edit_note',
      'analyze-email-for-reply': 'analytics',
      'summarize-email': 'summarize',
      'recommend-template': 'recommend',
    };
    return map[f] || 'api';
  }

  get uniqueFeatures(): string[] {
    return [...new Set(this.entries.map(e => e.feature))];
  }

  get uniqueModels(): string[] {
    return [...new Set(this.entries.map(e => e.model))];
  }

  getMaxDailyCost(): number {
    if (!this.stats?.dailyCost.length) return 1;
    return Math.max(...this.stats.dailyCost.map(d => Number(d.cost) || 0), 0.001);
  }
}
