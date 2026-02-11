import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, SystemHealth } from '../../../api/api.service';
import { AdminLayoutComponent } from '../admin-layout/admin-layout.component';

@Component({
  selector: 'app-admin-health',
  standalone: true,
  imports: [CommonModule, AdminLayoutComponent],
  templateUrl: './admin-health.component.html',
  styleUrl: './admin-health.component.scss',
})
export class AdminHealthComponent implements OnInit, OnDestroy {
  health: SystemHealth | null = null;
  loading = true;
  error = '';
  lastChecked: Date | null = null;
  private refreshInterval: any;

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.loadHealth();
    // Auto-refresh every 30 seconds
    this.refreshInterval = setInterval(() => this.loadHealth(), 30_000);
  }

  ngOnDestroy(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  loadHealth(): void {
    this.loading = true;
    this.error = '';
    this.api.getSystemHealth().subscribe({
      next: (data) => {
        this.health = data;
        this.lastChecked = new Date();
        this.loading = false;
      },
      error: (err) => {
        this.error = err.error?.message || 'System-Status konnte nicht abgerufen werden';
        this.loading = false;
      },
    });
  }

  get overallStatus(): 'ok' | 'degraded' | 'down' {
    if (!this.health) return 'down';
    return this.health.status;
  }

  get overallStatusLabel(): string {
    switch (this.overallStatus) {
      case 'ok': return 'Alle Systeme online';
      case 'degraded': return 'Teilweise eingeschränkt';
      case 'down': return 'Systeme nicht erreichbar';
    }
  }

  get overallStatusIcon(): string {
    switch (this.overallStatus) {
      case 'ok': return 'check_circle';
      case 'degraded': return 'warning';
      case 'down': return 'error';
    }
  }

  getMemoryPercent(): number {
    if (!this.health) return 0;
    const { heapUsed, heapTotal } = this.health.system.memoryMb;
    return Math.round((heapUsed / heapTotal) * 100);
  }

  getMemoryColor(): string {
    const pct = this.getMemoryPercent();
    if (pct > 85) return 'red';
    if (pct > 65) return 'yellow';
    return 'green';
  }

  formatLastChecked(): string {
    if (!this.lastChecked) return '';
    return this.lastChecked.toLocaleTimeString('de-DE');
  }
}
