import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ApiService,
  AppLog,
  LogLevel,
  LogQueryParams,
  LogStats,
} from '../../../api/api.service';
import { AdminLayoutComponent } from '../admin-layout/admin-layout.component';
import { ConfirmationService } from '../../../shared/confirmation/confirmation.service';

@Component({
  selector: 'app-admin-logs',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminLayoutComponent],
  templateUrl: './admin-logs.component.html',
  styleUrl: './admin-logs.component.scss',
})
export class AdminLogsComponent implements OnInit, OnDestroy {
  // Data
  logs: AppLog[] = [];
  stats: LogStats | null = null;
  selectedLog: AppLog | null = null;
  total = 0;
  page = 1;
  limit = 50;

  // Filters
  levelFilter = '';
  searchTerm = '';
  sourceFilter = '';
  dateFrom = '';
  dateTo = '';
  statsHours = 24;

  // UI state
  loading = true;
  statsLoading = true;
  detailLoading = false;
  purging = false;
  error = '';

  // Toast
  toastMessage = '';
  toastType: 'success' | 'error' = 'success';
  private toastTimeout: any;

  // Auto-refresh
  private refreshInterval: any;

  LogLevel = LogLevel;

  constructor(
    private api: ApiService,
    private confirmationService: ConfirmationService,
  ) {}

  ngOnInit(): void {
    this.loadStats();
    this.loadLogs();

    // Auto-refresh every 30s
    this.refreshInterval = setInterval(() => {
      this.loadStats();
      if (this.page === 1) this.loadLogs(true);
    }, 30000);
  }

  ngOnDestroy(): void {
    clearInterval(this.refreshInterval);
    clearTimeout(this.toastTimeout);
  }

  // ==================== DATA LOADING ====================

  loadStats(): void {
    this.statsLoading = true;
    this.api.getLogStats(this.statsHours).subscribe({
      next: (stats) => {
        this.stats = stats;
        this.statsLoading = false;
      },
      error: () => {
        this.statsLoading = false;
      },
    });
  }

  loadLogs(silent = false): void {
    if (!silent) this.loading = true;
    this.error = '';

    const params: LogQueryParams = {
      page: this.page,
      limit: this.limit,
    };
    if (this.levelFilter) params.level = this.levelFilter;
    if (this.searchTerm) params.search = this.searchTerm;
    if (this.sourceFilter) params.source = this.sourceFilter;
    if (this.dateFrom) params.from = this.dateFrom;
    if (this.dateTo) params.to = this.dateTo;

    this.api.getLogs(params).subscribe({
      next: (res) => {
        this.logs = res.data;
        this.total = res.total;
        this.loading = false;
      },
      error: (err) => {
        console.error('Fehler beim Laden der Logs:', err);
        this.error = 'Fehler beim Laden der Logs';
        this.loading = false;
      },
    });
  }

  loadDetail(log: AppLog): void {
    if (this.selectedLog?.id === log.id) {
      this.selectedLog = null;
      return;
    }

    this.detailLoading = true;
    this.api.getLogDetail(log.id).subscribe({
      next: (detail) => {
        this.selectedLog = detail;
        this.detailLoading = false;
      },
      error: () => {
        this.selectedLog = log; // fallback to list data
        this.detailLoading = false;
      },
    });
  }

  // ==================== FILTERS ====================

  applyFilters(): void {
    this.page = 1;
    this.loadLogs();
  }

  clearFilters(): void {
    this.levelFilter = '';
    this.searchTerm = '';
    this.sourceFilter = '';
    this.dateFrom = '';
    this.dateTo = '';
    this.page = 1;
    this.loadLogs();
  }

  get hasActiveFilters(): boolean {
    return !!(this.levelFilter || this.searchTerm || this.sourceFilter || this.dateFrom || this.dateTo);
  }

  // ==================== PAGINATION ====================

  get totalPages(): number {
    return Math.ceil(this.total / this.limit);
  }

  get pageNumbers(): number[] {
    const pages: number[] = [];
    const start = Math.max(1, this.page - 2);
    const end = Math.min(this.totalPages, this.page + 2);
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }

  goToPage(p: number): void {
    if (p >= 1 && p <= this.totalPages && p !== this.page) {
      this.page = p;
      this.loadLogs();
    }
  }

  // ==================== ACTIONS ====================

  async purgeLogs(): Promise<void> {
    const confirmed = await this.confirmationService.confirm({
      title: 'Logs löschen',
      message: 'Möchtest du alle Logs älter als 90 Tage unwiderruflich löschen?',
      confirmText: 'Löschen',
      cancelText: 'Abbrechen',
      type: 'danger',
    });

    if (!confirmed) return;

    this.purging = true;
    this.api.purgeLogs(90).subscribe({
      next: (res) => {
        this.showToast(`${res.deleted} Logs gelöscht`, 'success');
        this.purging = false;
        this.loadLogs();
        this.loadStats();
      },
      error: () => {
        this.showToast('Fehler beim Löschen', 'error');
        this.purging = false;
      },
    });
  }

  // ==================== HELPERS ====================

  getLevelClass(level: string): string {
    switch (level) {
      case LogLevel.ERROR: return 'level-error';
      case LogLevel.WARN: return 'level-warn';
      case LogLevel.INFO: return 'level-info';
      case LogLevel.DEBUG: return 'level-debug';
      default: return '';
    }
  }

  getLevelIcon(level: string): string {
    switch (level) {
      case LogLevel.ERROR: return 'error';
      case LogLevel.WARN: return 'warning';
      case LogLevel.INFO: return 'info';
      case LogLevel.DEBUG: return 'bug_report';
      default: return 'circle';
    }
  }

  getStatusClass(code: number | null): string {
    if (!code) return '';
    if (code >= 500) return 'status-5xx';
    if (code >= 400) return 'status-4xx';
    if (code >= 300) return 'status-3xx';
    return 'status-2xx';
  }

  formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  formatDuration(ms: number | null): string {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  truncate(str: string | null, len = 120): string {
    if (!str) return '-';
    return str.length > len ? str.substring(0, len) + '…' : str;
  }

  closeDetail(): void {
    this.selectedLog = null;
  }

  private showToast(message: string, type: 'success' | 'error'): void {
    this.toastMessage = message;
    this.toastType = type;
    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => (this.toastMessage = ''), 3500);
  }
}
