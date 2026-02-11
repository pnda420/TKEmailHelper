import { Controller, Get, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { ConfigService } from '@nestjs/config';
import { Public } from './auth/decorators/public.decorator';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { AdminGuard } from './auth/guards/admin.guard';
import { DatabaseService } from './database/database.service';
import { DataSource } from 'typeorm';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService,
    private readonly dataSource: DataSource,
  ) { }

  @Public()
  @Get('health')
  health() {
    return { status: 'ok' };
  }

  /**
   * System-Status: Alle Verbindungen + Infos (Admin only)
   */
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('api/system/health')
  async systemHealth() {
    const startTime = Date.now();

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
        mssql.error = 'Pool nicht verbunden';
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

    return {
      status: postgres.connected ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      totalLatency: Date.now() - startTime,
      services: {
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
        },
        mail: {
          account: mailAccount ? mailAccount.replace(/(.{3}).*(@.*)/, '$1***$2') : 'not configured',
          imapHost,
          smtpHost,
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
