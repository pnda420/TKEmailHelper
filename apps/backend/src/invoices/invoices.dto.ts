import { IsString, IsEmail, IsOptional, IsNumber, IsArray, ValidateNested, IsEnum, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class InvoiceItemDto {
  @IsString()
  id: string;

  @IsString()
  description: string;

  @IsNumber()
  quantity: number;

  @IsString()
  unit: string;

  @IsNumber()
  unitPrice: number;
}

export class CreateInvoiceDto {
  @IsString()
  invoiceNumber: string;

  @IsDateString()
  date: string;

  @IsDateString()
  dueDate: string;

  @IsEnum(['draft', 'sent', 'paid', 'overdue'])
  @IsOptional()
  status?: 'draft' | 'sent' | 'paid' | 'overdue';

  @IsString()
  customerName: string;

  @IsEmail()
  @IsOptional()
  customerEmail?: string;

  @IsString()
  @IsOptional()
  customerAddress?: string;

  @IsString()
  @IsOptional()
  customerCity?: string;

  @IsString()
  @IsOptional()
  customerZip?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items: InvoiceItemDto[];

  @IsNumber()
  @IsOptional()
  taxRate?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateInvoiceDto {
  @IsString()
  @IsOptional()
  invoiceNumber?: string;

  @IsDateString()
  @IsOptional()
  date?: string;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsEnum(['draft', 'sent', 'paid', 'overdue'])
  @IsOptional()
  status?: 'draft' | 'sent' | 'paid' | 'overdue';

  @IsString()
  @IsOptional()
  customerName?: string;

  @IsEmail()
  @IsOptional()
  customerEmail?: string;

  @IsString()
  @IsOptional()
  customerAddress?: string;

  @IsString()
  @IsOptional()
  customerCity?: string;

  @IsString()
  @IsOptional()
  customerZip?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  @IsOptional()
  items?: InvoiceItemDto[];

  @IsNumber()
  @IsOptional()
  taxRate?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateStatusDto {
  @IsEnum(['draft', 'sent', 'paid', 'overdue'])
  status: 'draft' | 'sent' | 'paid' | 'overdue';
}
