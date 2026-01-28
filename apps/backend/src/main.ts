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
    origin: isProduction ? true : (origin, cb) => {
      const allowList = [
        'http://localhost:4200',           // Dev lokal
        'http://localhost',                 // Docker Frontend (Port 80)
        'http://localhost:80',              // Docker Frontend explizit
        'http://192.168.178.111:4200',      // Dein lokales Netzwerk
        'https://leonardsmedia.de', 
        'https://www.leonardsmedia.de',
      ];
      // Kein Origin = Postman, curl, server-to-server
      if (!origin) return cb(null, true);
      return allowList.includes(origin) ? cb(null, true) : cb(new Error('CORS'), false);
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Consent-Analytics'],
    // 🛡️ Diese Header müssen exposed werden damit das Frontend sie lesen kann
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