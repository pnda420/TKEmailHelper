import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Settings } from './settings.entity';
import { UpdateSettingsDto, PublicSettingsDto } from './settings.dto';

@Injectable()
export class SettingsService implements OnModuleInit {
    private settingsId: string | null = null;

    constructor(
        @InjectRepository(Settings)
        private readonly settingsRepo: Repository<Settings>,
    ) {}

    async onModuleInit() {
        // Initialisiere Settings falls noch nicht vorhanden
        await this.initializeSettings();
    }

    private async initializeSettings(): Promise<void> {
        // Prüfe ob Settings existieren
        const settings = await this.settingsRepo.find({
            take: 1,
            order: { createdAt: 'ASC' }
        });

        if (settings.length === 0) {
            // Erstelle Default Settings
            const newSettings = await this.createDefaultSettings();
            this.settingsId = newSettings.id;
        } else {
            // Speichere die ID für schnelleren Zugriff
            this.settingsId = settings[0].id;
        }
    }

    private async createDefaultSettings(): Promise<Settings> {
        const settings = this.settingsRepo.create({
            isUnderConstruction: false,
            maintenanceMessage: 'Die Seite wird gerade gewartet. Bitte versuchen Sie es später erneut.',
            maintenancePassword: 'lm',
            allowRegistration: true,
            allowNewsletter: true,
            siteTitle: 'LeonardsMedia',
            siteDescription: 'Webentwicklung und digitale Lösungen',
            contactEmail: 'info@leonardsmedia.de',
            contactPhone: '+49 123 456789',
        });

        return this.settingsRepo.save(settings);
    }

    async getSettings(): Promise<Settings> {
        // Wenn wir die ID haben, nutze sie
        if (this.settingsId) {
            const settings = await this.settingsRepo.findOne({
                where: { id: this.settingsId }
            });
            
            if (settings) {
                return settings;
            }
        }

        // Fallback: Finde die ersten Settings
        const allSettings = await this.settingsRepo.find({
            take: 1,
            order: { createdAt: 'ASC' }
        });

        if (allSettings.length === 0) {
            // Keine Settings gefunden, erstelle neue
            const newSettings = await this.createDefaultSettings();
            this.settingsId = newSettings.id;
            return newSettings;
        }

        // Cache die ID für zukünftige Anfragen
        this.settingsId = allSettings[0].id;
        return allSettings[0];
    }

    async getPublicSettings(): Promise<PublicSettingsDto> {
        const settings = await this.getSettings();
        
        return {
            isUnderConstruction: settings.isUnderConstruction,
            maintenanceMessage: settings.maintenanceMessage,
            siteTitle: settings.siteTitle,
            siteDescription: settings.siteDescription,
            allowRegistration: settings.allowRegistration,
            allowNewsletter: settings.allowNewsletter,
        };
    }

    async updateSettings(dto: UpdateSettingsDto): Promise<Settings> {
        const settings = await this.getSettings();
        Object.assign(settings, dto);
        const updated = await this.settingsRepo.save(settings);
        
        // Update cached ID
        this.settingsId = updated.id;
        
        return updated;
    }

    async checkMaintenancePassword(password: string): Promise<boolean> {
        const settings = await this.getSettings();
        return settings.maintenancePassword === password;
    }

    async isUnderConstruction(): Promise<boolean> {
        const settings = await this.getSettings();
        return settings.isUnderConstruction;
    }
}