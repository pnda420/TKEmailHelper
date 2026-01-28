import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('settings')
export class Settings {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'boolean', default: false })
    isUnderConstruction: boolean;

    @Column({ type: 'varchar', length: 255, nullable: true })
    maintenanceMessage: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    maintenancePassword: string;

    @Column({ type: 'boolean', default: true })
    allowRegistration: boolean;

    @Column({ type: 'boolean', default: true })
    allowNewsletter: boolean;

    @Column({ type: 'varchar', length: 255, nullable: true })
    siteTitle: string;

    @Column({ type: 'text', nullable: true })
    siteDescription: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    contactEmail: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    contactPhone: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}