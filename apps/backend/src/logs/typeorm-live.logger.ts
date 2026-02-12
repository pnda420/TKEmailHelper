import { Logger as TypeOrmLogger } from 'typeorm';
import { Logger } from '@nestjs/common';

/**
 * Custom TypeORM logger that routes SQL queries through NestJS Logger
 * so they appear in the Live Console SSE stream.
 *
 * SQL queries are shortened to: "SELECT FROM users (3 params, 12ms)"
 */
export class TypeOrmLiveLogger implements TypeOrmLogger {
  private readonly logger = new Logger('SQL');

  logQuery(query: string, parameters?: any[]): void {
    const short = this.shortenQuery(query);
    const params = parameters?.length ? ` (${parameters.length} params)` : '';
    this.logger.log(`${short}${params}`);
  }

  logQueryError(error: string | Error, query: string, parameters?: any[]): void {
    const short = this.shortenQuery(query);
    const params = parameters?.length ? ` (${parameters.length} params)` : '';
    const errMsg = typeof error === 'string' ? error : error.message;
    this.logger.error(`FAILED ${short}${params} → ${errMsg}`);
  }

  logQuerySlow(time: number, query: string, parameters?: any[]): void {
    const short = this.shortenQuery(query);
    const params = parameters?.length ? ` (${parameters.length} params)` : '';
    this.logger.warn(`SLOW ${short}${params} → ${time}ms`);
  }

  logSchemaBuild(message: string): void {
    this.logger.debug(message);
  }

  logMigration(message: string): void {
    this.logger.log(message);
  }

  log(level: 'log' | 'info' | 'warn', message: any): void {
    switch (level) {
      case 'warn':
        this.logger.warn(message);
        break;
      default:
        this.logger.log(message);
    }
  }

  /**
   * Shorten a SQL query to a readable summary:
   * "SELECT FROM users" / "INSERT INTO emails" / "UPDATE ai_config SET ..." / "DELETE FROM app_log"
   */
  private shortenQuery(query: string): string {
    const q = query.trim();

    // SELECT ... FROM "table"
    const selectMatch = q.match(/^SELECT\s+.*?\s+FROM\s+"?(\w+)"?/i);
    if (selectMatch) return `SELECT FROM ${selectMatch[1]}`;

    // INSERT INTO "table"
    const insertMatch = q.match(/^INSERT\s+INTO\s+"?(\w+)"?/i);
    if (insertMatch) return `INSERT INTO ${insertMatch[1]}`;

    // UPDATE "table" SET
    const updateMatch = q.match(/^UPDATE\s+"?(\w+)"?\s+SET/i);
    if (updateMatch) return `UPDATE ${updateMatch[1]}`;

    // DELETE FROM "table"
    const deleteMatch = q.match(/^DELETE\s+FROM\s+"?(\w+)"?/i);
    if (deleteMatch) return `DELETE FROM ${deleteMatch[1]}`;

    // START TRANSACTION / COMMIT / ROLLBACK
    if (/^(START\s+TRANSACTION|BEGIN|COMMIT|ROLLBACK)/i.test(q)) {
      return q.split(/\s/).slice(0, 2).join(' ').toUpperCase();
    }

    // Fallback: first 60 chars
    return q.length > 60 ? q.substring(0, 60) + '…' : q;
  }
}
