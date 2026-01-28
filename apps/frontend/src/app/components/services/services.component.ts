import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ServiceDataService, Service, ServiceCategory } from '../../shared/service-data.service';
import { ApiService, ServiceCategory as ApiCategory } from '../../api/api.service';
import { PageTitleComponent } from "../../shared/page-title/page-title.component";

@Component({
  selector: 'app-services',
  standalone: true,
  imports: [CommonModule, FormsModule, PageTitleComponent],
  templateUrl: './services.component.html',
  styleUrl: './services.component.scss'
})
export class ServicesComponent implements OnInit {

  searchQuery = '';
  activeFilter = 'all';
  
  // Data state
  loading = true;
  error = false;
  isEmpty = false;
  private _categories: ServiceCategory[] = [];
  
  // Modal state
  selectedService: Service | null = null;
  selectedCategory: ServiceCategory | null = null;

  constructor(
    public router: Router,
    private route: ActivatedRoute,
    private serviceData: ServiceDataService,
    private api: ApiService
  ) {}

  ngOnInit(): void {
    this.loadServices();
    
    // Handle category query param from header dropdown
    this.route.queryParams.subscribe(params => {
      if (params['category']) {
        this.activeFilter = params['category'];
      } else {
        this.activeFilter = 'all';
      }
    });
  }

  loadServices(): void {
    this.loading = true;
    this.error = false;
    this.isEmpty = false;

    this.api.getServicesCatalog().subscribe({
      next: (apiCategories) => {
        if (apiCategories && apiCategories.length > 0) {
          // Map API data to local format
          this._categories = apiCategories.map(cat => ({
            id: cat.slug,
            name: cat.name,
            subtitle: cat.subtitle,
            materialIcon: cat.materialIcon,
            services: cat.services.map(svc => ({
              id: svc.slug,
              icon: svc.icon,
              title: svc.title,
              description: svc.description,
              longDescription: svc.longDescription,
              tags: svc.tags,
              keywords: svc.keywords
            }))
          }));
          this.isEmpty = false;
        } else {
          this.isEmpty = true;
          this._categories = [];
        }
        this.loading = false;
      },
      error: (err) => {
        console.error('Fehler beim Laden der Services:', err);
        this.error = true;
        this.loading = false;
      }
    });
  }

  // ===== GETTERS =====

  get categories(): ServiceCategory[] {
    return this._categories;
  }

  get filters() {
    // Dynamisch Filter aus den geladenen Kategorien erstellen
    const dynamicFilters = [
      { id: 'all', name: 'Alle', icon: 'grid_view' },
      ...this._categories.map(cat => ({
        id: cat.id,
        name: cat.name,
        icon: cat.materialIcon
      }))
    ];
    return dynamicFilters;
  }

  get filteredCategories(): ServiceCategory[] {
    let cats = this.categories;

    // Filter by category
    if (this.activeFilter !== 'all') {
      cats = cats.filter(c => c.id === this.activeFilter);
    }

    // Filter services by search
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase();
      cats = cats.map(cat => ({
        ...cat,
        services: cat.services.filter(s =>
          s.keywords.includes(query) ||
          s.title.toLowerCase().includes(query) ||
          s.tags.some(t => t.toLowerCase().includes(query))
        )
      })).filter(cat => cat.services.length > 0);
    }

    return cats;
  }

  get filteredCount(): number {
    return this.filteredCategories.reduce((sum, cat) => sum + cat.services.length, 0);
  }

  // ===== METHODS =====

  setFilter(filter: string): void {
    this.activeFilter = filter;
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.activeFilter = 'all';
  }

  // ===== MODAL =====

  openServiceModal(service: Service, category: ServiceCategory): void {
    this.selectedService = service;
    this.selectedCategory = category;
    document.body.style.overflow = 'hidden';
  }

  closeModal(): void {
    this.selectedService = null;
    this.selectedCategory = null;
    document.body.style.overflow = '';
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.closeModal();
    }
  }

  contactWithService(): void {
    if (this.selectedService) {
      this.router.navigate(['/contact'], {
        queryParams: { service: this.selectedService.id }
      });
    }
    this.closeModal();
  }
}