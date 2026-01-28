import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ServiceCategoryEntity, ServiceEntity } from './services-catalog.entity';
import {
    CreateServiceCategoryDto, UpdateServiceCategoryDto,
    CreateServiceDto, UpdateServiceDto,
    BulkImportServicesCatalogDto, ImportResultDto
} from './services-catalog.dto';

@Injectable()
export class ServicesCatalogService {
    constructor(
        @InjectRepository(ServiceCategoryEntity)
        private readonly categoryRepo: Repository<ServiceCategoryEntity>,
        @InjectRepository(ServiceEntity)
        private readonly serviceRepo: Repository<ServiceEntity>,
    ) { }

    // ===== CATEGORIES =====

    /**
     * Alle veröffentlichten Kategorien mit Services (öffentlich)
     */
    async findAllPublished(): Promise<ServiceCategoryEntity[]> {
        return this.categoryRepo.find({
            where: { isPublished: true },
            relations: ['services'],
            order: { sortOrder: 'ASC' }
        }).then(categories => {
            // Filter nur published services und sortieren
            return categories.map(cat => ({
                ...cat,
                services: cat.services
                    .filter(s => s.isPublished)
                    .sort((a, b) => a.sortOrder - b.sortOrder)
            }));
        });
    }

    /**
     * Alle Kategorien (Admin)
     */
    async findAllCategories(): Promise<ServiceCategoryEntity[]> {
        return this.categoryRepo.find({
            relations: ['services'],
            order: { sortOrder: 'ASC' }
        }).then(categories => {
            return categories.map(cat => ({
                ...cat,
                services: cat.services.sort((a, b) => a.sortOrder - b.sortOrder)
            }));
        });
    }

    /**
     * Kategorie per ID finden
     */
    async findCategoryById(id: string): Promise<ServiceCategoryEntity> {
        const category = await this.categoryRepo.findOne({
            where: { id },
            relations: ['services']
        });
        if (!category) {
            throw new NotFoundException(`Kategorie mit ID ${id} nicht gefunden`);
        }
        return category;
    }

    /**
     * Kategorie per Slug finden (öffentlich)
     */
    async findCategoryBySlug(slug: string): Promise<ServiceCategoryEntity> {
        const category = await this.categoryRepo.findOne({
            where: { slug, isPublished: true },
            relations: ['services']
        });
        if (!category) {
            throw new NotFoundException(`Kategorie "${slug}" nicht gefunden`);
        }
        category.services = category.services
            .filter(s => s.isPublished)
            .sort((a, b) => a.sortOrder - b.sortOrder);
        return category;
    }

    /**
     * Kategorie erstellen
     */
    async createCategory(dto: CreateServiceCategoryDto): Promise<ServiceCategoryEntity> {
        const existing = await this.categoryRepo.findOne({ where: { slug: dto.slug } });
        if (existing) {
            throw new ConflictException(`Kategorie mit Slug "${dto.slug}" existiert bereits`);
        }

        const category = this.categoryRepo.create({
            ...dto,
            sortOrder: dto.sortOrder ?? await this.getNextCategorySortOrder()
        });
        return this.categoryRepo.save(category);
    }

    /**
     * Kategorie aktualisieren
     */
    async updateCategory(id: string, dto: UpdateServiceCategoryDto): Promise<ServiceCategoryEntity> {
        const category = await this.findCategoryById(id);

        if (dto.slug && dto.slug !== category.slug) {
            const existing = await this.categoryRepo.findOne({ where: { slug: dto.slug } });
            if (existing) {
                throw new ConflictException(`Kategorie mit Slug "${dto.slug}" existiert bereits`);
            }
        }

        Object.assign(category, dto);
        return this.categoryRepo.save(category);
    }

    /**
     * Kategorie löschen (löscht auch alle Services)
     */
    async deleteCategory(id: string): Promise<void> {
        const result = await this.categoryRepo.delete(id);
        if (result.affected === 0) {
            throw new NotFoundException(`Kategorie mit ID ${id} nicht gefunden`);
        }
    }

