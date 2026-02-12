import { IsEmail, IsString, IsBoolean, IsOptional, MinLength, MaxLength, IsEnum } from 'class-validator';
import { UserRole } from './users.entity';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsString()
  @MinLength(8, { message: 'Passwort muss mindestens 8 Zeichen lang sein' })
  password: string;
}

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  // Email Signature fields
  @IsString()
  @IsOptional()
  @MaxLength(100)
  signatureName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  signaturePosition?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  signatureCompany?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  signaturePhone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  signatureWebsite?: string;

  // Real email signature (HTML, attached to outgoing emails)
  @IsString()
  @IsOptional()
  @MaxLength(10000)
  emailSignature?: string;

  // Profile setup complete flag
  @IsBoolean()
  @IsOptional()
  isProfileComplete?: boolean;

  // Password (admin can set this)
  @IsString()
  @IsOptional()
  @MinLength(8, { message: 'Passwort muss mindestens 8 Zeichen lang sein' })
  password?: string;

  // Email
  @IsEmail()
  @IsOptional()
  email?: string;

  // Verified flag
  @IsBoolean()
  @IsOptional()
  isVerified?: boolean;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

export class AdminResetPasswordDto {
  @IsString()
  @MinLength(8, { message: 'Passwort muss mindestens 8 Zeichen lang sein' })
  newPassword: string;
}

