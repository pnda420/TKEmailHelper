import {
    Controller, Get, Post, Body, Param, Patch, Delete,
    UseGuards, HttpCode, HttpStatus
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ServicesCatalogService } from './services-catalog.service';
import {
    CreateServiceCategoryDto, UpdateServiceCategoryDto,
    CreateServiceDto, UpdateServiceDto,
    BulkImportServicesCatalogDto
} from './services-catalog.dto';
import { AdminGuard } from 'src/auth/guards/admin.guard';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@Controller('services-catalog')
@Throttle({ default: { limit: 60, ttl: 60000 } }) // 🛡️ Basis: 60 Requests/Minute (Read-heavy)
export class ServicesCatalogController {
    constructor(private readonly catalogService: ServicesCatalogService) { }

    // ===== PUBLIC ENDPOINTS =====

    /**
     * Alle veröffentlichten Kategorien mit Services (für öffentliche Seite)
     */
    @Get()
    async findAllPublished() {
        return this.catalogService.findAllPublished();
    }

    /**
     * Kategorie per Slug abrufen (öffentlich)
     */
    @Get('category/:slug')
    async findCategoryBySlug(@Param('slug') slug: string) {
        return this.catalogService.findCategoryBySlug(slug);
    }

    /**
     * Service per Slug abrufen (öffentlich)
     */
    @Get('service/:slug')
    async findServiceBySlug(@Param('slug') slug: string) {
        return this.catalogService.findServiceBySlug(slug);
    }

    // ===== ADMIN ENDPOINTS - EXPORT/IMPORT (vor :id Routen!) =====

    /**
     * Export aller Kategorien und Services als JSON - Admin only
     */
    @UseGuards(JwtAuthGuard, AdminGuard)
    @Get('admin/export')
    async exportAll() {
        return this.catalogService.exportAll();
    }

    /**
     * Bulk-Import von Kategorien und Services (JSON) - Admin only
     */
    @UseGuards(JwtAuthGuard, AdminGuard)
    @Post('admin/import')
    async bulkImport(@Body() dto: BulkImportServicesCatalogDto) {
        return this.catalogService.bulkImport(dto);
    }

    // ===== ADMIN ENDPOINTS - CATEGORIES =====

    /**
     * Alle Kategorien abrufen (inkl. unpublished) - Admin only
     */
    @UseGuards(JwtAuthGuard, AdminGuard)
    @Get('admin/categories')
    async findAllCategoriesAdmin() {
        return this.catalogService.findAllCategories();
    }

    /**
     * Kategorie per ID abrufen - Admin only
     */
    @UseGuards(JwtAuthGuard, AdminGuard)
    @Get('admin/categories/:id')
    async findCategoryByIdAdmin(@Param('id') id: string) {
        return this.catalogService.findCategoryById(id);
    }

    /**
     * Neue Kategorie erstellen - Admin only
     */
    @UseGuards(JwtAuthGuard, AdminGuard)
    @Post('admin/categories')
    @HttpCode(HttpStatus.CREATED)
    async createCategory(@Body() dto: CreateServiceCategoryDto) {
        return this.catalogService.createCategory(dto);
    }

    /**
     * Kategorie aktualisieren - Admin only
     */
    @UseGuards(JwtAuthGuard, AdminGuard)
    @Patch('admin/categories/:id')
    async updateCategory(@Param('id') id: string, @Body() dto: UpdateServiceCategoryDto) {
        return this.catalogService.updateCategory(id, dto);
    }

    /**
     * Kategorie löschen - Admin only
     */
    @UseGuards(JwtAuthGuard, AdminGuard)
    @Delete('admin/categories/:id')
    @HttpCode(HttpStatus.NO_CONTENT)
    async deleteCategory(@Param('id') id: string) {
        return this.catalogService.deleteCategory(id);
    }

    /**
     * Kategorie Publish-Status togglen - Admin only
     */
    @UseGuards(JwtAuthGuard, AdminGuard)
    @Patch('admin/categories/:id/toggle-publish')
    async toggleCategoryPublish(@Param('id') id: string) {
        return this.catalogService.toggleCategoryPublish(id);
    }

    /**
     * Kategorien-Sortierung aktualisieren - Admin only
     */
    @UseGuards(JwtAuthGuard, AdminGuard)
    @Patch('admin/categories/sort-order')
    async updateCategorySortOrder(@Body() items: { id: string; sortOrder: number }[]) {
        await this.catalogService.updateCategorySortOrder(items);
        return { success: true };
    }

    // ===== ADMIN ENDPOINTS - SERVICES =====

    /**
     * Alle Services abrufen - Admin only
     */
    @UseGuards(JwtAuthGuard, AdminGuard)
    @Get('admin/services')
    async findAllServicesAdmin() {
        return this.catalogService.findAllServices();
    }

    /**
     * Service per ID abrufen - Admin only
     */
    @UseGuards(JwtAuthGuard, AdminGuard)
    @Get('admin/services/:id')
    async findServiceByIdAdmin(@Param('id') id: string) {
        return this.catalogService.findServiceById(id);
    }

    /**
     * Neuen Service erstellen - Admin only
     */
    @UseGuards(JwtAuthGuard, AdminGuard)
    @Post('admin/services')
    @HttpCode(HttpStatus.CREATED)
    async createService(@Body() dto: CreateServiceDto) {
        return this.catalogService.createService(dto);
    }

    /**
     * Service aktualisieren - Admin only
     */
    @UseGuards(JwtAuthGuard, AdminGuard)
    @Patch('admin/services/:id')
    async updateService(@Param('id') id: string, @Body() dto: UpdateServiceDto) {
        return this.catalogService.updateService(id, dto);
    }

    /**
     * Service löschen - Admin only
     */
    @UseGuards(JwtAuthGuard, AdminGuard)
    @Delete('admin/services/:id')
    @HttpCode(HttpStatus.NO_CONTENT)
    async deleteService(@Param('id') id: string) {
        return this.catalogService.deleteService(id);
    }

    /**
     * Service Publish-Status togglen - Admin only
     */
    @UseGuards(JwtAuthGuard, AdminGuard)
    @Patch('admin/services/:id/toggle-publish')
    async toggleServicePublish(@Param('id') id: string) {
        return this.catalogService.toggleServicePublish(id);
    }

    /**
     * Services-Sortierung aktualisieren - Admin only
     */
    @UseGuards(JwtAuthGuard, AdminGuard)
    @Patch('admin/services/sort-order')
    async updateServiceSortOrder(@Body() items: { id: string; sortOrder: number }[]) {
        await this.catalogService.updateServiceSortOrder(items);
        return { success: true };
    }
}
