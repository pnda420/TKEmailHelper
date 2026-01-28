// src/newsletter/newsletter.dto.ts
import { IsEmail, IsNotEmpty } from 'class-validator';

export class SubscribeNewsletterDto {
  @IsEmail({}, { message: 'Bitte gib eine gültige E-Mail-Adresse ein' })
  @IsNotEmpty({ message: 'E-Mail-Adresse ist erforderlich' })
  email: string;
}