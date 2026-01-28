import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Faq } from './faq.entity';
import { CreateFaqDto, UpdateFaqDto, BulkImportFaqDto, ImportResultDto } from './faq.dto';

@Injectable()
export class FaqService {
    constructor(
        @InjectRepository(Faq)
        private readonly faqRepo: Repository<Faq>
    ) { }

    // ===== PUBLIC ENDPOINTS =====

    /**
     * Gibt alle veröffentlichten FAQs zurück (für öffentliche Seite)
     */
    async findAllPublished(): Promise<Faq[]> {
        return this.faqRepo.find({
            where: { isPublished: true },
            order: { sortOrder: 'ASC', createdAt: 'ASC' },
        });
    }

    /**
     * Gibt ein FAQ per Slug zurück (nur wenn published)
     */
    async findBySlugPublic(slug: string): Promise<Faq> {
        const faq = await this.faqRepo.findOne({
            where: { slug, isPublished: true },
        });

        if (!faq) {
            throw new NotFoundException(`FAQ with slug "${slug}" not found`);
        }

        return faq;
    }

    // ===== ADMIN ENDPOINTS =====

    /**
     * Gibt ALLE FAQs zurück (auch unpublished) - für Admin
     */
    async findAll(): Promise<Faq[]> {
        return this.faqRepo.find({
            order: { sortOrder: 'ASC', createdAt: 'DESC' },
        });
    }

    /**
     * Gibt ein FAQ per ID zurück - für Admin
     */
    async findOne(id: string): Promise<Faq> {
        const faq = await this.faqRepo.findOne({ where: { id } });

        if (!faq) {
            throw new NotFoundException(`FAQ with ID "${id}" not found`);
        }

        return faq;
    }

    /**
     * Erstellt ein neues FAQ
     */
    async create(dto: CreateFaqDto): Promise<Faq> {
        // Check if slug already exists
        const existing = await this.faqRepo.findOne({ where: { slug: dto.slug } });
        if (existing) {
            throw new ConflictException(`FAQ with slug "${dto.slug}" already exists`);
        }

        const faq = this.faqRepo.create({
            ...dto,
            sortOrder: dto.sortOrder ?? await this.getNextSortOrder(),
        });

        return this.faqRepo.save(faq);
    }

    /**
     * Aktualisiert ein FAQ
     */
    async update(id: string, dto: UpdateFaqDto): Promise<Faq> {
        const faq = await this.findOne(id);

        // Check if new slug conflicts with existing
        if (dto.slug && dto.slug !== faq.slug) {
            const existing = await this.faqRepo.findOne({ where: { slug: dto.slug } });
            if (existing) {
                throw new ConflictException(`FAQ with slug "${dto.slug}" already exists`);
            }
        }

        Object.assign(faq, dto);
        return this.faqRepo.save(faq);
    }

    /**
     * Löscht ein FAQ
     */
    async delete(id: string): Promise<void> {
        const result = await this.faqRepo.delete(id);
        if (result.affected === 0) {
            throw new NotFoundException(`FAQ with ID "${id}" not found`);
        }
    }

    /**
     * Toggle publish status
     */
    async togglePublish(id: string): Promise<Faq> {
        const faq = await this.findOne(id);
        faq.isPublished = !faq.isPublished;
        return this.faqRepo.save(faq);
    }

    /**
     * Sortierung aktualisieren (Batch)
     */
    async updateSortOrder(items: { id: string; sortOrder: number }[]): Promise<void> {
        await Promise.all(
            items.map(item =>
                this.faqRepo.update(item.id, { sortOrder: item.sortOrder })
            )
        );
    }

    /**
     * JSON Import - Bulk-Import von FAQs
     */
    async bulkImport(dto: BulkImportFaqDto): Promise<ImportResultDto> {
        const result: ImportResultDto = {
            imported: 0,
            updated: 0,
            skipped: 0,
            errors: [],
        };

        for (const faqData of dto.faqs) {
            try {
                const existing = await this.faqRepo.findOne({ where: { slug: faqData.slug } });

                if (existing) {
                    if (dto.overwriteExisting) {
                        // Update existing
                        Object.assign(existing, faqData);
                        await this.faqRepo.save(existing);
                        result.updated++;
                    } else {
                        result.skipped++;
                    }
                } else {
                    // Create new
                    const faq = this.faqRepo.create({
                        ...faqData,
                        sortOrder: faqData.sortOrder ?? await this.getNextSortOrder(),
                        isPublished: faqData.isPublished ?? true,
                    });
                    await this.faqRepo.save(faq);
                    result.imported++;
                }
            } catch (error) {
                result.errors.push(`Failed to import FAQ "${faqData.slug}": ${error.message}`);
            }
        }

        return result;
    }

    /**
     * Export aller FAQs als JSON
     */
    async exportAll(): Promise<Faq[]> {
        return this.faqRepo.find({
            order: { sortOrder: 'ASC' },
        });
    }

    // ===== HELPER =====

    private async getNextSortOrder(): Promise<number> {
        const result = await this.faqRepo
            .createQueryBuilder('faq')
            .select('MAX(faq.sortOrder)', 'max')
            .getRawOne();

        return (result?.max ?? 0) + 10;
    }
}
