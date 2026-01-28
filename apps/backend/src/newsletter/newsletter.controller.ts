// src/newsletter/newsletter.controller.ts
import { Controller, Post, Body, Get, UseGuards, Delete, Query, Patch, Param, NotFoundException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { AdminGuard } from 'src/auth/guards/admin.guard';
import { NewsletterService } from './newsletter.service';
import { SubscribeNewsletterDto } from './newsletter.dto';

@Controller('newsletter')
@Throttle({ default: { limit: 30, ttl: 60000 } }) // 🛡️ Basis: 30 Requests/Minute
export class NewsletterController {
    constructor(private readonly newsletterService: NewsletterService) { }

    // 🛡️ STRENG: 3 Anmeldungen pro Stunde pro IP
    @Throttle({ default: { limit: 3, ttl: 3600000 } })
    @Post('subscribe')
    async subscribe(@Body() dto: SubscribeNewsletterDto) {
        const subscriber = await this.newsletterService.subscribe(dto);
        return {
            success: true,
            message: 'Erfolgreich für den Newsletter angemeldet! Check deine E-Mails.',
            email: subscriber.email,
        };
    }

    // PUBLIC: Newsletter abbestellen
    @Delete('unsubscribe')
    async unsubscribe(@Query('email') email: string) {
        if (!email) {
            return {
                success: false,
                message: 'E-Mail-Adresse fehlt',
            };
        }

        await this.newsletterService.unsubscribe(email);
        return {
            success: true,
            message: 'Erfolgreich vom Newsletter abgemeldet',
        };
    }

    // ADMIN: Alle Subscriber abrufen (inkl. inaktive)
    @UseGuards(JwtAuthGuard, AdminGuard)
    @Get('subscribers')
    async getAllSubscribers() {
        const subscribers = await this.newsletterService.getAllSubscribersAdmin();
        const stats = await this.newsletterService.getStats();
        return {
            ...stats,
            subscribers,
        };
    }

    // ADMIN: Statistiken
    @UseGuards(JwtAuthGuard, AdminGuard)
    @Get('stats')
    async getStats() {
        return this.newsletterService.getStats();
    }

    // ADMIN: Subscriber Status umschalten
    @UseGuards(JwtAuthGuard, AdminGuard)
    @Patch('subscribers/:id/toggle')
    async toggleStatus(@Param('id') id: string) {
        try {
            const subscriber = await this.newsletterService.toggleSubscriberStatus(id);
            return {
                success: true,
                message: `Status geändert: ${subscriber.isActive ? 'Aktiv' : 'Inaktiv'}`,
                subscriber,
            };
        } catch (error) {
            throw new NotFoundException('Subscriber nicht gefunden');
        }
    }

    // ADMIN: Subscriber löschen
    @UseGuards(JwtAuthGuard, AdminGuard)
    @Delete('subscribers/:id')
    async deleteSubscriber(@Param('id') id: string) {
        try {
            await this.newsletterService.deleteSubscriber(id);
            return {
                success: true,
                message: 'Subscriber wurde gelöscht',
            };
        } catch (error) {
            throw new NotFoundException('Subscriber nicht gefunden');
        }
    }
}