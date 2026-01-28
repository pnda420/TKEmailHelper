import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { Observable } from 'rxjs';
import { BehaviorSubject, Subject, timer } from 'rxjs';
import { map, takeUntil } from 'rxjs/operators';

type Status = 'UP' | 'DEGRADED' | 'DOWN' | 'MAINTENANCE';

export interface ServiceStatus {
  id: string;
  name: string;
  region?: string;
  status: Status;
  uptime24h: number;   // 0..1
  uptime7d: number;    // 0..1
  uptime30d: number;   // 0..1
  responseAvgMs?: number;
  responseP95Ms?: number;
  lastIncidentAt?: string; // ISO
  lastCheckAt: string;     // ISO
  nextCheckAt?: string;    // ISO
  version?: string;
  latencySeries?: number[];
  // interne Mock-Steuerung (wird im Template nicht angezeigt)
  mockState?: { degradeTicks?: number; downTicks?: number; baseLatency?: number };
}

@Component({
  selector: 'app-server-status',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './server-status.component.html',
  styleUrl: './server-status.component.scss'
})
export class ServerStatusComponent {
  /** Aktualisierungsintervall in ms */
  @Input() refreshMs = 3000;

  services$!: Observable<ServiceStatus[]>;
  lastUpdated = new Date().toISOString();
  overall: Status = 'UP';
  overallMessage = 'Alle Systeme betriebsbereit';

  // Sparkline-Größe (passt zu meinem HTML/SCSS)
  sparkWidth = 140;
  sparkHeight = 32;

  private store = new BehaviorSubject<ServiceStatus[]>(createInitialMock());
  private destroy$ = new Subject<void>();

  ngOnInit(): void {
    // Ticker: erzeugt alle refreshMs einen neuen Stand
    this.services$ = timer(0, this.refreshMs).pipe(
      map(() => {
        const next = tickMock(this.store.value, this.refreshMs);
        this.store.next(next);
        this.lastUpdated = new Date().toISOString();
        this.overall = computeOverall(next);
        this.overallMessage = overallToMessage(this.overall);
        return next;
      })
    );

    // Option: falls du irgendwo anders aufräumen willst
    this.services$.pipe(takeUntil(this.destroy$)).subscribe();
  }

  ngOnDestroy(): void {
    this.destroy$.next(); this.destroy$.complete();
  }

  // Template-Helper (gleich wie zuvor)
  trackById(_: number, s: ServiceStatus) { return s.id; }
  statusLabel(s: Status): string {
    return { UP: 'Online', DEGRADED: 'Eingeschränkt', DOWN: 'Offline', MAINTENANCE: 'Wartung' }[s];
  }
  statusClass(s: Status): string {
    return { UP: 'is-up', DEGRADED: 'is-degraded', DOWN: 'is-down', MAINTENANCE: 'is-maint' }[s];
  }
  pct(v?: number) { return v == null ? '–' : (v * 100).toFixed(2) + '%'; }
  fmtMs(v?: number) { return v == null || isNaN(v) ? '–' : Math.round(v) + ' ms'; }
  timeAgo(iso?: string) { return timeAgo(iso); }
  until(iso?: string) { return until(iso); }
  toSparklinePath(series: number[], w: number, h: number) { return toSparklinePath(series, w, h); }
  manualRefresh() { this.store.next(tickMock(this.store.value, this.refreshMs)); }
}

/* ---------------- Mock-Helfer ---------------- */

function createInitialMock(): ServiceStatus[] {
  const now = new Date().toISOString();
  return [
    mk('web', 'Web Frontend', 'eu-central', 120, '2.4.0'),
    mk('api', 'Public API', 'eu-central', 90, '1.12.3'),
    mk('db', 'Database', 'eu-central', 8, '14.10')
  ].map(s => ({ ...s, lastCheckAt: now, nextCheckAt: now }));

  function mk(id: string, name: string, region: string, baseLatency: number, version: string): ServiceStatus {
    const series = seedSeries(baseLatency, 24);
    return {
      id, name, region, status: 'UP',
      uptime24h: 0.999, uptime7d: 0.998, uptime30d: 0.9985,
      responseAvgMs: avg(series), responseP95Ms: p95(series),
      lastCheckAt: new Date().toISOString(),
      version, latencySeries: series,
      mockState: { baseLatency }
    };
  }
}

