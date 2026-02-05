// auth/strategies/jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from '../auth.service';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

// Custom extractor: Try header first, then query parameter (for SSE)
const extractJwtFromHeaderOrQuery = (req: Request): string | null => {
    // Try Authorization header first
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7);
    }
    
    // Fallback to query parameter (for SSE endpoints)
    if (req.query && req.query.token) {
        return req.query.token as string;
    }
    
    return null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        private authService: AuthService,
        private configService: ConfigService
    ) {
        // 🛡️ JWT Secret aus Umgebungsvariable - KEIN Fallback!
        const secret = configService.get<string>('JWT_SECRET');
        if (!secret) {
            throw new Error('❌ JWT_SECRET Umgebungsvariable fehlt!');
        }

        super({
            jwtFromRequest: extractJwtFromHeaderOrQuery,
            ignoreExpiration: false,
            secretOrKey: secret,
        });
    }

    async validate(payload: any) {
        const user = await this.authService.validateUser(payload.sub);

        if (!user) {
            throw new UnauthorizedException('Benutzer nicht gefunden');
        }

        return user;
    }
}