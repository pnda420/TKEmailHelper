import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';
import { ApiService, SystemHealth, HealthHistoryEntry } from '../../../api/api.service';
import { AdminLayoutComponent } from '../admin-layout/admin-layout.component';

@Component({
  selector: 'app-admin-health',
  standalone: true,
  imports: [CommonModule, AdminLayoutComponent],
  templateUrl: './admin-health.component.html',
  styleUrl: './admin-health.component.scss',
})
export class AdminHealthComponent implements OnInit, OnDestroy, AfterViewInit {
  health: SystemHealth | null = null;
  loading = true;
  error = '';
  lastChecked: Date | null = null;
  private refreshInterval: any;

  // DB Management
  dbClearing = '';  // which action is in progress
  dbMessage = '';
  dbMessageType: 'success' | 'error' = 'success';
  confirmAction = ''; // which action needs confirmation

  @ViewChild('latencyCanvas') latencyCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('memoryCanvas') memoryCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('cpuCanvas') cpuCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('uptimeCanvas') uptimeCanvasRef!: ElementRef<HTMLCanvasElement>;

  activeChart: 'latency' | 'memory' | 'cpu' | 'uptime' = 'latency';

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.loadHealth();
    this.refreshInterval = setInterval(() => this.loadHealth(), 30_000);
  }

  ngAfterViewInit(): void {}

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
        setTimeout(() => this.drawCharts(), 50);
      },
      error: (err) => {
        this.error = err.error?.message || 'System-Status konnte nicht abgerufen werden';
        this.loading = false;
      },
    });
  }

  get overallStatus(): 'ok' | 'degraded' | 'down' {
    if (!this.health) return 'down';
    if (!this.health.services.vpn?.connected && !this.health.services.postgres?.connected) return 'down';
    if (!this.health.services.vpn?.connected) return 'degraded';
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

  get connectedCount(): number {
    if (!this.health) return 0;
    let count = 0;
    if (this.health.services.vpn?.connected) count++;
    if (this.health.services.postgres?.connected) count++;
    if (this.health.services.mssql?.connected) count++;
    if (this.health.services.imapIdle?.connected) count++;
    return count;
  }

  get totalServices(): number {
    return 4;
  }

  get avgLatency(): number {
    if (!this.health?.history?.length) return 0;
    const last = this.health.history.slice(-5);
    return Math.round(last.reduce((s, h) => s + h.totalLatency, 0) / last.length);
  }

  formatLastHealthPing(): string {
    const ping = this.health?.services?.mssql?.lastHealthPing;
    if (!ping) return '—';
    try {
      return new Date(ping).toLocaleTimeString('de-DE');
    } catch {
      return '—';
    }
  }

  getMemoryPercent(): number {
    if (!this.health) return 0;
    const { heapUsed, heapTotal } = this.health.system.memoryMb;
    return Math.round((heapUsed / heapTotal) * 100);
  }

  getOsMemoryPercent(): number {
    if (!this.health?.system?.os) return 0;
    return Math.round((this.health.system.os.usedMemMb / this.health.system.os.totalMemMb) * 100);
  }

  getMemoryColor(): string {
    const pct = this.getMemoryPercent();
    if (pct > 85) return 'red';
    if (pct > 65) return 'yellow';
    return 'green';
  }

  getCpuColor(): string {
    const pct = this.health?.system?.cpuPercent || 0;
    if (pct > 80) return 'red';
    if (pct > 50) return 'yellow';
    return 'green';
  }

  formatLastChecked(): string {
    if (!this.lastChecked) return '';
    return this.lastChecked.toLocaleTimeString('de-DE');
  }

  switchChart(chart: 'latency' | 'memory' | 'cpu' | 'uptime'): void {
    this.activeChart = chart;
    setTimeout(() => this.drawCharts(), 50);
  }

  // ==================== DB MANAGEMENT ====================

  requestClear(action: string): void {
    this.confirmAction = action;
    this.dbMessage = '';
  }

  cancelClear(): void {
    this.confirmAction = '';
  }

  confirmClear(): void {
    const action = this.confirmAction;
    this.confirmAction = '';
    this.executeClear(action);
  }

  private executeClear(action: string): void {
    this.dbClearing = action;
    this.dbMessage = '';

    let obs: Observable<{ message: string; deleted?: number; updated?: number }>;
    switch (action) {
      case 'all': obs = this.api.clearAllEmails(); break;
      case 'inbox': obs = this.api.clearInboxEmails(); break;
      case 'sent': obs = this.api.clearSentEmails(); break;
      case 'trash': obs = this.api.clearTrashEmails(); break;
      case 'ai': obs = this.api.clearAiData(); break;
      default: return;
    }

    obs.subscribe({
      next: (res: { message: string }) => {
        this.dbMessage = res.message;
        this.dbMessageType = 'success';
        this.dbClearing = '';
      },
      error: (err: any) => {
        this.dbMessage = err.error?.message || 'Fehler beim Löschen';
        this.dbMessageType = 'error';
        this.dbClearing = '';
      },
    });
  }

  // ==================== CHART DRAWING ====================

  private drawCharts(): void {
    if (!this.health?.history?.length) return;
    const history = this.health.history;

    switch (this.activeChart) {
      case 'latency':
        this.drawLatencyChart(history);
        break;
      case 'memory':
        this.drawMemoryChart(history);
        break;
      case 'cpu':
        this.drawCpuChart(history);
        break;
      case 'uptime':
        this.drawUptimeChart(history);
        break;
    }
  }

  private drawLatencyChart(history: HealthHistoryEntry[]): void {
    const canvas = this.latencyCanvasRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);

    const pad = { top: 20, right: 16, bottom: 30, left: 44 };
    const cw = w - pad.left - pad.right;
    const ch = h - pad.top - pad.bottom;

    const datasets = [
      { data: history.map(e => e.pgLatency), color: '#5B9BD5', label: 'PostgreSQL' },
      { data: history.map(e => e.vpnLatency), color: '#34D399', label: 'VPN' },
      { data: history.map(e => e.mssqlLatency), color: '#F06529', label: 'MSSQL' },
    ];

    const allVals = datasets.flatMap(d => d.data);
    const maxVal = Math.max(10, ...allVals) * 1.15;

    // Grid
    this.drawGrid(ctx, pad, cw, ch, maxVal, 'ms', history);

    // Lines
    for (const ds of datasets) {
      this.drawLine(ctx, ds.data, ds.color, pad, cw, ch, maxVal);
    }

    // Legend
    this.drawLegend(ctx, datasets.map(d => ({ color: d.color, label: d.label })), w, pad);
  }

  private drawMemoryChart(history: HealthHistoryEntry[]): void {
    const canvas = this.memoryCanvasRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);

    const pad = { top: 20, right: 16, bottom: 30, left: 44 };
    const cw = w - pad.left - pad.right;
    const ch = h - pad.top - pad.bottom;

    const datasets = [
      { data: history.map(e => e.rssMb), color: '#8B5CF6', label: 'RSS' },
      { data: history.map(e => e.heapUsedMb), color: '#3B82F6', label: 'Heap Used' },
      { data: history.map(e => e.heapTotalMb), color: 'rgba(59,130,246,0.3)', label: 'Heap Total' },
    ];

    const allVals = datasets.flatMap(d => d.data);
    const maxVal = Math.max(50, ...allVals) * 1.15;

    this.drawGrid(ctx, pad, cw, ch, maxVal, 'MB', history);

    // Draw heap total as area
    this.drawArea(ctx, history.map(e => e.heapTotalMb), 'rgba(59,130,246,0.08)', 'rgba(59,130,246,0.25)', pad, cw, ch, maxVal);
    this.drawLine(ctx, history.map(e => e.rssMb), '#8B5CF6', pad, cw, ch, maxVal);
    this.drawLine(ctx, history.map(e => e.heapUsedMb), '#3B82F6', pad, cw, ch, maxVal);

    this.drawLegend(ctx, datasets.map(d => ({ color: d.color, label: d.label })), w, pad);
  }

  private drawCpuChart(history: HealthHistoryEntry[]): void {
    const canvas = this.cpuCanvasRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);

    const pad = { top: 20, right: 16, bottom: 30, left: 44 };
    const cw = w - pad.left - pad.right;
    const ch = h - pad.top - pad.bottom;

    const maxVal = 100;

    this.drawGrid(ctx, pad, cw, ch, maxVal, '%', history);
    this.drawArea(ctx, history.map(e => e.cpuPercent), 'rgba(236,72,153,0.1)', 'rgba(236,72,153,0.3)', pad, cw, ch, maxVal);
    this.drawLine(ctx, history.map(e => e.cpuPercent), '#EC4899', pad, cw, ch, maxVal);

    this.drawLegend(ctx, [{ color: '#EC4899', label: 'CPU %' }], w, pad);
  }

  private drawUptimeChart(history: HealthHistoryEntry[]): void {
    const canvas = this.uptimeCanvasRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);

    const pad = { top: 20, right: 16, bottom: 30, left: 16 };
    const cw = w - pad.left - pad.right;
    const ch = h - pad.top - pad.bottom;

    // Service uptime timeline
    const services = [
      { key: 'vpnOk' as const, label: 'VPN', color: '#34D399' },
      { key: 'pgOk' as const, label: 'PostgreSQL', color: '#5B9BD5' },
      { key: 'mssqlOk' as const, label: 'MSSQL', color: '#F06529' },
      { key: 'imapOk' as const, label: 'IMAP', color: '#a78bfa' },
    ];

    const rowH = Math.min(28, ch / services.length - 4);
    const barW = history.length > 1 ? cw / history.length : cw;

    services.forEach((svc, si) => {
      const y = pad.top + si * (rowH + 6);

      // Label
      ctx.fillStyle = '#6b7280';
      ctx.font = '11px Inter, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(svc.label, pad.left + 4, y + rowH / 2 + 4);

      // Bars
      const labelWidth = 80;
      history.forEach((entry, i) => {
        const x = pad.left + labelWidth + i * ((cw - labelWidth) / Math.max(history.length, 1));
        const bw = (cw - labelWidth) / Math.max(history.length, 1) - 1;
        const ok = entry[svc.key];

        ctx.fillStyle = ok ? svc.color : 'rgba(239,68,68,0.6)';
        ctx.beginPath();
        ctx.roundRect(x, y, Math.max(bw, 2), rowH, 3);
        ctx.fill();

        if (!ok) {
          ctx.fillStyle = 'rgba(239,68,68,0.15)';
          ctx.beginPath();
          ctx.roundRect(x, y, Math.max(bw, 2), rowH, 3);
          ctx.fill();
        }
      });
    });
  }

  // ==================== CHART HELPERS ====================

  private drawGrid(
    ctx: CanvasRenderingContext2D,
    pad: { top: number; right: number; bottom: number; left: number },
    cw: number, ch: number, maxVal: number, unit: string,
    history: HealthHistoryEntry[]
  ): void {
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 1;
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#9ca3af';
    ctx.textAlign = 'right';

    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const y = pad.top + ch - (ch / steps) * i;
      const val = Math.round((maxVal / steps) * i);

      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + cw, y);
      ctx.stroke();

      ctx.fillText(`${val}${unit}`, pad.left - 6, y + 3);
    }

    // Time labels
    if (history.length > 1) {
      ctx.textAlign = 'center';
      const labelCount = Math.min(6, history.length);
      for (let i = 0; i < labelCount; i++) {
        const idx = Math.round((i / (labelCount - 1)) * (history.length - 1));
        const x = pad.left + (idx / (history.length - 1)) * cw;
        try {
          const t = new Date(history[idx].timestamp).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
          ctx.fillText(t, x, pad.top + ch + 16);
        } catch {}
      }
    }
  }

  private drawLine(
    ctx: CanvasRenderingContext2D,
    data: number[], color: string,
    pad: { top: number; right: number; bottom: number; left: number },
    cw: number, ch: number, maxVal: number
  ): void {
    if (data.length < 2) return;

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.beginPath();
    data.forEach((val, i) => {
      const x = pad.left + (i / (data.length - 1)) * cw;
      const y = pad.top + ch - (val / maxVal) * ch;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Dots on last point
    const lastX = pad.left + cw;
    const lastY = pad.top + ch - (data[data.length - 1] / maxVal) * ch;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawArea(
    ctx: CanvasRenderingContext2D,
    data: number[], fillColor: string, strokeColor: string,
    pad: { top: number; right: number; bottom: number; left: number },
    cw: number, ch: number, maxVal: number
  ): void {
    if (data.length < 2) return;

    ctx.fillStyle = fillColor;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top + ch);
    data.forEach((val, i) => {
      const x = pad.left + (i / (data.length - 1)) * cw;
      const y = pad.top + ch - (val / maxVal) * ch;
      ctx.lineTo(x, y);
    });
    ctx.lineTo(pad.left + cw, pad.top + ch);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    data.forEach((val, i) => {
      const x = pad.left + (i / (data.length - 1)) * cw;
      const y = pad.top + ch - (val / maxVal) * ch;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  private drawLegend(
    ctx: CanvasRenderingContext2D,
    items: { color: string; label: string }[],
    w: number,
    pad: { top: number; right: number; bottom: number; left: number }
  ): void {
    ctx.font = '10px Inter, system-ui, sans-serif';
    let x = w - pad.right;

    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      const tw = ctx.measureText(item.label).width;
      x -= tw + 20;

      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.arc(x + 5, pad.top - 8, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#6b7280';
      ctx.textAlign = 'left';
      ctx.fillText(item.label, x + 13, pad.top - 4);
    }
  }
}
