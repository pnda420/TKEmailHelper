import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { LiveConsoleService } from './logs/live-console.service';
import helmet from 'helmet';

async function bootstrap() {
  // Create app with default logger first (so NestFactory bootstrap logs are visible)
  const app = await NestFactory.create(AppModule, {
    logger: process.env.NODE_ENV === 'production'
      ? ['error', 'warn']
      : ['log', 'debug', 'error', 'warn', 'verbose'],
  });

  // Switch to LiveConsoleService as the app-wide logger
  // This intercepts ALL NestJS Logger output and broadcasts it via SSE
  const liveConsole = app.get(LiveConsoleService);
  app.useLogger(liveConsole);

  // 🛡️ Trust Proxy (für korrekte IP-Erkennung hinter Nginx)
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', 1);
  // 🛡️ Express-Header verstecken
  expressApp.disable('x-powered-by');
  // 🛡️ ETag fingerprinting verhindern
  expressApp.set('etag', false);

  // 🛡️ Security Headers mit Helmet (verschärft)
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    dnsPrefetchControl: { allow: false },
    hsts: { maxAge: 63072000, includeSubDomains: true, preload: true }, // 2 Jahre
    ieNoOpen: true,
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xssFilter: true,
  }));

  const isProduction = process.env.NODE_ENV === 'production';

  // 🛡️ CORS - In Production nur die eigene Domain erlauben
  const allowedOrigins = isProduction
    ? (process.env.ALLOWED_ORIGINS || '')
        .split(',')
        .map(o => o.trim())
        .filter(Boolean)
    : [
        'http://localhost:4200',
        'http://localhost',
        'http://localhost:80',
      ];

  app.enableCors({
    origin: (origin, callback) => {
      // Requests ohne Origin erlauben (z.B. Server-to-Server, Healthchecks)
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else if (!isProduction && /^http:\/\/192\.168\.\d+\.\d+:\d+$/.test(origin)) {
        // Lokales Netzwerk nur in Development
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} nicht erlaubt (CORS)`));
      }
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Consent-Analytics'],
    exposedHeaders: ['Retry-After', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    maxAge: 3600, // 🛡️ Preflight-Cache: 1 Stunde
    optionsSuccessStatus: 204,
  });

  // 🛡️ Globale Validierung (streng)
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,           // Nur deklarierte Properties erlauben
    forbidNonWhitelisted: true, // Unbekannte Properties → 400 Error
    transform: true,            // Automatische Typ-Konvertierung
    transformOptions: {
      enableImplicitConversion: false, // Keine implizite Konvertierung
    },
    disableErrorMessages: isProduction, // 🛡️ Keine Detail-Fehlermeldungen in Production
  }));

  // 🛡️ Request-Body-Größe limitieren (gegen große Payloads)
  // Express default ist 100kb, wir setzen es explizit
  const bodyParser = require('express');
  app.use(bodyParser.json({ limit: '1mb' }));
  app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));

  await app.listen(process.env.PORT || 3000);
  console.log('🚀 Backend läuft auf Port ' + (process.env.PORT || 3000));
}
bootstrap();