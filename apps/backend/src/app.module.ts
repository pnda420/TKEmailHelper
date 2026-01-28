// app.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerBehindProxyGuard } from './guards/throttler-behind-proxy.guard';
import { UsersModule } from './users/users.module';
import { ContactRequestsModule } from './contact-requests/contact-requests.module';
import { ContactRequest } from './contact-requests/contact-requests.entity';
import { User } from './users/users.entity';
import { AuthModule } from './auth/auth.module';
import { EmailModule } from './email/email.module';
import { BookingModule } from './booking/booking.module';
import { BookingSlot } from './booking/booking-slots.entity';
import { Booking } from './booking/bookings.entity';
import { GoogleCalendarModule } from './booking/google-calendar.module';
import { NewsletterModule } from './newsletter/newsletter.module';
import { NewsletterSubscriber } from './newsletter/newsletter.entity';
import { SettingsModule } from './settings/settings.module';
import { Settings } from './settings/settings.entity';
import { FaqModule } from './faq/faq.module';
import { Faq } from './faq/faq.entity';
import { ServicesCatalogModule } from './services-catalog/services-catalog.module';
import { ServiceCategoryEntity, ServiceEntity } from './services-catalog/services-catalog.entity';
import { InvoicesModule } from './invoices/invoices.module';
import { Invoice } from './invoices/invoices.entity';
import { AnalyticsModule } from './analytics/analytics.module';
import { AnalyticsEvent, AnalyticsDailyStats } from './analytics/analytics.entity';

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
      entities: [User, ContactRequest, BookingSlot, Booking, NewsletterSubscriber, Settings, Faq, ServiceCategoryEntity, ServiceEntity, Invoice, AnalyticsEvent, AnalyticsDailyStats],
      synchronize: true,
      logging: process.env.NODE_ENV === 'development',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    }),
    UsersModule,
    AuthModule,
    ContactRequestsModule,
    EmailModule,
    BookingModule,
    GoogleCalendarModule,
    NewsletterModule,
    SettingsModule,
    FaqModule,
    ServicesCatalogModule,
    InvoicesModule,
    AnalyticsModule,
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
