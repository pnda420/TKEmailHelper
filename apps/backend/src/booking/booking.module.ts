import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookingService } from './booking.service';
import { BookingController } from './booking.controller';
import { BookingSlot } from './booking-slots.entity';
import { Booking } from './bookings.entity';
import { EmailModule } from 'src/email/email.module';
import { GoogleCalendarModule } from './google-calendar.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([BookingSlot, Booking]),
    EmailModule,
    GoogleCalendarModule,
  ],
  providers: [BookingService],
  controllers: [BookingController],
  exports: [BookingService],
})
export class BookingModule {}