import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { BookingSlot } from './booking-slots.entity';
import { Booking, BookingStatus } from './bookings.entity';
import { CreateBookingSlotDto, UpdateBookingSlotDto, CreateBookingDto, UpdateBookingDto } from './booking.dto';
import { EmailService } from 'src/email/email.service';
import { ConfigService } from '@nestjs/config';
import { GoogleCalendarService } from './google-calendar.service';

@Injectable()
export class BookingService {
  constructor(
    @InjectRepository(BookingSlot)
    private readonly slotRepo: Repository<BookingSlot>,
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
    private readonly googleCalendarService: GoogleCalendarService,
  ) { }

  // ==================== SLOTS (ADMIN) ====================

  async createSlot(dto: CreateBookingSlotDto): Promise<BookingSlot> {
    // Validierung: timeFrom < timeTo
    if (dto.timeFrom >= dto.timeTo) {
      throw new BadRequestException('timeFrom must be before timeTo');
    }

    const slot = this.slotRepo.create({
      ...dto,
      maxBookings: dto.maxBookings || 1,
      isAvailable: dto.isAvailable !== false,
    });

    return this.slotRepo.save(slot);
  }

  async createMultipleSlots(slots: CreateBookingSlotDto[]): Promise<BookingSlot[]> {
    const created = slots.map(dto => {
      if (dto.timeFrom >= dto.timeTo) {
        throw new BadRequestException(`Invalid time range for ${dto.date} ${dto.timeFrom}-${dto.timeTo}`);
      }
      return this.slotRepo.create({
        ...dto,
        maxBookings: dto.maxBookings || 1,
        isAvailable: dto.isAvailable !== false,
      });
    });

    return this.slotRepo.save(created);
  }

  async getAllSlots(): Promise<BookingSlot[]> {
    return this.slotRepo.find({
      order: { date: 'ASC', timeFrom: 'ASC' },
    });
  }

  toLocalYMD(date = new Date()): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  async getAvailableSlots(fromDate?: string): Promise<BookingSlot[]> {
    const today = fromDate || this.toLocalYMD(); // statt new Date().toISOString().split('T')[0]
    return this.slotRepo.find({
      where: { date: MoreThanOrEqual(today), isAvailable: true },
      order: { date: 'ASC', timeFrom: 'ASC' },
    });
  }


  async getSlotsByDate(date: string): Promise<BookingSlot[]> {
    return this.slotRepo.find({
      where: { date },
      order: { timeFrom: 'ASC' },
    });
  }

  async updateSlot(id: string, dto: UpdateBookingSlotDto): Promise<BookingSlot> {
    const slot = await this.slotRepo.findOne({ where: { id } });
    if (!slot) {
      throw new NotFoundException(`Slot with ID ${id} not found`);
    }

    if (dto.timeFrom && dto.timeTo && dto.timeFrom >= dto.timeTo) {
      throw new BadRequestException('timeFrom must be before timeTo');
    }

    Object.assign(slot, dto);
    return this.slotRepo.save(slot);
  }

