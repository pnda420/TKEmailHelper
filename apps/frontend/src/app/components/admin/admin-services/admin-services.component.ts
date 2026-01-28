import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminLayoutComponent } from '../admin-layout/admin-layout.component';
import { ToastService } from '../../../shared/toasts/toast.service';
import { ConfirmationService } from '../../../shared/confirmation/confirmation.service';
import { 
  ApiService, 
  ServiceCategory,
  ServiceItem,
  CreateServiceCategoryDto, 
  UpdateServiceCategoryDto, 
  CreateServiceDto,
  UpdateServiceDto,
  ImportServicesCatalogResultDto 
} from '../../../api/api.service';

interface CategoryFormModel {
  slug: string;
  name: string;
  subtitle: string;
  materialIcon: string;
  sortOrder: number;
  isPublished: boolean;
}

interface ServiceFormModel {
  slug: string;
  icon: string;
  title: string;
  description: string;
  longDescription: string;
  tags: string[];
  keywords: string;
  categoryId: string;
  sortOrder: number;
  isPublished: boolean;
}

@Component({
  selector: 'app-admin-services',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AdminLayoutComponent
  ],
  templateUrl: './admin-services.component.html',
  styleUrl: './admin-services.component.scss'
})
export class AdminServicesComponent implements OnInit {
  categories: ServiceCategory[] = [];
  isLoading = true;
  isSaving = false;
  
  // Tab-Ansicht: categories | services
  activeTab: 'categories' | 'services' = 'categories';
  
  // Kategorie Editor
  showCategoryEditor = false;
  editingCategory: ServiceCategory | null = null;
  categoryForm: CategoryFormModel = this.getEmptyCategoryForm();
  
  // Service Editor
  showServiceEditor = false;
  editingService: ServiceItem | null = null;
  serviceForm: ServiceFormModel = this.getEmptyServiceForm();
  newTag = '';
  
  // Import/Export
  showImportModal = false;
  importJson = '';
  importOverwrite = false;
  
  // Expanded Categories (für Services-Tab)
  expandedCategories: Set<string> = new Set();

  constructor(
    private api: ApiService,
    private toasts: ToastService,
    private confirmation: ConfirmationService
  ) {}

  // ===== GETTERS =====

  get publishedCategoriesCount(): number {
    return this.categories.filter(c => c.isPublished).length;
  }

  get totalServicesCount(): number {
    return this.categories.reduce((sum, c) => sum + c.services.length, 0);
  }

  get publishedServicesCount(): number {
    return this.categories.reduce((sum, c) => 
      sum + c.services.filter(s => s.isPublished).length, 0);
  }

  // ===== LIFECYCLE =====

  ngOnInit(): void {
    this.loadCategories();
  }

  // ===== DATA LOADING =====

  loadCategories(): void {
    this.isLoading = true;
    this.api.getServiceCategoriesAdmin().subscribe({
      next: (data) => {
        this.categories = data;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Fehler beim Laden:', err);
        this.toasts.error('Fehler beim Laden der Services');
        this.isLoading = false;
      }
    });
  }

  // ===== TABS =====

  setTab(tab: 'categories' | 'services'): void {
    this.activeTab = tab;
  }

  toggleCategoryExpand(categoryId: string): void {
    if (this.expandedCategories.has(categoryId)) {
      this.expandedCategories.delete(categoryId);
    } else {
      this.expandedCategories.add(categoryId);
    }
  }

  isCategoryExpanded(categoryId: string): boolean {
    return this.expandedCategories.has(categoryId);
  }

  // ===== CATEGORY EDITOR =====

  getEmptyCategoryForm(): CategoryFormModel {
    return {
      slug: '',
      name: '',
      subtitle: '',
      materialIcon: 'category',
      sortOrder: 0,
      isPublished: true
    };
  }

  openCreateCategory(): void {
    this.editingCategory = null;
    this.categoryForm = this.getEmptyCategoryForm();
    this.categoryForm.sortOrder = this.categories.length;
    this.showCategoryEditor = true;
  }

