import { IsString, IsEmail, IsOptional, IsBoolean, IsNumber, IsArray, MaxLength, Min, Max } from 'class-validator';

export class CreateMailboxDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  password: string;

  @IsString()
  imapHost: string;

  @IsString()
  smtpHost: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(65535)
  imapPort?: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(65535)
  smtpPort?: number;

  @IsBoolean()
  @IsOptional()
  imapTls?: boolean;

  @IsBoolean()
  @IsOptional()
  smtpSecure?: boolean;

  @IsString()
  @IsOptional()
  imapSourceFolder?: string;

  @IsString()
  @IsOptional()
  imapSentFolder?: string;

  @IsString()
  @IsOptional()
  imapDoneFolder?: string;

  @IsString()
  @IsOptional()
  imapTrashFolder?: string;

  @IsString()
  companyName: string;

  @IsString()
  @IsOptional()
  companyPhone?: string;

  @IsString()
  @IsOptional()
  companyWebsite?: string;

  @IsString()
  @IsOptional()
  companyAddress?: string;

  @IsString()
  @IsOptional()
  @MaxLength(10000)
  signatureTemplate?: string;

  @IsString()
  @IsOptional()
  @MaxLength(7)
  color?: string;
}

export class UpdateMailboxDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  password?: string;

  @IsString()
  @IsOptional()
  imapHost?: string;

  @IsString()
  @IsOptional()
  smtpHost?: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(65535)
  imapPort?: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(65535)
  smtpPort?: number;

  @IsBoolean()
  @IsOptional()
  imapTls?: boolean;

  @IsBoolean()
  @IsOptional()
  smtpSecure?: boolean;

  @IsString()
  @IsOptional()
  imapSourceFolder?: string;

  @IsString()
  @IsOptional()
  imapSentFolder?: string;

  @IsString()
  @IsOptional()
  imapDoneFolder?: string;

  @IsString()
  @IsOptional()
  imapTrashFolder?: string;

  @IsString()
  @IsOptional()
  companyName?: string;

  @IsString()
  @IsOptional()
  companyPhone?: string;

  @IsString()
  @IsOptional()
  companyWebsite?: string;

  @IsString()
  @IsOptional()
  companyAddress?: string;

  @IsString()
  @IsOptional()
  @MaxLength(10000)
  signatureTemplate?: string;

  @IsString()
  @IsOptional()
  @MaxLength(7)
  color?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class AssignMailboxDto {
  @IsArray()
  @IsString({ each: true })
  userIds: string[];
}

export class SetActiveMailboxesDto {
  @IsArray()
  @IsString({ each: true })
  mailboxIds: string[];
}
