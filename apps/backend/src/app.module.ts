// app.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerBehindProxyGuard } from './guards/throttler-behind-proxy.guard';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { User } from './users/users.entity';
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
      entities: [User],
      synchronize: true,
      logging: process.env.NODE_ENV === 'development',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    }),
    UsersModule,
    AuthModule,
  ],
  providers: [
    // 🛡️ Global Rate Limit Guard mit Proxy-Support und Headers
    {
      provide: APP_GUARD,
      useClass: ThrottlerBehindProxyGuard,
    },
  ],
})
export class AppModule { }
