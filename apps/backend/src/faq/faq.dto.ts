import { IsString, IsArray, IsBoolean, IsOptional, IsNumber, MinLength, ArrayMinSize } from 'class-validator';

export class CreateFaqDto {
    @IsString()
    @MinLength(2)
    slug: string;

    @IsString()
    @MinLength(5)
    question: string;

    @IsArray()
    @ArrayMinSize(1)
    @IsString({ each: true })
    answers: string[];

    @IsArray()
    @IsOptional()
    @IsString({ each: true })
    listItems?: string[];

    @IsNumber()
    @IsOptional()
    sortOrder?: number;

    @IsBoolean()
    @IsOptional()
    isPublished?: boolean;

    @IsString()
    @IsOptional()
    category?: string;
}

export class UpdateFaqDto {
    @IsString()
    @MinLength(2)
    @IsOptional()
    slug?: string;

    @IsString()
    @MinLength(5)
    @IsOptional()
    question?: string;

    @IsArray()
    @ArrayMinSize(1)
    @IsString({ each: true })
    @IsOptional()
    answers?: string[];

    @IsArray()
    @IsOptional()
    @IsString({ each: true })
    listItems?: string[];

    @IsNumber()
    @IsOptional()
    sortOrder?: number;

    @IsBoolean()
    @IsOptional()
    isPublished?: boolean;

    @IsString()
    @IsOptional()
    category?: string;
}

// DTO für JSON-Import (Array von FAQs)
export class ImportFaqDto {
    @IsString()
    @MinLength(2)
    slug: string;

    @IsString()
    @MinLength(5)
    question: string;

    @IsArray()
    @ArrayMinSize(1)
    @IsString({ each: true })
    answers: string[];

    @IsArray()
    @IsOptional()
    @IsString({ each: true })
    listItems?: string[];

    @IsNumber()
    @IsOptional()
    sortOrder?: number;

    @IsBoolean()
    @IsOptional()
    isPublished?: boolean;

    @IsString()
    @IsOptional()
    category?: string;
}

export class BulkImportFaqDto {
    @IsArray()
    @ArrayMinSize(1)
    faqs: ImportFaqDto[];

    @IsBoolean()
    @IsOptional()
    overwriteExisting?: boolean;
}

// Response für Import-Ergebnis
export class ImportResultDto {
    imported: number;
    updated: number;
    skipped: number;
    errors: string[];
}
