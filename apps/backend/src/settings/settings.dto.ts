import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSettingsDto {
    @IsBoolean()
    @IsOptional()
    isUnderConstruction?: boolean;

    @IsString()
    @MaxLength(255)
    @IsOptional()
    maintenanceMessage?: string;

    @IsString()
    @MaxLength(50)
    @IsOptional()
    maintenancePassword?: string;

    @IsBoolean()
    @IsOptional()
    allowRegistration?: boolean;

    @IsBoolean()
    @IsOptional()
    allowNewsletter?: boolean;

    @IsString()
    @MaxLength(255)
    @IsOptional()
    siteTitle?: string;

    @IsString()
    @IsOptional()
    siteDescription?: string;

    @IsEmail()
    @IsOptional()
    contactEmail?: string;

    @IsString()
    @MaxLength(50)
    @IsOptional()
    contactPhone?: string;
}

export class PublicSettingsDto {
    isUnderConstruction: boolean;
    maintenanceMessage?: string;
    siteTitle?: string;
    siteDescription?: string;
    allowRegistration?: boolean;
    allowNewsletter?: boolean;
}