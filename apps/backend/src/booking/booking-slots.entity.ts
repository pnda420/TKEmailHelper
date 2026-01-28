import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('booking_slots')
export class BookingSlot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'date' })
  date: string; // Format: YYYY-MM-DD

  @Column({ type: 'time' })
  timeFrom: string; // Format: HH:MM

  @Column({ type: 'time' })
  timeTo: string; // Format: HH:MM

  @Index()
  @Column({ default: true })
  isAvailable: boolean;

  @Column({ type: 'int', default: 1 })
  maxBookings: number; // Wie viele Buchungen parallel möglich

  @Column({ type: 'int', default: 0 })
  currentBookings: number; // Aktuelle Anzahl Buchungen

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ nullable: true })
  googleEventId?: string;

  @Column({ nullable: true })
  meetLink?: string;
}