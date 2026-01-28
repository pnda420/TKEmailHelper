import {
    Controller, Get, Post, Body, Param, Patch, Delete,
    UseGuards, HttpCode, HttpStatus
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FaqService } from './faq.service';
import { CreateFaqDto, UpdateFaqDto, BulkImportFaqDto } from './faq.dto';
import { AdminGuard } from 'src/auth/guards/admin.guard';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@Controller('faq')
@Throttle({ default: { limit: 60, ttl: 60000 } }) // 🛡️ Basis: 60 Requests/Minute (Read-heavy)
export class FaqController {
    constructor(private readonly faqService: FaqService) { }

    // ===== PUBLIC ENDPOINTS =====

    /**
     * Alle veröffentlichten FAQs abrufen (für öffentliche Seite)
     */
    @Get()
    async findAllPublished() {
        return this.faqService.findAllPublished();
    }

    /**
     * Ein FAQ per Slug abrufen (öffentlich)
     */
    @Get('slug/:slug')
    async findBySlug(@Param('slug') slug: string) {
        return this.faqService.findBySlugPublic(slug);
    }

    // ===== ADMIN ENDPOINTS =====

    /**
     * Alle FAQs abrufen (inkl. unpublished) - Admin only
     */
    @UseGuards(JwtAuthGuard, AdminGuard)
    @Get('admin/all')
    async findAllAdmin() {
        return this.faqService.findAll();
    }

    /**
     * Export aller FAQs als JSON - Admin only
     */
    @UseGuards(JwtAuthGuard, AdminGuard)
    @Get('admin/export')
    async exportAll() {
        return this.faqService.exportAll();
    }

    /**
     * Bulk-Import von FAQs (JSON) - Admin only
     */
    @UseGuards(JwtAuthGuard, AdminGuard)
    @Post('admin/import')
    async bulkImport(@Body() dto: BulkImportFaqDto) {
        return this.faqService.bulkImport(dto);
    }

    /**
     * Sortierung aktualisieren - Admin only
     */
    @UseGuards(JwtAuthGuard, AdminGuard)
    @Patch('admin/sort-order')
    async updateSortOrder(@Body() items: { id: string; sortOrder: number }[]) {
        await this.faqService.updateSortOrder(items);
        return { success: true };
    }

    /**
     * Neues FAQ erstellen - Admin only
     */
    @UseGuards(JwtAuthGuard, AdminGuard)
    @Post('admin')
    @HttpCode(HttpStatus.CREATED)
    async create(@Body() dto: CreateFaqDto) {
        return this.faqService.create(dto);
    }

    /**
     * Ein FAQ per ID abrufen - Admin only
     * WICHTIG: Diese Route muss NACH spezifischen Routen wie /export, /import, /all kommen!
     */
    @UseGuards(JwtAuthGuard, AdminGuard)
    @Get('admin/:id')
    async findOneAdmin(@Param('id') id: string) {
        return this.faqService.findOne(id);
    }

    /**
     * FAQ aktualisieren - Admin only
     */
    @UseGuards(JwtAuthGuard, AdminGuard)
    @Patch('admin/:id')
    async update(@Param('id') id: string, @Body() dto: UpdateFaqDto) {
        return this.faqService.update(id, dto);
    }

    /**
     * FAQ löschen - Admin only
     */
    @UseGuards(JwtAuthGuard, AdminGuard)
    @Delete('admin/:id')
    @HttpCode(HttpStatus.NO_CONTENT)
    async delete(@Param('id') id: string) {
        return this.faqService.delete(id);
    }

    /**
     * Publish-Status togglen - Admin only
     */
    @UseGuards(JwtAuthGuard, AdminGuard)
    @Patch('admin/:id/toggle-publish')
    async togglePublish(@Param('id') id: string) {
        return this.faqService.togglePublish(id);
    }
}
