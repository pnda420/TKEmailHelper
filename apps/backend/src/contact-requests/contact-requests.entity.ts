import { User } from 'src/users/users.entity';
import {
    Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne,
    JoinColumn, Index
} from 'typeorm';

@Entity('contact_requests')
export class ContactRequest {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    // In PG per Migration auf CITEXT umstellen (case-insensitive Unique/Filter möglich)
    @Column()
    email: string;

    // Service-Slug aus dem Services-Katalog (dynamisch)
    @Column({ default: 'allgemeine-anfrage' })
    serviceType: string;

    @Column('text')
    message: string;

    @Index()
    @Column({ default: false })
    prefersCallback: boolean;

    @Column({ nullable: true })
    phoneNumber: string | null;

    @Index()
    @Column({ default: false })
    isProcessed: boolean;

    @Column({ type: 'text', nullable: true })
    notes: string | null;

    @Column('uuid', { nullable: true })
    userId: string | null;

    @ManyToOne(() => User, user => user.contactRequests, {
        nullable: true,
        onDelete: 'SET NULL',
    })
    @JoinColumn({ name: 'userId' })
    user: User | null;

    @CreateDateColumn({ type: 'timestamptz', default: () => 'now()' })
    createdAt: Date;
}
