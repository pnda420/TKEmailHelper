import {
  ExceptionFilter, Catch, ArgumentsHost, HttpException,
  HttpStatus, Injectable, Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { LogsService } from './logs.service';
import { LogLevel } from './app-log.entity';

/**
 * Global exception filter that catches ALL exceptions and logs them to the database.
 * Also logs slow requests (>3s) and all 5xx errors.
 */
@Catch()
@Injectable()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(private readonly logsService: LogsService) {}

  async catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? (exception.getResponse() as any)?.message || exception.message
        : exception instanceof Error
          ? exception.message
          : 'Unknown error';

    const stack =
      exception instanceof Error ? exception.stack : undefined;

    // Determine log level based on status code
    let level: LogLevel = LogLevel.ERROR;
    if (status === 429) level = LogLevel.WARN;  // Rate limiting
    else if (status === 401 || status === 403) level = LogLevel.WARN;  // Auth issues
    else if (status >= 400 && status < 500) level = LogLevel.WARN;  // Client errors
    else if (status >= 500) level = LogLevel.ERROR;  // Server errors

    // Extract user info from request
    const user = (request as any).user;
    const userId = user?.id || user?.sub || null;
    const userEmail = user?.email || null;

    // Sanitize request body (strip passwords)
    let requestBody: string | null = null;
    if (request.body && Object.keys(request.body).length > 0) {
      const sanitized = { ...request.body };
      if (sanitized.password) sanitized.password = '***';
      if (sanitized.currentPassword) sanitized.currentPassword = '***';
      if (sanitized.newPassword) sanitized.newPassword = '***';
      requestBody = JSON.stringify(sanitized).substring(0, 5000);
    }

    // Compute request duration if startTime was set
    const startTime = (request as any).__startTime;
    const duration = startTime ? Date.now() - startTime : undefined;

    // Human-readable message
    const readableMessage = Array.isArray(message) ? message.join('; ') : String(message);

    // Don't log 404s for favicon.ico etc.
    const skipPaths = ['/favicon.ico', '/robots.txt', '/sitemap.xml'];
    const shouldLog = !skipPaths.includes(request.url) && !(status === 404 && request.url.includes('.'));

    if (shouldLog) {
      // Log to console
      if (status >= 500) {
        this.logger.error(`${status} ${request.method} ${request.url} — ${readableMessage}`, stack);
      }

      // Log to database (non-blocking)
      this.logsService.log({
        level,
        message: readableMessage,
        stack: stack || null,
        method: request.method,
        url: request.url?.substring(0, 500),
        statusCode: status,
        userId,
        userEmail,
        requestBody,
        ip: request.ip || request.headers['x-forwarded-for']?.toString() || null,
        userAgent: request.headers['user-agent']?.substring(0, 500) || null,
        source: exception instanceof Error ? exception.constructor.name : 'Unknown',
        duration,
      }).catch(() => {/* prevent log errors from crashing */});
    }

    // Send error response
    response.status(status).json({
      statusCode: status,
      message: readableMessage,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
