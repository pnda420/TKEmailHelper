import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 🛡️ Security Headers mit Helmet
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    crossOriginEmbedderPolicy: false, // Für iframes falls benötigt
  }));

  const isProduction = process.env.NODE_ENV === 'production';
  
  app.enableCors({
    // Production: Alles geht über Nginx Reverse Proxy → Origin immer erlauben
    // Development: Localhost-Origins erlauben
    origin: isProduction
      ? true
      : [
          'http://localhost:4200',
          'http://localhost',
          'http://localhost:80',
          /^http:\/\/192\.168\.\d+\.\d+:\d+$/,  // Lokales Netzwerk
        ],
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Consent-Analytics'],
    exposedHeaders: ['Retry-After', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    optionsSuccessStatus: 204,
  });

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  await app.listen(process.env.PORT || 3000);
  console.log('🚀 Backend läuft auf http://localhost:' + (process.env.PORT || 3000));
}
bootstrap();