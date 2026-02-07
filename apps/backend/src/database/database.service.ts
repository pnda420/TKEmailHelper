import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sql from 'mssql';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: sql.ConnectionPool | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private readonly config: sql.config;

  constructor(private readonly configService: ConfigService) {
    this.config = {
      server: this.configService.get<string>('MSSQL_HOST', '192.168.2.10'),
      port: parseInt(this.configService.get<string>('MSSQL_PORT', '49948'), 10),
      database: this.configService.get<string>('MSSQL_DATABASE', 'eazybusiness'),
      user: this.configService.get<string>('MSSQL_USER', 'jtl_readonly'),
      password: this.configService.get<string>('MSSQL_PASSWORD', ''),
      options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
      },
      pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000,
      },
    };
  }

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    await this.disconnect();
  }

  private async connect(): Promise<void> {
    try {
      this.pool = await new sql.ConnectionPool(this.config).connect();
      this.logger.log(`✅ MSSQL Connection Pool aufgebaut (${this.config.database} @ ${this.config.server}:${this.config.port})`);

      this.pool.on('error', (err) => {
        this.logger.error('❌ MSSQL Pool Fehler:', err.message);
        this.scheduleReconnect();
      });
    } catch (error) {
      this.logger.error(`❌ MSSQL Verbindung fehlgeschlagen: ${error.message}`);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.logger.warn('🔄 Reconnect in 5 Sekunden...');
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      await this.disconnect();
      await this.connect();
    }, 5000);
  }

  private async disconnect(): Promise<void> {
    try {
      if (this.pool) {
        await this.pool.close();
        this.pool = null;
        this.logger.log('MSSQL Connection Pool geschlossen');
      }
    } catch (error) {
      this.logger.error(`Fehler beim Schließen des Pools: ${error.message}`);
    }
  }

  /**
   * Führt eine beliebige SQL-Query aus (READ-ONLY!)
   */
  async query(sqlQuery: string): Promise<{ recordset: any[]; rowCount: number; duration: number }> {
    if (!this.pool || !this.pool.connected) {
      // Versuch erneut zu verbinden
      await this.connect();
      if (!this.pool || !this.pool.connected) {
        throw new Error('Keine Datenbankverbindung verfügbar');
      }
    }

    const start = Date.now();
    try {
      const result = await this.pool.request().query(sqlQuery);
      const duration = Date.now() - start;

      this.logger.debug(`Query ausgeführt (${duration}ms, ${result.recordset?.length ?? 0} Zeilen)`);

      return {
        recordset: result.recordset ?? [],
        rowCount: result.recordset?.length ?? 0,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - start;
      this.logger.error(`Query fehlgeschlagen (${duration}ms): ${error.message}`);
      throw error;
    }
  }

  /**
   * Führt eine parametrisierte SQL-Query aus (sicher gegen SQL-Injection)
   */
  async queryWithParams(
    sqlQuery: string,
    params: Record<string, { type: any; value: any }>,
  ): Promise<{ recordset: any[]; rowCount: number; duration: number }> {
    if (!this.pool || !this.pool.connected) {
      await this.connect();
      if (!this.pool || !this.pool.connected) {
        throw new Error('Keine Datenbankverbindung verfügbar');
      }
    }

    const start = Date.now();
    try {
      const request = this.pool.request();
      (request as any).timeout = 10000; // 10s timeout

      for (const [name, param] of Object.entries(params)) {
        request.input(name, param.type, param.value);
      }

      const result = await request.query(sqlQuery);
      const duration = Date.now() - start;

      this.logger.debug(`Parameterized query (${duration}ms, ${result.recordset?.length ?? 0} rows)`);

      return {
        recordset: result.recordset ?? [],
        rowCount: result.recordset?.length ?? 0,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - start;
      this.logger.error(`Parameterized query failed (${duration}ms): ${error.message}`);
      throw error;
    }
  }
}
