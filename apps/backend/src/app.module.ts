// app.module.ts
import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { ThrottlerBehindProxyGuard } from './guards/throttler-behind-proxy.guard';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { EmailsModule } from './emails/emails.module';
import { EmailTemplatesModule } from './email-templates/email-templates.module';
import { DatabaseModule } from './database/database.module';
import { SqlTestModule } from './sql-test/sql-test.module';
import { JtlToolsModule } from './jtl-tools/jtl-tools.module';
import { AiAgentModule } from './ai-agent/ai-agent.module';
import { LogsModule } from './logs/logs.module';
import { GlobalExceptionFilter } from './logs/global-exception.filter';
import { RequestLoggerMiddleware } from './logs/request-logger.middleware';
import { AiUsageModule } from './ai-usage/ai-usage.module';
import { AiUsage } from './ai-usage/ai-usage.entity';
import { AiConfigModule } from './ai-config/ai-config.module';
import { AiConfig } from './ai-config/ai-config.entity';
import { User } from './users/users.entity';
import { Email } from './emails/emails.entity';
import { EmailTemplate } from './email-templates/email-templates.entity';
import { AppLog } from './logs/app-log.entity';
import { AppController } from './app.controller';
import { AppService } from './app.service';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'production'
        ? '.env.production'
        : '.env.development',
    }),
    // 🛡️ Global Rate Limiting - DDoS Schutz
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,   // 1 Sekunde
        limit: 15,   // Max 15 Requests pro Sekunde
      },
      {
        name: 'medium',
        ttl: 10000,  // 10 Sekunden
        limit: 80,   // Max 80 Requests pro 10 Sekunden
      },
      {
        name: 'long',
        ttl: 60000,  // 1 Minute
        limit: 300,  // Max 300 Requests pro Minute
      },
    ]),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: parseInt(process.env.DB_PORT ?? '5432', 10),
      username: process.env.DB_USER ?? 'app',
      password: process.env.DB_PASS ?? 'secret',
      database: process.env.DB_NAME ?? 'appdb',
      entities: [User, Email, EmailTemplate, AppLog, AiUsage, AiConfig],
      // synchronize: Kein Migrations-System vorhanden, daher immer aktiv.
      // Bei neuem Entity/Column wird die DB automatisch angepasst.
      synchronize: true,
      logging: process.env.NODE_ENV === 'development',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      retryAttempts: 20,     // Mehr Retries (default: 10)
      retryDelay: 3000,      // 3s zwischen Retries
    }),
    UsersModule,
    AuthModule,
    EmailsModule,
    EmailTemplatesModule,
    DatabaseModule,
    SqlTestModule,
    JtlToolsModule,
    AiAgentModule,
    LogsModule,
    AiUsageModule,
    AiConfigModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // 🛡️ Global Rate Limit Guard mit Proxy-Support und Headers
    {
      provide: APP_GUARD,
      useClass: ThrottlerBehindProxyGuard,
    },
    // �️ Global JWT Auth Guard - ALLE Routen geschützt (außer @Public())
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // �📋 Global Exception Logging
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
