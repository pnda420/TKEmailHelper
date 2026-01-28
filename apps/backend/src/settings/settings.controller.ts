import { 
    Controller, 
    Get, 
    Patch, 
    Body, 
    HttpCode, 
    HttpStatus,
    UseGuards,
    Post 
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './settings.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { AdminGuard } from 'src/auth/guards/admin.guard';

@Controller('settings')
@Throttle({ default: { limit: 30, ttl: 60000 } }) // 🛡️ Basis: 30 Requests/Minute
export class SettingsController {
    constructor(private readonly settingsService: SettingsService) {}

    // Öffentliche Settings (für Frontend Check)
    @Get('public')
    @HttpCode(HttpStatus.OK)
    async getPublicSettings() {
        return this.settingsService.getPublicSettings();
    }

    // 🛡️ STRENG: 5 Versuche pro Minute (Brute-Force Schutz)
    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @Post('check-maintenance-password')
    @HttpCode(HttpStatus.OK)
    async checkMaintenancePassword(@Body('password') password: string) {
        const isValid = await this.settingsService.checkMaintenancePassword(password);
        return { valid: isValid };
    }

    // Admin Routen
    @UseGuards(JwtAuthGuard, AdminGuard)
    @Get()
    async getSettings() {
        return this.settingsService.getSettings();
    }

    @UseGuards(JwtAuthGuard, AdminGuard)
    @Patch()
    async updateSettings(@Body() dto: UpdateSettingsDto) {
        return this.settingsService.updateSettings(dto);
    }
}