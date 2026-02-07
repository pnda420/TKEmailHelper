// app.module.ts
import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { ThrottlerBehindProxyGuard } from './guards/throttler-behind-proxy.guard';
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
import { User } from './users/users.entity';
import { Email } from './emails/emails.entity';
import { EmailTemplate } from './email-templates/email-templates.entity';
import { AppLog } from './logs/app-log.entity';
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
      entities: [User, Email, EmailTemplate, AppLog, AiUsage],
      synchronize: true,
      logging: process.env.NODE_ENV === 'development',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
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
  ],
  providers: [
    // 🛡️ Global Rate Limit Guard mit Proxy-Support und Headers
    {
      provide: APP_GUARD,
      useClass: ThrottlerBehindProxyGuard,
    },
    // 📋 Global Exception Logging
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
