import { Injectable, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';
import { Response } from 'express';

/**
 * Custom ThrottlerGuard der:
 * 1. Die echte Client-IP hinter Proxies/Load Balancers erkennt
 * 2. Bessere Fehlermeldungen liefert
 * 3. Retry-After Header setzt
 */
@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  /**
   * Ermittelt die echte Client-IP (auch hinter Reverse Proxies)
   */
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // X-Forwarded-For Header prüfen (von Reverse Proxies wie nginx)
    const forwardedFor = req.headers?.['x-forwarded-for'];
    if (forwardedFor) {
      // Kann mehrere IPs enthalten, die erste ist die echte Client-IP
      const ips = forwardedFor.split(',').map((ip: string) => ip.trim());
      return ips[0];
    }
    
    // X-Real-IP Header (alternative Variante)
    const realIp = req.headers?.['x-real-ip'];
    if (realIp) {
      return realIp;
    }
    
    // Fallback auf direkte IP
    return req.ip || req.connection?.remoteAddress || 'unknown';
  }

  /**
   * Überschreibt throwThrottlingException um Retry-After Header zu setzen
   */
  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const response = context.switchToHttp().getResponse<Response>();
    const retryAfterSeconds = Math.ceil(throttlerLimitDetail.ttl / 1000);
    
    // Setze Retry-After Header (wichtig für Client!)
    response.setHeader('Retry-After', retryAfterSeconds.toString());
    response.setHeader('X-RateLimit-Limit', throttlerLimitDetail.limit.toString());
    response.setHeader('X-RateLimit-Remaining', '0');
    response.setHeader('X-RateLimit-Reset', (Date.now() + throttlerLimitDetail.ttl).toString());
    
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: `Zu viele Anfragen. Bitte warte ${retryAfterSeconds} Sekunden.`,
        retryAfter: retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