function tickMock(prev: ServiceStatus[], refreshMs: number): ServiceStatus[] {
  const now = new Date();
  const next = prev.map(s => {
    const ms = s.mockState ?? {};
    // Status-Phasen steuern (kurze Degradierungen/Ausfälle)
    if (!ms.degradeTicks && !ms.downTicks && s.status === 'UP') {
      if (Math.random() < 0.05) ms.degradeTicks = randInt(2, 4); // 10–20s
      if (Math.random() < 0.015) ms.downTicks = randInt(1, 2);   // 5–10s
    }

    let status: Status = s.status;
    if (ms.downTicks && ms.downTicks > 0) { status = 'DOWN'; ms.downTicks--; }
    else if (ms.degradeTicks && ms.degradeTicks > 0) { status = 'DEGRADED'; ms.degradeTicks--; }
    else { status = 'UP'; }

    // Latenz ableiten
    const base = (ms.baseLatency ?? 100);
    const sample =
      status === 'DOWN' ? jitter(base * 10, 0.35) :
        status === 'DEGRADED' ? jitter(base * 2.4, 0.25) :
          jitter(base * 1.0, 0.18);

    const series = [...(s.latencySeries ?? [])];
    const maxLen = 30;
    series.push(Math.max(1, sample));
    if (series.length > maxLen) series.shift();

    // Metriken
    const responseAvgMs = avg(series);
    const responseP95Ms = p95(series);

    // Uptime leicht driften lassen (realistisch, aber unaufgeregt)
    const u24 = driftUptime(s.uptime24h, status, { up: +0.0025, down: -0.010 });
    const u7 = driftUptime(s.uptime7d, status, { up: +0.0010, down: -0.004 });
    const u30 = driftUptime(s.uptime30d, status, { up: +0.0005, down: -0.002 });

    const lastIncidentAt = status !== 'UP' ? now.toISOString() : s.lastIncidentAt;
    const lastCheckAt = now.toISOString();
    const nextCheckAt = new Date(now.getTime() + refreshMs).toISOString();

    return {
      ...s,
      status,
      latencySeries: series,
      responseAvgMs, responseP95Ms,
      uptime24h: clamp01(u24), uptime7d: clamp01(u7), uptime30d: clamp01(u30),
      lastIncidentAt, lastCheckAt, nextCheckAt,
      mockState: ms
    };
  });

  return next;
}

function driftUptime(current: number, status: Status, step: { up: number; down: number }): number {
  const jitterUp = step.up * (0.8 + Math.random() * 0.4);   // ±20%
  const jitterDn = step.down * (0.8 + Math.random() * 0.4);
  const delta = status === 'UP' ? jitterUp : jitterDn;
  // leichte Rückführung in Richtung 0.999..1
  const target = 0.999;
  const pull = (target - current) * (status === 'UP' ? 0.05 : 0.01);
  return current + delta + pull;
}

/* --------- Utility --------- */
function jitter(v: number, pct: number) {
  const r = (Math.random() * 2 - 1) * pct; // -pct..+pct
  return v * (1 + r);
}
function randInt(a: number, b: number) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function clamp01(n: number) { return Math.max(0, Math.min(1, n)); }
function avg(arr: number[]) { return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0; }
function p95(arr: number[]) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor(0.95 * (sorted.length - 1));
  return sorted[idx];
}
function seedSeries(base: number, n: number) {
  const out: number[] = [];
  let prev = base;
  for (let i = 0; i < n; i++) {
    prev = prev * (1 + (Math.random() * 0.12 - 0.06)); // ±6%
    out.push(Math.max(1, prev));
  }
  return out;
}
function computeOverall(services: ServiceStatus[]): Status {
  if (!services.length) return 'MAINTENANCE';
  if (services.some(s => s.status === 'DOWN')) return 'DOWN';
  if (services.some(s => s.status === 'DEGRADED')) return 'DEGRADED';
  if (services.every(s => s.status === 'MAINTENANCE')) return 'MAINTENANCE';
  return 'UP';
}
function overallToMessage(s: Status): string {
  switch (s) {
    case 'UP': return 'Alle Systeme betriebsbereit';
    case 'DEGRADED': return 'Eingeschränkte Verfügbarkeit';
    case 'DOWN': return 'Störung – wir prüfen das';
    case 'MAINTENANCE': return 'Wartung aktiv';
  }
}
function toSparklinePath(series: number[], w: number, h: number): string {
  if (!series.length) return '';
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = Math.max(1, max - min);
  const pad = 2;
  const innerH = h - pad * 2;
  const step = (w - pad * 2) / Math.max(1, series.length - 1);

  const pts = series.map((v, i) => {
    const x = pad + i * step;
    const yNorm = (v - min) / range;
    const y = pad + innerH - yNorm * innerH;
    return [x, y];
  });

  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${pts[i][0]} ${pts[i][1]}`;
  return d;
}
function timeAgo(iso?: string): string {
  if (!iso) return '–';
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  if (diff < 0) return 'soeben';
  const s = Math.floor(diff / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60), day = Math.floor(h / 24);
  if (day > 0) return `vor ${day} Tag${day > 1 ? 'en' : ''}`;
  if (h > 0) return `vor ${h} Std`;
  if (m > 0) return `vor ${m} Min`;
  return 'soeben';
}
function until(iso?: string): string {
  if (!iso) return '–';
  const t = new Date(iso).getTime();
  const diff = t - Date.now();
  if (diff <= 0) return 'gleich';
  const s = Math.ceil(diff / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d > 0) return `${d} Tag${d > 1 ? 'e' : ''}`;
  if (h > 0) return `${h} Std`;
  if (m > 0) return `${m} Min`;
  return `${s} s`;
}