  openEditCategory(category: ServiceCategory): void {
    this.editingCategory = category;
    this.categoryForm = {
      slug: category.slug,
      name: category.name,
      subtitle: category.subtitle,
      materialIcon: category.materialIcon,
      sortOrder: category.sortOrder,
      isPublished: category.isPublished
    };
    this.showCategoryEditor = true;
  }

  closeCategoryEditor(): void {
    this.showCategoryEditor = false;
    this.editingCategory = null;
  }

  saveCategory(): void {
    if (!this.categoryForm.slug || !this.categoryForm.name) {
      this.toasts.error('Slug und Name sind erforderlich');
      return;
    }

    this.isSaving = true;

    if (this.editingCategory) {
      // Update
      const dto: UpdateServiceCategoryDto = { ...this.categoryForm };
      this.api.updateServiceCategory(this.editingCategory.id, dto).subscribe({
        next: () => {
          this.toasts.success('Kategorie aktualisiert');
          this.isSaving = false;
          this.closeCategoryEditor();
          this.loadCategories();
        },
        error: (err) => {
          console.error(err);
          this.toasts.error('Fehler beim Speichern');
          this.isSaving = false;
        }
      });
    } else {
      // Create
      const dto: CreateServiceCategoryDto = { ...this.categoryForm };
      this.api.createServiceCategory(dto).subscribe({
        next: () => {
          this.toasts.success('Kategorie erstellt');
          this.isSaving = false;
          this.closeCategoryEditor();
          this.loadCategories();
        },
        error: (err) => {
          console.error(err);
          this.toasts.error('Fehler beim Erstellen');
          this.isSaving = false;
        }
      });
    }
  }

  toggleCategoryPublish(category: ServiceCategory): void {
    this.api.toggleServiceCategoryPublish(category.id).subscribe({
      next: (updated) => {
        category.isPublished = updated.isPublished;
        this.toasts.success(updated.isPublished ? 'Veröffentlicht' : 'Versteckt');
      },
      error: () => this.toasts.error('Fehler')
    });
  }

  async deleteCategory(category: ServiceCategory): Promise<void> {
    const confirmed = await this.confirmation.confirm({
      title: 'Kategorie löschen',
      message: `Kategorie "${category.name}" und alle zugehörigen Services wirklich löschen?`,
      type: 'danger',
      confirmText: 'Löschen',
      cancelText: 'Abbrechen'
    });
    
    if (!confirmed) return;
    
    this.api.deleteServiceCategory(category.id).subscribe({
      next: () => {
        this.toasts.success('Kategorie gelöscht');
        this.loadCategories();
      },
      error: () => this.toasts.error('Fehler beim Löschen')
    });
  }

  // ===== SERVICE EDITOR =====

  getEmptyServiceForm(): ServiceFormModel {
    return {
      slug: '',
      icon: '🔧',
      title: '',
      description: '',
      longDescription: '',
      tags: [],
      keywords: '',
      categoryId: '',
      sortOrder: 0,
      isPublished: true
    };
  }

  openCreateService(categoryId?: string): void {
    this.editingService = null;
    this.serviceForm = this.getEmptyServiceForm();
    if (categoryId) {
      this.serviceForm.categoryId = categoryId;
      const cat = this.categories.find(c => c.id === categoryId);
      if (cat) {
        this.serviceForm.sortOrder = cat.services.length;
      }
    }
    this.showServiceEditor = true;
  }

  openEditService(service: ServiceItem): void {
    this.editingService = service;
    this.serviceForm = {
      slug: service.slug,
      icon: service.icon,
      title: service.title,
      description: service.description,
      longDescription: service.longDescription,
      tags: [...service.tags],
      keywords: service.keywords,
      categoryId: service.categoryId,
      sortOrder: service.sortOrder,
      isPublished: service.isPublished
    };
    this.showServiceEditor = true;
  }

  closeServiceEditor(): void {
    this.showServiceEditor = false;
    this.editingService = null;
    this.newTag = '';
  }

  addTag(): void {
    const tag = this.newTag.trim();
    if (tag && !this.serviceForm.tags.includes(tag)) {
      this.serviceForm.tags.push(tag);
    }
    this.newTag = '';
  }

  removeTag(index: number): void {
    this.serviceForm.tags.splice(index, 1);
  }

