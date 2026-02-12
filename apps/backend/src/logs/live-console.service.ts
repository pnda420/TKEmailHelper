import { Injectable, LoggerService, LogLevel, ConsoleLogger } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';

export interface LiveLogEntry {
  timestamp: string;
  level: string;
  context: string;
  message: string;
  args?: any[];
}

/**
 * Custom Logger that intercepts ALL NestJS console output and broadcasts it via SSE.
 * Used as the app-level logger via `app.useLogger(liveConsole)` in main.ts.
 * 
 * All log output goes to:
 * 1. stdout (normal console, via ConsoleLogger)
 * 2. SSE stream (to connected admin clients)
 */
@Injectable()
export class LiveConsoleService extends ConsoleLogger implements LoggerService {
  private readonly logSubject = new Subject<LiveLogEntry>();
  
  // Keep a ring buffer of last 200 entries for new subscribers
  private readonly buffer: LiveLogEntry[] = [];
  private readonly maxBuffer = 200;

  /**
   * Get an observable stream of live log entries
   */
  getLogStream(): Observable<LiveLogEntry> {
    return this.logSubject.asObservable();
  }

  /**
   * Get buffered recent entries (for initial load when client connects)
   */
  getRecentLogs(): LiveLogEntry[] {
    return [...this.buffer];
  }

  // Override ConsoleLogger methods to intercept + broadcast

  log(message: any, context?: string): void;
  log(message: any, ...optionalParams: [...any, string?]): void;
  log(message: any, ...optionalParams: any[]): void {
    super.log(message, ...optionalParams);
    this.broadcast('log', message, optionalParams);
  }

  error(message: any, stackOrContext?: string): void;
  error(message: any, stack?: string, context?: string): void;
  error(message: any, ...optionalParams: any[]): void {
    super.error(message, ...optionalParams);
    this.broadcast('error', message, optionalParams);
  }

  warn(message: any, context?: string): void;
  warn(message: any, ...optionalParams: [...any, string?]): void;
  warn(message: any, ...optionalParams: any[]): void {
    super.warn(message, ...optionalParams);
    this.broadcast('warn', message, optionalParams);
  }

  debug(message: any, context?: string): void;
  debug(message: any, ...optionalParams: [...any, string?]): void;
  debug(message: any, ...optionalParams: any[]): void {
    super.debug(message, ...optionalParams);
    this.broadcast('debug', message, optionalParams);
  }

  verbose(message: any, context?: string): void;
  verbose(message: any, ...optionalParams: [...any, string?]): void;
  verbose(message: any, ...optionalParams: any[]): void {
    super.verbose(message, ...optionalParams);
    this.broadcast('verbose', message, optionalParams);
  }

  private broadcast(level: string, message: any, optionalParams: any[]): void {
    // Extract context from NestJS convention: last param is usually context string
    let context = '';
    if (optionalParams.length > 0) {
      const last = optionalParams[optionalParams.length - 1];
      if (typeof last === 'string') {
        context = last;
      }
    }

    const entry: LiveLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      context,
      message: typeof message === 'string' ? message : JSON.stringify(message),
    };

    // Add to ring buffer
    this.buffer.push(entry);
    if (this.buffer.length > this.maxBuffer) {
      this.buffer.shift();
    }

    // Broadcast to all subscribers
    this.logSubject.next(entry);
  }
}
