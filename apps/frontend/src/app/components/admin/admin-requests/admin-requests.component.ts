import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminLayoutComponent } from '../admin-layout/admin-layout.component';
import { IconComponent } from '../../../shared/icon/icon.component';
import { ConfirmationService } from '../../../shared/confirmation/confirmation.service';
import { ContactRequest, ApiService, ServiceCategory } from '../../../api/api.service';
import { NotificationRefreshService } from '../../../shared/admin-notification-center/notification-refresh.service';

type Tab = 'unprocessed' | 'processed';

@Component({
  selector: 'app-admin-requests',
  standalone: true,
  imports: [CommonModule, AdminLayoutComponent, IconComponent],
  templateUrl: './admin-requests.component.html',
  styleUrl: './admin-requests.component.scss'
})
export class AdminRequestsComponent implements OnInit {
  activeTab: Tab = 'unprocessed';
  unprocessedRequests: ContactRequest[] = [];
  processedRequests: ContactRequest[] = [];
  loading = true;
  error = '';
  expandedId: string | null = null;
  
  // Services aus dem Katalog für Label-Mapping
  private servicesMap = new Map<string, string>();

  constructor(
    private api: ApiService,
    private confirmationService: ConfirmationService,
    private notificationRefresh: NotificationRefreshService
  ) {}

  ngOnInit(): void {
    this.loadServices();
    this.loadRequests();
  }

  private loadServices(): void {
    this.api.getServicesCatalog().subscribe({
      next: (categories) => {
        categories.forEach(cat => {
          cat.services?.forEach(service => {
            this.servicesMap.set(service.slug, service.title);
          });
        });
      }
    });
  }

  get currentRequests(): ContactRequest[] {
    return this.activeTab === 'unprocessed' 
      ? this.unprocessedRequests 
      : this.processedRequests;
  }

  trackById = (_: number, r: ContactRequest) => r.id;

  switchTab(tab: Tab): void {
    this.activeTab = tab;
    this.expandedId = null;
  }

  toggleExpand(id: string): void {
    this.expandedId = this.expandedId === id ? null : id;
  }

  loadRequests(): void {
    this.loading = true;
    this.error = '';
    this.expandedId = null;

    Promise.all([
      this.api.getUnprocessedContactRequests().toPromise(),
      this.api.getAllContactRequests().toPromise()
    ])
      .then(([unprocessed, all]) => {
        this.unprocessedRequests = unprocessed || [];
        const unprocessedIds = new Set(this.unprocessedRequests.map(r => r.id));
        this.processedRequests = (all || []).filter(r => !unprocessedIds.has(r.id));
      })
      .catch((err) => {
        console.error('Fehler beim Laden der Anfragen:', err);
        this.error = 'Fehler beim Laden der Anfragen';
      })
      .finally(() => this.loading = false);
  }

  markAsProcessed(id: string): void {
    this.api.markContactRequestAsProcessed(id).subscribe({
      next: () => {
        const idx = this.unprocessedRequests.findIndex(r => r.id === id);
        if (idx > -1) {
          const [request] = this.unprocessedRequests.splice(idx, 1);
          this.processedRequests.unshift({ ...request, isProcessed: true });
        }
        if (this.expandedId === id) this.expandedId = null;
        this.notificationRefresh.triggerRefresh();
      },
      error: (err) => this.handleError('Markieren', err)
    });
  }

  markAsUnprocessed(id: string): void {
    this.api.updateContactRequest(id, { isProcessed: false }).subscribe({
      next: () => {
        const idx = this.processedRequests.findIndex(r => r.id === id);
        if (idx > -1) {
          const [request] = this.processedRequests.splice(idx, 1);
          this.unprocessedRequests.unshift({ ...request, isProcessed: false });
        }
        if (this.expandedId === id) this.expandedId = null;
        this.notificationRefresh.triggerRefresh();
      },
      error: (err) => this.handleError('Markieren', err)
    });
  }

  async deleteRequest(id: string): Promise<void> {
    const confirmed = await this.confirmationService.confirm({
      title: 'Anfrage löschen',
      message: 'Diese Aktion kann nicht rückgängig gemacht werden.',
      confirmText: 'Löschen',
      cancelText: 'Abbrechen',
      type: 'danger',
      icon: 'delete'
    });

    if (confirmed) {
      this.api.deleteContactRequest(id).subscribe({
        next: () => {
          this.unprocessedRequests = this.unprocessedRequests.filter(r => r.id !== id);
          this.processedRequests = this.processedRequests.filter(r => r.id !== id);
          if (this.expandedId === id) this.expandedId = null;
          this.notificationRefresh.triggerRefresh();
        },
        error: (err) => this.handleError('Löschen', err)
      });
    }
  }

  private async handleError(action: string, err: any): Promise<void> {
    console.error(`Fehler beim ${action}:`, err);
    await this.confirmationService.confirm({
      title: 'Fehler',
      message: `Beim ${action} ist ein Fehler aufgetreten.`,
      confirmText: 'OK',
      type: 'danger',
      icon: 'error'
    });
  }

  getServiceLabel(slug: string): string {
    // Aus Services-Katalog holen oder Slug formatieren
    return this.servicesMap.get(slug) || this.formatSlug(slug);
  }
  
  private formatSlug(slug: string): string {
    // "pc-reparatur" → "Pc Reparatur"
    return slug
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  formatDate(dateInput: Date | string): string {
    if (!dateInput) return '—';
    
    const date = new Date(dateInput);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Gerade eben';
    if (diffMins < 60) return `vor ${diffMins}m`;
    if (diffHours < 24) return `vor ${diffHours}h`;
    if (diffDays === 1) return 'Gestern';
    if (diffDays < 7) return `vor ${diffDays} Tagen`;
    
    return date.toLocaleDateString('de-DE', { 
      day: '2-digit', 
      month: '2-digit',
      year: '2-digit'
    });
  }

  getAdditionalFields(request: any): Array<{ key: string; value: any; isDate: boolean }> {
    const excludedKeys = new Set([
      'id', 'name', 'email', 'phoneNumber', 'serviceType', 
      'message', 'createdAt', 'prefersCallback', 'isProcessed'
    ]);

    return Object.entries(request || {})
      .filter(([key, value]) => 
        !excludedKeys.has(key) && 
        value !== null && 
        value !== undefined && 
        value !== ''
      )
      .map(([key, value]) => ({
        key: this.formatFieldKey(key),
        value: Array.isArray(value) ? value.join(', ') : value,
        isDate: typeof value === 'string' && !isNaN(Date.parse(value))
      }));
  }

  private formatFieldKey(key: string): string {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }
}