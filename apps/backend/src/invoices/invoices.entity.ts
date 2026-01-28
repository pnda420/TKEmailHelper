import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('invoices')
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  invoiceNumber: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'date' })
  dueDate: string;

  @Column({ default: 'draft' })
  status: 'draft' | 'sent' | 'paid' | 'overdue';

  // Kunde
  @Column()
  customerName: string;

  @Column({ nullable: true })
  customerEmail: string;

  @Column({ nullable: true })
  customerAddress: string;

  @Column({ nullable: true })
  customerCity: string;

  @Column({ nullable: true })
  customerZip: string;

  // Positionen als JSON
  @Column({ type: 'json' })
  items: {
    id: string;
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
  }[];

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 19 })
  taxRate: number;

  @Column({ type: 'text', nullable: true })
  notes: string;

  // Berechnete Werte für einfache Queries
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalNet: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalGross: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
