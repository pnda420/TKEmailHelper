import { IsString, IsOptional, IsBoolean, IsArray, IsNumber, IsUUID, ValidateNested, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

// ===== SERVICE CATEGORY DTOs =====

export class CreateServiceCategoryDto {
    @IsString()
    @IsNotEmpty()
    slug: string;

    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsNotEmpty()
    subtitle: string;

    @IsString()
    @IsNotEmpty()
    materialIcon: string;

    @IsNumber()
    @IsOptional()
    sortOrder?: number;

    @IsBoolean()
    @IsOptional()
    isPublished?: boolean;
}

export class UpdateServiceCategoryDto {
    @IsString()
    @IsOptional()
    slug?: string;

    @IsString()
    @IsOptional()
    name?: string;

    @IsString()
    @IsOptional()
    subtitle?: string;

    @IsString()
    @IsOptional()
    materialIcon?: string;

    @IsNumber()
    @IsOptional()
    sortOrder?: number;

    @IsBoolean()
    @IsOptional()
    isPublished?: boolean;
}

// ===== SERVICE DTOs =====

export class CreateServiceDto {
    @IsString()
    @IsNotEmpty()
    slug: string;

    @IsString()
    @IsNotEmpty()
    icon: string;

    @IsString()
    @IsNotEmpty()
    title: string;

    @IsString()
    @IsNotEmpty()
    description: string;

    @IsString()
    @IsNotEmpty()
    longDescription: string;

    @IsArray()
    @IsString({ each: true })
    tags: string[];

    @IsString()
    keywords: string;

    @IsUUID()
    @IsNotEmpty()
    categoryId: string;

    @IsNumber()
    @IsOptional()
    sortOrder?: number;

    @IsBoolean()
    @IsOptional()
    isPublished?: boolean;
}

export class UpdateServiceDto {
    @IsString()
    @IsOptional()
    slug?: string;

    @IsString()
    @IsOptional()
    icon?: string;

    @IsString()
    @IsOptional()
    title?: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsString()
    @IsOptional()
    longDescription?: string;

    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    tags?: string[];

    @IsString()
    @IsOptional()
    keywords?: string;

    @IsUUID()
    @IsOptional()
    categoryId?: string;

    @IsNumber()
    @IsOptional()
    sortOrder?: number;

    @IsBoolean()
    @IsOptional()
    isPublished?: boolean;
}

// ===== BULK IMPORT DTOs =====

export class ImportServiceDto {
    @IsString()
    @IsNotEmpty()
    slug: string;

    @IsString()
    @IsNotEmpty()
    icon: string;

    @IsString()
    @IsNotEmpty()
    title: string;

    @IsString()
    @IsNotEmpty()
    description: string;

    @IsString()
    @IsNotEmpty()
    longDescription: string;

    @IsArray()
    @IsString({ each: true })
    tags: string[];

    @IsString()
    keywords: string;

    @IsNumber()
    @IsOptional()
    sortOrder?: number;
}

export class ImportCategoryDto {
    @IsString()
    @IsNotEmpty()
    slug: string;

    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsNotEmpty()
    subtitle: string;

    @IsString()
    @IsNotEmpty()
    materialIcon: string;

    @IsNumber()
    @IsOptional()
    sortOrder?: number;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ImportServiceDto)
    services: ImportServiceDto[];
}

export class BulkImportServicesCatalogDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ImportCategoryDto)
    categories: ImportCategoryDto[];

    @IsBoolean()
    @IsOptional()
    overwriteExisting?: boolean;
}

export class ImportResultDto {
    success: boolean;
    categoriesCreated: number;
    categoriesUpdated: number;
    servicesCreated: number;
    servicesUpdated: number;
    errors: string[];
}
