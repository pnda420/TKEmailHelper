import { IsEmail, IsString, IsBoolean, IsOptional, MinLength, MaxLength } from 'class-validator';

export class CreateContactRequestDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  serviceType: string; // Slug aus dem Services-Katalog

  @IsString()
  @MaxLength(2000)
  message: string;

  @IsBoolean()
  @IsOptional()
  prefersCallback?: boolean;

  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @IsString()
  @IsOptional()
  userId?: string; // Falls der User eingeloggt ist
}

export class UpdateContactRequestDto {
  @IsBoolean()
  @IsOptional()
  isProcessed?: boolean;

  @IsString()
  @IsOptional()
  notes?: string;
}