  saveService(): void {
    if (!this.serviceForm.slug || !this.serviceForm.title || !this.serviceForm.categoryId) {
      this.toasts.error('Slug, Titel und Kategorie sind erforderlich');
      return;
    }

    this.isSaving = true;

    if (this.editingService) {
      // Update
      const dto: UpdateServiceDto = { ...this.serviceForm };
      this.api.updateService(this.editingService.id, dto).subscribe({
        next: () => {
          this.toasts.success('Service aktualisiert');
          this.isSaving = false;
          this.closeServiceEditor();
          this.loadCategories();
        },
        error: (err) => {
          console.error(err);
          this.toasts.error('Fehler beim Speichern');
          this.isSaving = false;
        }
      });
    } else {
      // Create
      const dto: CreateServiceDto = { ...this.serviceForm };
      this.api.createService(dto).subscribe({
        next: () => {
          this.toasts.success('Service erstellt');
          this.isSaving = false;
          this.closeServiceEditor();
          this.loadCategories();
        },
        error: (err) => {
          console.error(err);
          this.toasts.error('Fehler beim Erstellen');
          this.isSaving = false;
        }
      });
    }
  }

  toggleServicePublish(service: ServiceItem): void {
    this.api.toggleServicePublish(service.id).subscribe({
      next: (updated) => {
        service.isPublished = updated.isPublished;
        this.toasts.success(updated.isPublished ? 'Veröffentlicht' : 'Versteckt');
      },
      error: () => this.toasts.error('Fehler')
    });
  }

  async deleteService(service: ServiceItem): Promise<void> {
    const confirmed = await this.confirmation.confirm({
      title: 'Service löschen',
      message: `Service "${service.title}" wirklich löschen?`,
      type: 'danger',
      confirmText: 'Löschen',
      cancelText: 'Abbrechen'
    });
    
    if (!confirmed) return;
    
    this.api.deleteService(service.id).subscribe({
      next: () => {
        this.toasts.success('Service gelöscht');
        this.loadCategories();
      },
      error: () => this.toasts.error('Fehler beim Löschen')
    });
  }

  // ===== IMPORT/EXPORT =====

  openImportModal(): void {
    this.importJson = '';
    this.importOverwrite = false;
    this.showImportModal = true;
  }

  closeImportModal(): void {
    this.showImportModal = false;
  }

  doImport(): void {
    let parsed: any;
    try {
      parsed = JSON.parse(this.importJson);
    } catch {
      this.toasts.error('Ungültiges JSON-Format');
      return;
    }

    // Prüfen ob es ein Array oder ein Objekt mit categories ist
    let categories = Array.isArray(parsed) ? parsed : parsed.categories;
    if (!Array.isArray(categories)) {
      this.toasts.error('JSON muss ein Array von Kategorien sein oder ein Objekt mit "categories"');
      return;
    }

    this.isSaving = true;
    this.api.importServicesCatalog({ categories, overwriteExisting: this.importOverwrite }).subscribe({
      next: (result: ImportServicesCatalogResultDto) => {
        this.toasts.success(
          `Import erfolgreich: ${result.categoriesCreated} Kategorien erstellt, ` +
          `${result.servicesCreated} Services erstellt`
        );
        if (result.errors.length > 0) {
          console.warn('Import Fehler:', result.errors);
        }
        this.closeImportModal();
        this.loadCategories();
        this.isSaving = false;
      },
      error: (err) => {
        console.error(err);
        this.toasts.error('Fehler beim Import');
        this.isSaving = false;
      }
    });
  }

  doExport(): void {
    this.api.exportServicesCatalog().subscribe({
      next: (data) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'services-catalog-export.json';
        a.click();
        URL.revokeObjectURL(url);
        this.toasts.success('Export heruntergeladen');
      },
      error: () => this.toasts.error('Fehler beim Export')
    });
  }

  // ===== HELPERS =====

  generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  onCategoryNameChange(): void {
    if (!this.editingCategory && this.categoryForm.name) {
      this.categoryForm.slug = this.generateSlug(this.categoryForm.name);
    }
  }

  onServiceTitleChange(): void {
    if (!this.editingService && this.serviceForm.title) {
      this.serviceForm.slug = this.generateSlug(this.serviceForm.title);
    }
  }
}
