import { IsString, IsEmail, IsOptional, IsDateString, IsBoolean, IsInt, Min, Max, Matches, IsEnum, IsUUID } from 'class-validator';
import { BookingStatus } from './bookings.entity';

export class CreateBookingSlotDto {
  @IsDateString()
  date: string; // YYYY-MM-DD

  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'timeFrom must be in format HH:MM',
  })
  timeFrom: string;

  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'timeTo must be in format HH:MM',
  })
  timeTo: string;

  @IsInt()
  @Min(1)
  @Max(10)
  @IsOptional()
  maxBookings?: number;

  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean;
}

export class UpdateBookingSlotDto {
  @IsDateString()
  @IsOptional()
  date?: string;

  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/)
  @IsOptional()
  timeFrom?: string;

  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/)
  @IsOptional()
  timeTo?: string;

  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean;

  @IsInt()
  @Min(1)
  @IsOptional()
  maxBookings?: number;
}

export class CreateBookingDto {
  @IsString()
  @IsOptional()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  message?: string;

  @IsUUID()
  slotId: string;
}

export class UpdateBookingDto {
  @IsEnum(BookingStatus)
  @IsOptional()
  status?: BookingStatus;

  @IsString()
  @IsOptional()
  adminNotes?: string;
}