  async deleteSlot(id: string): Promise<void> {
    const result = await this.slotRepo.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Slot with ID ${id} not found`);
    }
  }

  // ==================== BOOKINGS ====================

  async createBooking(dto: CreateBookingDto): Promise<Booking> {
    const slot = await this.slotRepo.findOne({ where: { id: dto.slotId } });

    if (!slot) {
      throw new NotFoundException('Slot not found');
    }

    if (!slot.isAvailable) {
      throw new ConflictException('This slot is not available');
    }

    if (slot.currentBookings >= slot.maxBookings) {
      throw new ConflictException('This slot is fully booked');
    }

    // Booking erstellen
    const booking = this.bookingRepo.create(dto);
    const saved = await this.bookingRepo.save(booking);

    // Google Meet erstellen
    try {
      // DateTime richtig formatieren
      const startDateTime = `${slot.date}T${slot.timeFrom}+02:00`;
      const endDateTime = `${slot.date}T${slot.timeTo}+02:00`;

      console.log('🕐 DateTime Debug:');
      console.log('   slot.date:', slot.date);
      console.log('   slot.timeFrom:', slot.timeFrom);
      console.log('   slot.timeTo:', slot.timeTo);
      console.log('   startDateTime:', startDateTime);
      console.log('   endDateTime:', endDateTime);

      const meetData = await this.googleCalendarService.createMeeting({
        summary: `Beratungsgespräch LeonardsMedia - ${booking.name}`,
        description: booking.message || 'Beratungstermin',
        startDateTime,
        endDateTime,
        attendees: [booking.email],
      });

      // Meet Link im Slot speichern
      slot.googleEventId = meetData.eventId;
      slot.meetLink = meetData.meetLink;

      console.log('✅ Meet Link gespeichert:', slot.meetLink);
    } catch (error) {
      // Fehler loggen, aber Buchung nicht abbrechen
      console.error('❌ Google Meet konnte nicht erstellt werden:', error);
      console.error('   Error Details:', error.message);
      // Booking wird trotzdem gespeichert, nur ohne Meet Link
    }

    // Slot-Counter erhöhen
    slot.currentBookings += 1;
    if (slot.currentBookings >= slot.maxBookings) {
      slot.isAvailable = false;
    }
    await this.slotRepo.save(slot);

    // Emails senden (mit Meet Link)
    await this.sendBookingEmails(saved, slot);

    return saved;
  }

  private async sendBookingEmails(booking: Booking, slot: BookingSlot): Promise<void> {
    const adminEmail = this.configService.get<string>('ADMIN_EMAIL');

    // Email an Customer
    await this.emailService.sendBookingConfirmation({
      to: booking.email,
      customerName: booking.name,
      date: slot.date,
      timeFrom: slot.timeFrom,
      timeTo: slot.timeTo,
      bookingId: booking.id,
      meetLink: slot.meetLink,
    });

    // Email an Admin
    if (adminEmail) {
      await this.emailService.sendBookingNotificationToAdmin({
        to: adminEmail,
        customerName: booking.name,
        customerEmail: booking.email,
        customerPhone: booking.phone,
        message: booking.message,
        date: slot.date,
        timeFrom: slot.timeFrom,
        timeTo: slot.timeTo,
        bookingId: booking.id,
        meetLink: slot.meetLink, // NEU!
      });
    }
  }

  async getAllBookings(): Promise<Booking[]> {
    return this.bookingRepo.find({
      relations: ['slot'],
      order: { createdAt: 'DESC' },
    });
  }

  async getBookingById(id: string): Promise<Booking> {
    const booking = await this.bookingRepo.findOne({
      where: { id },
      relations: ['slot'],
    });

    if (!booking) {
      throw new NotFoundException(`Booking with ID ${id} not found`);
    }

    return booking;
  }

  async updateBooking(id: string, dto: UpdateBookingDto): Promise<Booking> {
    const booking = await this.getBookingById(id);
    Object.assign(booking, dto);
    return this.bookingRepo.save(booking);
  }

  async cancelBooking(id: string): Promise<Booking> {
    const booking = await this.getBookingById(id);

    if (booking.status === BookingStatus.CANCELLED) {
      throw new BadRequestException('Booking is already cancelled');
    }

    // Slot freigeben
    const slot = await this.slotRepo.findOne({ where: { id: booking.slotId } });
    if (slot) {
      // Google Meet löschen
      if (slot.googleEventId) {
        try {
          await this.googleCalendarService.deleteMeeting(slot.googleEventId);
          slot.googleEventId = null;
          slot.meetLink = null;
        } catch (error) {
          console.error('Google Meet konnte nicht gelöscht werden:', error);
        }
      }

      slot.currentBookings = Math.max(0, slot.currentBookings - 1);
      slot.isAvailable = true;
      await this.slotRepo.save(slot);
    }

    booking.status = BookingStatus.CANCELLED;
    return this.bookingRepo.save(booking);
  }

  async deleteBooking(id: string): Promise<void> {
    const booking = await this.getBookingById(id);

    // Slot freigeben
    const slot = await this.slotRepo.findOne({ where: { id: booking.slotId } });
    if (slot) {
      // Google Meet löschen
      if (slot.googleEventId) {
        try {
          await this.googleCalendarService.deleteMeeting(slot.googleEventId);
        } catch (error) {
          console.error('Google Meet konnte nicht gelöscht werden:', error);
        }
      }

      slot.currentBookings = Math.max(0, slot.currentBookings - 1);
      slot.isAvailable = true;
      await this.slotRepo.save(slot);
    }

    await this.bookingRepo.delete(id);
  }

}