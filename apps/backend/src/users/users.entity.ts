import { ContactRequest } from 'src/contact-requests/contact-requests.entity';
import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, OneToMany, Index
} from 'typeorm';

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true }) // in PG per Migration auf CITEXT umstellen
  email: string;

  @Column()
  name: string;

  @Column({ select: false }) // optional: schützt vor versehentlichem Auslesen
  password: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    enumName: 'user_role',
    default: UserRole.USER,
  })
  role: UserRole;

  @Index()
  @Column({ default: false })
  wantsNewsletter: boolean;

  @Index()
  @Column({ default: false })
  isVerified: boolean;

  @Column({ nullable: true })
  verificationToken: string | null;

  @CreateDateColumn({ type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;

  @OneToMany(() => ContactRequest, request => request.user)
  contactRequests: ContactRequest[];
}
