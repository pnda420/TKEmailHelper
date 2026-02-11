import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sql from 'mssql';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: sql.ConnectionPool | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 50;
  private readonly config: sql.config;
  private isConnecting = false;

  constructor(private readonly configService: ConfigService) {
    const isProd = process.env.NODE_ENV === 'production';

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
        connectTimeout: 15000,  // 15s Timeout beim Verbinden
        requestTimeout: 15000,  // 15s Timeout pro Query
      },
      pool: {
        // ⚡ Weniger Connections = weniger Last auf WaWi MSSQL
        // JTL-Wawi hat begrenzte Connections — Prod + Dev + JTL-User teilen sich die
        max: isProd ? 5 : 3,
        min: 0,
        idleTimeoutMillis: 30000,
        acquireTimeoutMillis: 15000, // Max 15s auf freie Connection warten
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

  /**
   * Prüft ob die WaWi-Verbindung aktiv ist
   */
  isConnected(): boolean {
    return this.pool !== null && this.pool.connected;
  }

  private async connect(): Promise<void> {
    if (this.isConnecting) {
      this.logger.warn('⏳ Verbindungsaufbau läuft bereits...');
      return;
    }

    this.isConnecting = true;
    try {
      this.pool = await new sql.ConnectionPool(this.config).connect();
      this.reconnectAttempts = 0; // Reset bei Erfolg
      this.logger.log(
        `✅ MSSQL Connection Pool aufgebaut (${this.config.database} @ ${this.config.server}:${this.config.port}) ` +
        `[Pool: max=${this.config.pool?.max}, min=${this.config.pool?.min}]`
      );

      this.pool.on('error', (err) => {
        this.logger.error('❌ MSSQL Pool Fehler:', err.message);
        this.scheduleReconnect();
      });
    } catch (error) {
      this.logger.error(`❌ MSSQL Verbindung fehlgeschlagen: ${error.message}`);
      this.scheduleReconnect();
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Exponential Backoff: 5s → 10s → 20s → 40s → max 60s
   */
  private getReconnectDelay(): number {
    const baseDelay = 5000;
    const delay = Math.min(baseDelay * Math.pow(2, this.reconnectAttempts), 60000);
    return delay;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      this.logger.error(
        `🛑 MSSQL: ${this.MAX_RECONNECT_ATTEMPTS} Reconnect-Versuche fehlgeschlagen. ` +
        `WaWi-DB nicht erreichbar. Nächster Versuch erst bei nächster Query.`
      );
      return;
    }

    this.reconnectAttempts++;
    const delay = this.getReconnectDelay();
    this.logger.warn(
      `🔄 MSSQL Reconnect #${this.reconnectAttempts} in ${delay / 1000}s...`
    );

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      await this.disconnect();
      await this.connect();
    }, delay);
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
      this.pool = null; // Trotzdem nullen damit reconnect geht
    }
  }

  /**
   * Stellt sicher, dass ein aktiver Pool vorhanden ist.
   * Versucht bei Bedarf einen Reconnect.
   */
  private async ensureConnection(): Promise<sql.ConnectionPool> {
    if (this.pool && this.pool.connected) {
      return this.pool;
    }

    this.logger.warn('⚠️ Kein aktiver Pool — versuche Reconnect...');
    this.reconnectAttempts = 0; // Reset für On-Demand Reconnect
    await this.disconnect();
    await this.connect();

    if (!this.pool || !this.pool.connected) {
      throw new Error(
        'WaWi-Datenbankverbindung nicht verfügbar. ' +
        'Bitte prüfen: 1) VPN aktiv? 2) MSSQL Server erreichbar? 3) Connection-Limit nicht überschritten?'
      );
    }

    return this.pool;
  }

  /**
   * Führt eine beliebige SQL-Query aus (READ-ONLY!)
   */
  async query(sqlQuery: string): Promise<{ recordset: any[]; rowCount: number; duration: number }> {
    const pool = await this.ensureConnection();

    const start = Date.now();
    try {
      const result = await pool.request().query(sqlQuery);
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

      // Bei Connection-Fehlern Reconnect triggern
      if (error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED' || error.code === 'ESOCKET') {
        this.scheduleReconnect();
      }
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
    const pool = await this.ensureConnection();

    const start = Date.now();
    try {
      const request = pool.request();
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

      // Bei Connection-Fehlern Reconnect triggern
      if (error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED' || error.code === 'ESOCKET') {
        this.scheduleReconnect();
      }
      throw error;
    }
  }
}
