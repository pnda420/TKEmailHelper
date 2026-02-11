import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LogsService } from '../logs/logs.service';
import * as sql from 'mssql';
import * as net from 'net';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: sql.ConnectionPool | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private healthPingTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 100;
  private readonly config: sql.config;
  private isConnecting = false;
  private lastHealthPing: string | null = null;
  private consecutiveFailures = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly logsService: LogsService,
  ) {
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
        connectTimeout: 10000,   // 10s Timeout beim Verbinden (statt 15s)
        requestTimeout: 15000,   // 15s Timeout pro Query
        abortTransactionOnError: true,
      },
      pool: {
        // ⚡ Weniger Connections = weniger Last auf WaWi MSSQL
        max: isProd ? 5 : 3,
        min: 0,
        idleTimeoutMillis: 60000,        // 60s idle bevor Connection closed wird
        acquireTimeoutMillis: 10000,     // Max 10s auf freie Connection warten
      },
    };
  }

  async onModuleInit(): Promise<void> {
    // Startup mit Retry-Loop: Bis zu 5 Versuche beim Boot
    await this.connectWithRetry(5, 3000);
    // Health-Ping starten (alle 30s)
    this.startHealthPing();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopHealthPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    await this.disconnect();
  }

  // ─── Public API ─────────────────────────────────────────────

  /**
   * Prüft ob die WaWi-Verbindung aktiv ist
   */
  isConnected(): boolean {
    return this.pool !== null && this.pool.connected;
  }

  /**
   * Gibt Connection-Statistiken für den Health-Endpoint zurück
   */
  getConnectionStats(): {
    reconnectAttempts: number;
    poolSize: number;
    lastHealthPing: string | null;
  } {
    return {
      reconnectAttempts: this.reconnectAttempts,
      poolSize: (this.pool as any)?.pool?.size ?? 0,
      lastHealthPing: this.lastHealthPing,
    };
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
      this.consecutiveFailures = 0; // Reset bei Erfolg

      this.logger.debug(`Query ausgeführt (${duration}ms, ${result.recordset?.length ?? 0} Zeilen)`);

      return {
        recordset: result.recordset ?? [],
        rowCount: result.recordset?.length ?? 0,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - start;
      this.consecutiveFailures++;
      this.logger.error(`Query fehlgeschlagen (${duration}ms): ${error.message}`);

      if (this.isConnectionError(error)) {
        this.logToDb('error', `MSSQL Query fehlgeschlagen (${duration}ms): ${error.message}`, error);
        this.handleConnectionError('query');
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
      this.consecutiveFailures = 0;

      this.logger.debug(`Parameterized query (${duration}ms, ${result.recordset?.length ?? 0} rows)`);

      return {
        recordset: result.recordset ?? [],
        rowCount: result.recordset?.length ?? 0,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - start;
      this.consecutiveFailures++;
      this.logger.error(`Parameterized query failed (${duration}ms): ${error.message}`);

      if (this.isConnectionError(error)) {
        this.logToDb('error', `MSSQL Parameterized Query fehlgeschlagen (${duration}ms): ${error.message}`, error);
        this.handleConnectionError('parameterized query');
      }
      throw error;
    }
  }

  // ─── Connection Management ──────────────────────────────────

  /**
   * TCP-Vorcheck: Ist der MSSQL-Port überhaupt erreichbar? (VPN up?)
   * Spart 10s Timeout wenn VPN down ist.
   */
  private async tcpPreCheck(timeoutMs = 3000): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      const cleanup = () => {
        socket.removeAllListeners();
        socket.destroy();
      };

      socket.setTimeout(timeoutMs);
      socket.on('connect', () => { cleanup(); resolve(true); });
      socket.on('timeout', () => { cleanup(); resolve(false); });
      socket.on('error', () => { cleanup(); resolve(false); });

      socket.connect(this.config.port!, this.config.server!);
    });
  }

  /**
   * Startup-Retry: Versucht die Verbindung mehrfach herzustellen.
   */
  private async connectWithRetry(maxAttempts: number, delayMs: number): Promise<void> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // TCP-Vorcheck: Ist der Host überhaupt erreichbar?
      const reachable = await this.tcpPreCheck(3000);
      if (!reachable) {
        const msg = `TCP-Vorcheck fehlgeschlagen (${this.config.server}:${this.config.port}) — VPN aktiv? Versuch ${attempt}/${maxAttempts}`;
        this.logger.warn(`🌐 ${msg}`);
        this.logToDb('warn', msg);
        if (attempt < maxAttempts) {
          await this.sleep(delayMs);
        }
        continue;
      }

      // TCP erreichbar → MSSQL-Verbindung versuchen
      try {
        await this.connect();
        if (this.isConnected()) {
          this.logger.log(`✅ MSSQL verbunden nach Versuch ${attempt}/${maxAttempts}`);
          return;
        }
      } catch {
        // connect() loggt bereits
      }

      if (attempt < maxAttempts) {
        this.logger.warn(`🔄 Startup-Retry ${attempt}/${maxAttempts} — nächster Versuch in ${delayMs / 1000}s...`);
        await this.sleep(delayMs);
      }
    }

    const failMsg = `MSSQL-Verbindung konnte nach ${maxAttempts} Startup-Versuchen nicht hergestellt werden. Background-Reconnect läuft weiter.`;
    this.logger.error(`🛑 ${failMsg}`);
    this.logToDb('error', failMsg);
    // Hintergrund-Reconnect starten
    this.scheduleReconnect();
  }

  private async connect(): Promise<void> {
    if (this.isConnecting) {
      this.logger.warn('⏳ Verbindungsaufbau läuft bereits...');
      return;
    }

    this.isConnecting = true;
    try {
      this.pool = await new sql.ConnectionPool(this.config).connect();
      this.reconnectAttempts = 0;
      this.consecutiveFailures = 0;
      this.logger.log(
        `✅ MSSQL Connection Pool aufgebaut (${this.config.database} @ ${this.config.server}:${this.config.port}) ` +
        `[Pool: max=${this.config.pool?.max}, min=${this.config.pool?.min}]`
      );

      // Pool-Error-Handler: sofort reconnecten bei Verbindungsverlust
      this.pool.on('error', (err) => {
        this.logger.error(`❌ MSSQL Pool Fehler: ${err.message}`);
        this.logToDb('error', `MSSQL Pool Fehler: ${err.message}`, err);
        this.handleConnectionError('pool-error-event');
      });
    } catch (error) {
      this.logger.error(`❌ MSSQL Verbindung fehlgeschlagen: ${error.message}`);
      this.logToDb('error', `MSSQL Verbindung fehlgeschlagen: ${error.message}`, error);
      this.pool = null;
      throw error; // Weiterwerfen für connectWithRetry
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Stellt sicher, dass ein aktiver Pool vorhanden ist.
   * On-Demand Reconnect mit bis zu 3 schnellen Versuchen.
   */
  private async ensureConnection(): Promise<sql.ConnectionPool> {
    // Fast path: Pool ist da und connected
    if (this.pool && this.pool.connected) {
      return this.pool;
    }

    this.logger.warn('⚠️ Kein aktiver Pool — On-Demand Reconnect...');

    // Laufenden Reconnect-Timer stoppen (wir machen es jetzt sofort)
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Bis zu 3 schnelle Versuche für On-Demand Reconnect
    for (let attempt = 1; attempt <= 3; attempt++) {
      // TCP-Vorcheck: Nicht 10s warten wenn VPN down ist
      const reachable = await this.tcpPreCheck(2000);
      if (!reachable) {
        this.logger.warn(`🌐 VPN/Netzwerk nicht erreichbar — Versuch ${attempt}/3`);
        if (attempt < 3) {
          await this.sleep(1000);
        }
        continue;
      }

      try {
        await this.disconnect();
        this.reconnectAttempts = 0;
        await this.connect();
        if (this.pool && this.pool.connected) {
          this.logger.log(`✅ On-Demand Reconnect erfolgreich (Versuch ${attempt}/3)`);
          return this.pool;
        }
      } catch {
        // connect() loggt bereits den Fehler
      }

      if (attempt < 3) {
        await this.sleep(1500);
      }
    }

    // Alle 3 Versuche fehlgeschlagen → Hintergrund-Reconnect starten
    this.scheduleReconnect();

    throw new Error(
      'WaWi-Datenbankverbindung nicht verfügbar. ' +
      'Mögliche Ursachen: 1) VPN nicht aktiv 2) MSSQL-Service gestoppt 3) Firewall blockiert Port ' +
      `${this.config.port} 4) Connection-Limit überschritten`
    );
  }

  // ─── Health Ping ────────────────────────────────────────────

  /**
   * Periodischer Health-Ping alle 30s.
   * Erkennt tote Connections BEVOR eine echte Query fehlschlägt.
   */
  private startHealthPing(): void {
    this.healthPingTimer = setInterval(async () => {
      if (!this.pool || !this.pool.connected) {
        return; // Reconnect läuft schon, kein Ping nötig
      }

      try {
        const start = Date.now();
        await this.pool.request().query('SELECT 1 AS health_ping');
        const latency = Date.now() - start;
        this.lastHealthPing = new Date().toISOString();
        this.consecutiveFailures = 0;

        // Langsamer Ping = Warnsignal
        if (latency > 5000) {
          this.logger.warn(`⚠️ Health-Ping langsam: ${latency}ms — Netzwerk/VPN-Probleme?`);
        }
      } catch (error) {
        this.logger.error(`❌ Health-Ping fehlgeschlagen: ${error.message}`);
        this.consecutiveFailures++;

        // Nach 2 fehlgeschlagenen Pings → Reconnect
        if (this.consecutiveFailures >= 2) {
          this.logger.warn('🔄 2 Health-Pings fehlgeschlagen — starte Reconnect...');
          this.logToDb('error', `MSSQL Health-Ping 2x fehlgeschlagen — Reconnect gestartet: ${error.message}`, error);
          this.handleConnectionError('health-ping');
        }
      }
    }, 30_000);
  }

  private stopHealthPing(): void {
    if (this.healthPingTimer) {
      clearInterval(this.healthPingTimer);
      this.healthPingTimer = null;
    }
  }

  // ─── Reconnect Logic ───────────────────────────────────────

  /**
   * Prüft ob ein Error ein Verbindungsfehler ist (vs. Query-Syntax-Fehler etc.)
   */
  private isConnectionError(error: any): boolean {
    const connectionErrorCodes = [
      'ECONNRESET', 'ECONNREFUSED', 'ESOCKET', 'ETIMEDOUT',
      'ENETUNREACH', 'ENOTFOUND', 'EPIPE', 'PROTOCOL_ERROR',
      'ECONNABORTED', 'EHOSTUNREACH',
    ];

    const connectionErrorMessages = [
      'connection was closed', 'connection lost',
      'failed to connect', 'socket hang up',
      'read ECONNRESET', 'network error',
    ];

    if (error.code && connectionErrorCodes.includes(error.code)) {
      return true;
    }

    const msg = (error.message || '').toLowerCase();
    return connectionErrorMessages.some(m => msg.includes(m));
  }

  /**
   * Zentrale Fehlerbehandlung: Disconnect + Reconnect scheduletn
   */
  private handleConnectionError(source: string): void {
    this.logger.warn(`🔌 Connection-Fehler erkannt (Quelle: ${source}) — plane Reconnect...`);

    // Pool markieren als kaputt
    if (this.pool) {
      this.disconnect().catch(() => { /* cleanup best-effort */ });
    }

    this.scheduleReconnect();
  }

  /**
   * Adaptive Backoff: Startet bei 2s, verdoppelt bis max 30s.
   * Wenn VPN down ist (viele Failures), wartet länger.
   */
  private getReconnectDelay(): number {
    const baseDelay = 2000; // Start bei 2s (statt 5s)
    const maxDelay = this.consecutiveFailures > 10 ? 60000 : 30000; // Max 30s, bei vielen Failures 60s
    const delay = Math.min(baseDelay * Math.pow(2, this.reconnectAttempts), maxDelay);
    // Jitter: ±20% damit nicht alle Container gleichzeitig reconnecten
    const jitter = delay * (0.8 + Math.random() * 0.4);
    return Math.round(jitter);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return; // Bereits geplant

    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      const maxMsg = `MSSQL: ${this.MAX_RECONNECT_ATTEMPTS} Reconnect-Versuche aufgebraucht. Nächster Versuch erst bei nächster Query (On-Demand).`;
      this.logger.error(`🛑 ${maxMsg}`);
      this.logToDb('error', maxMsg);
      return;
    }

    this.reconnectAttempts++;
    const delay = this.getReconnectDelay();
    this.logger.warn(
      `🔄 MSSQL Reconnect #${this.reconnectAttempts} in ${(delay / 1000).toFixed(1)}s...`
    );

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;

      // TCP-Vorcheck bevor wir MSSQL-Connect versuchen
      const reachable = await this.tcpPreCheck(3000);
      if (!reachable) {
        this.logger.warn('🌐 TCP-Vorcheck fehlgeschlagen — VPN vermutlich down, warte...');
        this.scheduleReconnect(); // Nächsten Versuch planen
        return;
      }

      try {
        await this.disconnect();
        await this.connect();
        if (this.isConnected()) {
          this.logger.log('✅ MSSQL Reconnect erfolgreich!');
        } else {
          this.scheduleReconnect();
        }
      } catch {
        this.scheduleReconnect();
      }
    }, delay);
  }

  // ─── Helpers ────────────────────────────────────────────────

  private async disconnect(): Promise<void> {
    try {
      if (this.pool) {
        await this.pool.close();
        this.pool = null;
      }
    } catch (error) {
      this.logger.error(`Fehler beim Schließen des Pools: ${error.message}`);
      this.pool = null; // Trotzdem nullen damit reconnect geht
    }
  }

  /**
   * Persistiert Connection-Fehler in die app_logs DB-Tabelle,
   * damit sie im Admin-Panel sichtbar sind.
   */
  private logToDb(level: 'error' | 'warn' | 'info', message: string, error?: any): void {
    // Fire-and-forget: Darf nicht die Connection-Logik blockieren
    this.logsService[level](message, {
      source: 'DatabaseService',
      ...(error?.stack ? { stack: error.stack } : {}),
    }).catch(() => { /* LogsService nutzt PostgreSQL, nicht MSSQL — sollte funktionieren */ });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
