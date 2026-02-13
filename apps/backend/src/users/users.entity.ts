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
  isVerified: boolean;

  @Column({ nullable: true })
  verificationToken: string | null;

  // Email Signature fields (user-based — name & position only, rest comes from mailbox)
  @Column({ nullable: true })
  signatureName: string | null;

  @Column({ nullable: true })
  signaturePosition: string | null;

  // Profile setup complete flag - new users must complete setup wizard first
  @Column({ default: false })
  isProfileComplete: boolean;

  @CreateDateColumn({ type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;

}
