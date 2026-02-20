import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ApiService, SpamDeletionLog, SpamDeletionHistoryResponse, Mailbox } from '../../api/api.service';

interface ParsedEmailSummary {
  uid: number;
  subject: string;
  from: string;
  category: string;
  spamScore: number;
}

@Component({
  selector: 'app-spam-deletion-history',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './spam-deletion-history.component.html',
  styleUrl: './spam-deletion-history.component.scss',
})
export class SpamDeletionHistoryComponent implements OnInit, OnDestroy {
  // Data
  logs: SpamDeletionLog[] = [];
  totalLogs = 0;
  loading = false;
  initialLoad = true;

  // Pagination
  limit = 20;
  offset = 0;
  get currentPage(): number { return Math.floor(this.offset / this.limit) + 1; }
  get totalPages(): number { return Math.ceil(this.totalLogs / this.limit) || 1; }

  // Search & Filters
  searchQuery = '';
  private searchDebounceTimer?: any;
  filterUserEmail = '';
  filterMailboxId = '';
  filterCategory = '';

  // Filter options
  availableUsers: string[] = [];
  availableMailboxes: Mailbox[] = [];

  // Expanded rows
  expandedLogIds = new Set<string>();

  // Category config
  readonly categories = [
    { key: 'spam', label: 'Spam', icon: 'report', color: '#ef4444' },
    { key: 'scam', label: 'Scam', icon: 'gpp_bad', color: '#dc2626' },
    { key: 'phishing', label: 'Phishing', icon: 'phishing', color: '#b91c1c' },
    { key: 'newsletter', label: 'Newsletter', icon: 'newspaper', color: '#f59e0b' },
    { key: 'marketing', label: 'Marketing', icon: 'campaign', color: '#f97316' },
    { key: 'legitimate', label: 'Legitim', icon: 'check_circle', color: '#22c55e' },
  ];

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.loadFilters();
    this.loadLogs();
  }

  ngOnDestroy(): void {
    if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
  }

  // ════════════════════════════════════════════
  // DATA LOADING
  // ════════════════════════════════════════════

  loadLogs(): void {
    this.loading = true;
    this.api.spamKillerGetDeletionHistory({
      limit: this.limit,
      offset: this.offset,
      search: this.searchQuery || undefined,
      userEmail: this.filterUserEmail || undefined,
      mailboxId: this.filterMailboxId || undefined,
      category: this.filterCategory || undefined,
    }).subscribe({
      next: (res: SpamDeletionHistoryResponse) => {
        this.logs = res.logs;
        this.totalLogs = res.total;
        this.loading = false;
        this.initialLoad = false;
      },
      error: () => {
        this.loading = false;
        this.initialLoad = false;
      }
    });
  }

  loadFilters(): void {
    this.api.spamKillerGetDeletionUsers().subscribe({
      next: (users) => this.availableUsers = users,
    });
    this.api.getAllMailboxes().subscribe({
      next: (mailboxes) => this.availableMailboxes = mailboxes,
    });
  }

  // ════════════════════════════════════════════
  // SEARCH
  // ════════════════════════════════════════════

  onSearchInput(): void {
    if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
    this.searchDebounceTimer = setTimeout(() => {
      this.offset = 0;
      this.loadLogs();
    }, 350);
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.offset = 0;
    this.loadLogs();
  }

  // ════════════════════════════════════════════
  // FILTERS
  // ════════════════════════════════════════════

  onFilterChange(): void {
    this.offset = 0;
    this.loadLogs();
  }

  clearFilters(): void {
    this.searchQuery = '';
    this.filterUserEmail = '';
    this.filterMailboxId = '';
    this.filterCategory = '';
    this.offset = 0;
    this.loadLogs();
  }

  get hasActiveFilters(): boolean {
    return !!(this.searchQuery || this.filterUserEmail || this.filterMailboxId || this.filterCategory);
  }

  // ════════════════════════════════════════════
  // PAGINATION
  // ════════════════════════════════════════════

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.offset = (page - 1) * this.limit;
    this.loadLogs();
  }

  nextPage(): void { this.goToPage(this.currentPage + 1); }
  prevPage(): void { this.goToPage(this.currentPage - 1); }

  get pageNumbers(): number[] {
    const pages: number[] = [];
    const total = this.totalPages;
    const current = this.currentPage;
    const range = 2;

    for (let i = Math.max(1, current - range); i <= Math.min(total, current + range); i++) {
      pages.push(i);
    }
    return pages;
  }

  // ════════════════════════════════════════════
  // EXPAND / COLLAPSE
  // ════════════════════════════════════════════

  toggleLog(logId: string): void {
    if (this.expandedLogIds.has(logId)) {
      this.expandedLogIds.delete(logId);
    } else {
      this.expandedLogIds.add(logId);
    }
  }

  isExpanded(logId: string): boolean {
    return this.expandedLogIds.has(logId);
  }

  // ════════════════════════════════════════════
  // HELPERS
  // ════════════════════════════════════════════

  parseEmailSummaries(summariesJson: string): ParsedEmailSummary[] {
    try {
      const parsed = JSON.parse(summariesJson);
      if (Array.isArray(parsed)) return parsed;
      return [];
    } catch {
      return [];
    }
  }

  getCategoryInfo(key: string): { label: string; icon: string; color: string } {
    return this.categories.find(c => c.key === key) ?? { label: key, icon: 'help', color: '#6b7280' };
  }

  isSystemUser(userEmail: string): boolean {
    return userEmail === 'System';
  }

  formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffH = Math.floor(diffMs / 3600000);
    const diffD = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return 'Gerade eben';
    if (diffMin < 60) return `vor ${diffMin} Min.`;
    if (diffH < 24) return `vor ${diffH} Std.`;
    if (diffD < 7) return `vor ${diffD} Tag${diffD > 1 ? 'en' : ''}`;

    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  getMailboxName(mailboxId: string): string {
    const mb = this.availableMailboxes.find(m => m.id === mailboxId);
    return mb?.email || mb?.name || mailboxId;
  }
}