    /**
     * Kategorie Publish-Status togglen
     */
    async toggleCategoryPublish(id: string): Promise<ServiceCategoryEntity> {
        const category = await this.findCategoryById(id);
        category.isPublished = !category.isPublished;
        return this.categoryRepo.save(category);
    }

    // ===== SERVICES =====

    /**
     * Alle Services (Admin)
     */
    async findAllServices(): Promise<ServiceEntity[]> {
        return this.serviceRepo.find({
            relations: ['category'],
            order: { sortOrder: 'ASC' }
        });
    }

    /**
     * Service per ID finden
     */
    async findServiceById(id: string): Promise<ServiceEntity> {
        const service = await this.serviceRepo.findOne({
            where: { id },
            relations: ['category']
        });
        if (!service) {
            throw new NotFoundException(`Service mit ID ${id} nicht gefunden`);
        }
        return service;
    }

    /**
     * Service per Slug finden (öffentlich)
     */
    async findServiceBySlug(slug: string): Promise<ServiceEntity> {
        const service = await this.serviceRepo.findOne({
            where: { slug, isPublished: true },
            relations: ['category']
        });
        if (!service) {
            throw new NotFoundException(`Service "${slug}" nicht gefunden`);
        }
        return service;
    }

    /**
     * Service erstellen
     */
    async createService(dto: CreateServiceDto): Promise<ServiceEntity> {
        const existing = await this.serviceRepo.findOne({ where: { slug: dto.slug } });
        if (existing) {
            throw new ConflictException(`Service mit Slug "${dto.slug}" existiert bereits`);
        }

        // Prüfen ob Kategorie existiert
        await this.findCategoryById(dto.categoryId);

        const service = this.serviceRepo.create({
            ...dto,
            sortOrder: dto.sortOrder ?? await this.getNextServiceSortOrder(dto.categoryId)
        });
        return this.serviceRepo.save(service);
    }

    /**
     * Service aktualisieren
     */
    async updateService(id: string, dto: UpdateServiceDto): Promise<ServiceEntity> {
        const service = await this.findServiceById(id);

        if (dto.slug && dto.slug !== service.slug) {
            const existing = await this.serviceRepo.findOne({ where: { slug: dto.slug } });
            if (existing) {
                throw new ConflictException(`Service mit Slug "${dto.slug}" existiert bereits`);
            }
        }

        if (dto.categoryId) {
            await this.findCategoryById(dto.categoryId);
        }

        Object.assign(service, dto);
        return this.serviceRepo.save(service);
    }

    /**
     * Service löschen
     */
    async deleteService(id: string): Promise<void> {
        const result = await this.serviceRepo.delete(id);
        if (result.affected === 0) {
            throw new NotFoundException(`Service mit ID ${id} nicht gefunden`);
        }
    }

    /**
     * Service Publish-Status togglen
     */
    async toggleServicePublish(id: string): Promise<ServiceEntity> {
        const service = await this.findServiceById(id);
        service.isPublished = !service.isPublished;
        return this.serviceRepo.save(service);
    }

    // ===== SORT ORDER =====

    async updateCategorySortOrder(items: { id: string; sortOrder: number }[]): Promise<void> {
        for (const item of items) {
            await this.categoryRepo.update(item.id, { sortOrder: item.sortOrder });
        }
    }

    async updateServiceSortOrder(items: { id: string; sortOrder: number }[]): Promise<void> {
        for (const item of items) {
            await this.serviceRepo.update(item.id, { sortOrder: item.sortOrder });
        }
    }

    // ===== IMPORT / EXPORT =====

