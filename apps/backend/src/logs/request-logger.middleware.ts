import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { LogsService } from './logs.service';
import { LogLevel } from './app-log.entity';

/**
 * Middleware that timestamps every request and logs slow requests (>3s)
 * and all successful requests for audit trail.
 */
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  constructor(private readonly logsService: LogsService) {}

  use(req: Request, res: Response, next: NextFunction) {
    (req as any).__startTime = Date.now();

    // Hook into res.finish to log after response is sent
    res.on('finish', () => {
      const duration = Date.now() - (req as any).__startTime;
      const status = res.statusCode;

      // Log slow requests (>3s) regardless of status
      if (duration > 3000) {
        this.logsService.log({
          level: LogLevel.WARN,
          message: `Slow request: ${duration}ms`,
          method: req.method,
          url: req.url?.substring(0, 500),
          statusCode: status,
          userId: (req as any).user?.id || null,
          userEmail: (req as any).user?.email || null,
          ip: req.ip || req.headers['x-forwarded-for']?.toString() || null,
          userAgent: req.headers['user-agent']?.substring(0, 500) || null,
          source: 'RequestLoggerMiddleware',
          duration,
        }).catch(() => {});
      }
    });

    next();
  }
}
