import { Controller, Get, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { ConfigService } from '@nestjs/config';
import { Public } from './auth/decorators/public.decorator';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { AdminGuard } from './auth/guards/admin.guard';
import { DatabaseService } from './database/database.service';
import { ImapIdleService } from './emails/imap-idle.service';
import { DataSource } from 'typeorm';
import * as net from 'net';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService,
    private readonly dataSource: DataSource,
    private readonly imapIdle: ImapIdleService,
  ) { }

  /**
   * TCP-Probe: Prüft ob ein Host:Port über das Netzwerk (VPN) erreichbar ist.
   * Kurzer Timeout (3s) um schnell Feedback zu geben.
   */
  private checkTcpReachable(host: string, port: number, timeoutMs = 3000): Promise<{ reachable: boolean; latency: number; error?: string }> {
    return new Promise((resolve) => {
      const start = Date.now();
      const socket = new net.Socket();

      const cleanup = () => {
        socket.removeAllListeners();
        socket.destroy();
      };

      socket.setTimeout(timeoutMs);

      socket.on('connect', () => {
        const latency = Date.now() - start;
        cleanup();
        resolve({ reachable: true, latency });
      });

      socket.on('timeout', () => {
        cleanup();
        resolve({ reachable: false, latency: Date.now() - start, error: `Timeout nach ${timeoutMs}ms` });
      });

      socket.on('error', (err) => {
        cleanup();
        resolve({ reachable: false, latency: Date.now() - start, error: err.message });
      });

      socket.connect(port, host);
    });
  }

  @Public()
  @Get('health')
  health() {
    return { status: 'ok' };
  }

  /**
   * Lightweight Connection-Status für Header-Anzeige (alle eingeloggten User)
   * Schnell: ~50ms statt ~500ms vom vollen Health-Check
   */
  @UseGuards(JwtAuthGuard)
  @Get('api/system/status')
  async systemStatus() {
    const vpnHost = this.configService.get<string>('MSSQL_HOST', '192.168.2.10');
    const vpnPort = parseInt(this.configService.get<string>('MSSQL_PORT', '49948'), 10);

    // Parallel: VPN TCP-Probe + Postgres ping
    const [vpnProbe, pgOk] = await Promise.all([
      this.checkTcpReachable(vpnHost, vpnPort, 2000),
      this.dataSource.query('SELECT 1').then(() => true).catch(() => false),
    ]);

    return {
      vpn: vpnProbe.reachable,
      vpnLatency: vpnProbe.latency,
      postgres: pgOk,
      mssql: this.databaseService.isConnected(),
      imap: this.imapIdle.getStatus().connected,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * System-Status: Alle Verbindungen + Infos (Admin only)
   */
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('api/system/health')
  async systemHealth() {
    const startTime = Date.now();

    // 0. VPN / Netzwerk Check (TCP-Probe zum WaWi-Server)
    const vpnHost = this.configService.get<string>('MSSQL_HOST', '192.168.2.10');
    const vpnPort = parseInt(this.configService.get<string>('MSSQL_PORT', '49948'), 10);
    let vpn = { connected: false, latency: 0, error: '', host: vpnHost, port: vpnPort };
    try {
      const probe = await this.checkTcpReachable(vpnHost, vpnPort, 3000);
      vpn.connected = probe.reachable;
      vpn.latency = probe.latency;
      vpn.error = probe.error || '';
    } catch (e) {
      vpn.error = e.message;
    }

    // 1. PostgreSQL Check
    let postgres = { connected: false, latency: 0, error: '' };
    try {
      const pgStart = Date.now();
      await this.dataSource.query('SELECT 1');
      postgres = { connected: true, latency: Date.now() - pgStart, error: '' };
    } catch (e) {
      postgres = { connected: false, latency: 0, error: e.message };
    }

    // 2. MSSQL (WaWi) Check
    let mssql = { connected: false, latency: 0, error: '', host: '', port: 0 };
    try {
      const mssqlHost = this.configService.get<string>('MSSQL_HOST', '');
      const mssqlPort = parseInt(this.configService.get<string>('MSSQL_PORT', '0'), 10);
      mssql.host = mssqlHost;
      mssql.port = mssqlPort;

      if (this.databaseService.isConnected()) {
        const msStart = Date.now();
        await this.databaseService.query('SELECT 1 AS ping');
        mssql.connected = true;
        mssql.latency = Date.now() - msStart;
      } else {
        mssql.error = vpn.connected
          ? 'Pool nicht verbunden (VPN steht, MSSQL-Service prüfen)'
          : 'Pool nicht verbunden (VPN nicht erreichbar!)';
      }
    } catch (e) {
      mssql.error = e.message;
    }

    // 3. IMAP Check (just config info, no live connection to avoid side effects)
    const imapHost = this.configService.get<string>('MAIL_EINGANG', '');
    const smtpHost = this.configService.get<string>('MAIL_AUSGANG', '');
    const mailAccount = this.configService.get<string>('MAIL', '');

    // 4. System info
    const uptime = process.uptime();
    const memUsage = process.memoryUsage();

    // 5. DB Connection Details from DatabaseService
    const dbStats = this.databaseService.getConnectionStats();

    return {
      status: postgres.connected ? (vpn.connected ? 'ok' : 'degraded') : 'degraded',
      timestamp: new Date().toISOString(),
      totalLatency: Date.now() - startTime,
      services: {
        vpn: {
          connected: vpn.connected,
          latency: vpn.latency,
          host: vpn.host,
          port: vpn.port,
          error: vpn.error || undefined,
        },
        postgres: {
          connected: postgres.connected,
          latency: postgres.latency,
          host: this.configService.get<string>('DB_HOST', 'unknown'),
          database: this.configService.get<string>('DB_NAME', 'unknown'),
          error: postgres.error || undefined,
        },
        mssql: {
          connected: mssql.connected,
          latency: mssql.latency,
          host: mssql.host,
          port: mssql.port,
          database: this.configService.get<string>('MSSQL_DATABASE', 'unknown'),
          error: mssql.error || undefined,
          reconnectAttempts: dbStats.reconnectAttempts,
          poolSize: dbStats.poolSize,
          lastHealthPing: dbStats.lastHealthPing,
        },
        mail: {
          account: mailAccount ? mailAccount.replace(/(.{3}).*(@.*)/, '$1***$2') : 'not configured',
          imapHost,
          smtpHost,
        },
        imapIdle: {
          ...this.imapIdle.getStatus(),
        },
      },
      system: {
        uptime: Math.floor(uptime),
        uptimeFormatted: this.formatUptime(uptime),
        nodeVersion: process.version,
        env: this.configService.get<string>('NODE_ENV', 'unknown'),
        memoryMb: {
          rss: Math.round(memUsage.rss / 1024 / 1024),
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        },
      },
    };
  }

  private formatUptime(seconds: number): string {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const parts: string[] = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    parts.push(`${m}m`);
    return parts.join(' ');
  }
}