    /**
     * Bulk-Import von Kategorien und Services
     */
    async bulkImport(dto: BulkImportServicesCatalogDto): Promise<ImportResultDto> {
        const result: ImportResultDto = {
            success: true,
            categoriesCreated: 0,
            categoriesUpdated: 0,
            servicesCreated: 0,
            servicesUpdated: 0,
            errors: []
        };

        for (const catData of dto.categories) {
            try {
                let category = await this.categoryRepo.findOne({ where: { slug: catData.slug } });

                if (category && dto.overwriteExisting) {
                    // Update existing category
                    category.name = catData.name;
                    category.subtitle = catData.subtitle;
                    category.materialIcon = catData.materialIcon;
                    category.sortOrder = catData.sortOrder ?? category.sortOrder;
                    category.isPublished = true;
                    await this.categoryRepo.save(category);
                    result.categoriesUpdated++;
                } else if (!category) {
                    // Create new category
                    category = this.categoryRepo.create({
                        slug: catData.slug,
                        name: catData.name,
                        subtitle: catData.subtitle,
                        materialIcon: catData.materialIcon,
                        sortOrder: catData.sortOrder ?? await this.getNextCategorySortOrder(),
                        isPublished: true
                    });
                    category = await this.categoryRepo.save(category);
                    result.categoriesCreated++;
                }

                // Import services for this category
                for (const svcData of catData.services) {
                    try {
                        let service = await this.serviceRepo.findOne({ where: { slug: svcData.slug } });

                        if (service && dto.overwriteExisting) {
                            // Update existing service
                            service.icon = svcData.icon;
                            service.title = svcData.title;
                            service.description = svcData.description;
                            service.longDescription = svcData.longDescription;
                            service.tags = svcData.tags;
                            service.keywords = svcData.keywords;
                            service.sortOrder = svcData.sortOrder ?? service.sortOrder;
                            service.categoryId = category.id;
                            service.isPublished = true;
                            await this.serviceRepo.save(service);
                            result.servicesUpdated++;
                        } else if (!service) {
                            // Create new service
                            service = this.serviceRepo.create({
                                slug: svcData.slug,
                                icon: svcData.icon,
                                title: svcData.title,
                                description: svcData.description,
                                longDescription: svcData.longDescription,
                                tags: svcData.tags,
                                keywords: svcData.keywords,
                                sortOrder: svcData.sortOrder ?? await this.getNextServiceSortOrder(category.id),
                                categoryId: category.id,
                                isPublished: true
                            });
                            await this.serviceRepo.save(service);
                            result.servicesCreated++;
                        }
                    } catch (err) {
                        result.errors.push(`Service "${svcData.slug}": ${err.message}`);
                    }
                }
            } catch (err) {
                result.errors.push(`Kategorie "${catData.slug}": ${err.message}`);
            }
        }

        result.success = result.errors.length === 0;
        return result;
    }

    /**
     * Export aller Kategorien und Services
     */
    async exportAll(): Promise<{ categories: any[] }> {
        const categories = await this.categoryRepo.find({
            relations: ['services'],
            order: { sortOrder: 'ASC' }
        });

        return {
            categories: categories.map(cat => ({
                slug: cat.slug,
                name: cat.name,
                subtitle: cat.subtitle,
                materialIcon: cat.materialIcon,
                sortOrder: cat.sortOrder,
                services: cat.services
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map(svc => ({
                        slug: svc.slug,
                        icon: svc.icon,
                        title: svc.title,
                        description: svc.description,
                        longDescription: svc.longDescription,
                        tags: svc.tags,
                        keywords: svc.keywords,
                        sortOrder: svc.sortOrder
                    }))
            }))
        };
    }

    // ===== HELPERS =====

    private async getNextCategorySortOrder(): Promise<number> {
        const max = await this.categoryRepo.createQueryBuilder('cat')
            .select('MAX(cat.sortOrder)', 'max')
            .getRawOne();
        return (max?.max ?? -1) + 1;
    }

    private async getNextServiceSortOrder(categoryId: string): Promise<number> {
        const max = await this.serviceRepo.createQueryBuilder('svc')
            .where('svc.categoryId = :categoryId', { categoryId })
            .select('MAX(svc.sortOrder)', 'max')
            .getRawOne();
        return (max?.max ?? -1) + 1;
    }
}
