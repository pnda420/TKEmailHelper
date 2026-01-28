import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { trigger, transition, style, animate } from '@angular/animations';
import { forkJoin } from 'rxjs';
import { ApiService, NewsletterSubscriber } from '../../../api/api.service';
import { User } from '../../../services/auth.service';
import { AdminLayoutComponent } from '../admin-layout/admin-layout.component';
import { ConfirmationComponent, ConfirmationConfig } from '../../../shared/confirmation/confirmation.component';

@Component({
  selector: 'app-admin-newsletter',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, AdminLayoutComponent, ConfirmationComponent],
  templateUrl: './admin-newsletter.component.html',
  styleUrl: './admin-newsletter.component.scss',
  animations: [
    trigger('fadeSlide', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-10px)' }),
        animate('200ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0, transform: 'translateY(-10px)' }))
      ])
    ])
  ]
})
export class AdminNewsletterComponent implements OnInit {
  // Tab management
  activeTab: 'emails' | 'users' = 'emails';
  
  // Email Subscribers (öffentliche Anmeldungen)
  subscribers: NewsletterSubscriber[] = [];
  filteredSubscribers: NewsletterSubscriber[] = [];
  
  // User Subscribers (registrierte User mit Newsletter)
  userSubscribers: User[] = [];
  filteredUserSubscribers: User[] = [];
  
  loading = true;
  error = '';
  copiedEmail = '';
  searchTerm = '';
  userSearchTerm = '';
  filterStatus: 'all' | 'active' | 'inactive' = 'all';
  
  stats = { total: 0, active: 0, inactive: 0 };
  userStats = { total: 0 };
  
  toast = { show: false, message: '', type: 'success' as 'success' | 'error' | 'info' };
  private toastTimeout: any;

  deleteModal = {
    isOpen: false,
    loading: false,
    subscriber: null as NewsletterSubscriber | null,
    config: {
      title: 'Abonnent löschen',
      message: 'Möchtest du diesen Abonnenten wirklich endgültig löschen?',
      confirmText: 'Löschen',
      cancelText: 'Abbrechen',
      type: 'danger' as const,
      icon: 'delete'
    } as ConfirmationConfig
  };

  constructor(private apiService: ApiService) {}

  ngOnInit(): void {
    this.loadAll();
  }

  trackById = (_: number, s: NewsletterSubscriber) => s.id;
  trackByUserId = (_: number, u: User) => u.id;

  loadAll(): void {
    this.loading = true;
    this.error = '';
    
    forkJoin({
      newsletter: this.apiService.getNewsletterSubscribers(),
      users: this.apiService.getUserNewsletterSubscribers()
    }).subscribe({
      next: (res) => {
        // Email Subscribers
        this.subscribers = res.newsletter.subscribers || [];
        this.stats = {
          total: res.newsletter.total,
          active: res.newsletter.active,
          inactive: res.newsletter.inactive
        };
        this.filterSubscribers();
        
        // User Subscribers
        this.userSubscribers = res.users || [];
        this.userStats.total = this.userSubscribers.length;
        this.filterUserSubscribers();
      },
      error: (err) => {
        console.error('Error loading newsletter data:', err);
        this.error = 'Fehler beim Laden der Abonnenten';
      },
      complete: () => {
        this.loading = false;
      }
    });
  }

  loadSubscribers(): void {
    this.loadAll();
  }

  setTab(tab: 'emails' | 'users'): void {
    this.activeTab = tab;
    this.searchTerm = '';
    this.filterStatus = 'all';
    if (tab === 'emails') {
      this.filterSubscribers();
    } else {
      this.filterUserSubscribers();
    }
  }

  filterSubscribers(): void {
    let result = [...this.subscribers];

    // Search filter
    if (this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase();
      result = result.filter(s => s.email.toLowerCase().includes(term));
    }

    // Status filter
    if (this.filterStatus === 'active') {
      result = result.filter(s => s.isActive);
    } else if (this.filterStatus === 'inactive') {
      result = result.filter(s => !s.isActive);
    }

    this.filteredSubscribers = result;
  }

  filterUserSubscribers(): void {
    let result = [...this.userSubscribers];

    // Search filter
    if (this.userSearchTerm.trim()) {
      const term = this.userSearchTerm.toLowerCase();
      result = result.filter(u => 
        u.email.toLowerCase().includes(term) || 
        (u.name && u.name.toLowerCase().includes(term))
      );
    }

    this.filteredUserSubscribers = result;
  }

  onSearchChange(): void {
    if (this.activeTab === 'emails') {
      this.filterSubscribers();
    } else {
      this.filterUserSubscribers();
    }
  }

  setFilter(status: 'all' | 'active' | 'inactive'): void {
    this.filterStatus = status;
    this.filterSubscribers();
  }

  toggleStatus(subscriber: NewsletterSubscriber): void {
    this.apiService.toggleNewsletterSubscriber(subscriber.id).subscribe({
      next: (res) => {
        // Update local state
        const idx = this.subscribers.findIndex(s => s.id === subscriber.id);
        if (idx !== -1) {
          this.subscribers[idx] = res.subscriber;
        }
        // Update stats
        if (res.subscriber.isActive) {
          this.stats.active++;
          this.stats.inactive--;
        } else {
          this.stats.active--;
          this.stats.inactive++;
        }
        this.filterSubscribers();
        this.showToast(res.message, 'success');
      },
      error: (err) => {
        console.error('Toggle error:', err);
        this.showToast('Fehler beim Ändern des Status', 'error');
      }
    });
  }

  confirmDelete(subscriber: NewsletterSubscriber): void {
    this.deleteModal.subscriber = subscriber;
    this.deleteModal.config.message = `Möchtest du "${subscriber.email}" wirklich endgültig löschen? Diese Aktion kann nicht rückgängig gemacht werden.`;
    this.deleteModal.isOpen = true;
  }

  executeDelete(): void {
    if (!this.deleteModal.subscriber) return;
    
    this.deleteModal.loading = true;
    const id = this.deleteModal.subscriber.id;
    const email = this.deleteModal.subscriber.email;
    const wasActive = this.deleteModal.subscriber.isActive;

    this.apiService.deleteNewsletterSubscriber(id).subscribe({
      next: () => {
        // Remove from local state
        this.subscribers = this.subscribers.filter(s => s.id !== id);
        // Update stats
        this.stats.total--;
        if (wasActive) {
          this.stats.active--;
        } else {
          this.stats.inactive--;
        }
        this.filterSubscribers();
        this.showToast(`"${email}" wurde gelöscht`, 'success');
        this.deleteModal.isOpen = false;
      },
      error: (err) => {
        console.error('Delete error:', err);
        this.showToast('Fehler beim Löschen', 'error');
      },
      complete: () => {
        this.deleteModal.loading = false;
      }
    });
  }

  copyEmail(email: string): void {
    navigator.clipboard.writeText(email).then(() => {
      this.copiedEmail = email;
      this.showToast('E-Mail kopiert!', 'success');
      setTimeout(() => this.copiedEmail = '', 2000);
    });
  }

  copyAllEmails(): void {
    let emails: string;
    
    if (this.activeTab === 'emails') {
      emails = this.filteredSubscribers
        .filter(s => s.isActive)
        .map(s => s.email)
        .join('\n');
    } else {
      emails = this.filteredUserSubscribers
        .map(u => u.email)
        .join('\n');
    }
    
    if (!emails) {
      this.showToast('Keine E-Mails zum Kopieren', 'info');
      return;
    }

    navigator.clipboard.writeText(emails).then(() => {
      const count = emails.split('\n').length;
      this.showToast(`${count} E-Mail${count > 1 ? 's' : ''} kopiert!`, 'success');
    });
  }

  copyAllCombined(): void {
    const emailList = this.subscribers.filter(s => s.isActive).map(s => s.email);
    const userList = this.userSubscribers.map(u => u.email);
    
    // Combine and deduplicate
    const allEmails = [...new Set([...emailList, ...userList])].join('\n');
    
    if (!allEmails) {
      this.showToast('Keine E-Mails zum Kopieren', 'info');
      return;
    }

    navigator.clipboard.writeText(allEmails).then(() => {
      const count = allEmails.split('\n').length;
      this.showToast(`${count} E-Mail${count > 1 ? 's' : ''} kopiert (kombiniert, ohne Duplikate)!`, 'success');
    });
  }

  exportToCSV(): void {
    if (this.activeTab === 'emails') {
      this.exportEmailsToCSV();
    } else {
      this.exportUsersToCSV();
    }
  }

  private exportEmailsToCSV(): void {
    const headers = ['E-Mail', 'Status', 'Angemeldet am'];
    const rows = this.filteredSubscribers.map(s => [
      s.email,
      s.isActive ? 'Aktiv' : 'Inaktiv',
      this.formatDateFull(s.subscribedAt)
    ]);

    this.downloadCSV(headers, rows, 'newsletter-emails');
  }

  private exportUsersToCSV(): void {
    const headers = ['E-Mail', 'Name', 'Registriert am'];
    const rows = this.filteredUserSubscribers.map(u => [
      u.email,
      u.name || '-',
      this.formatDateFull(u.createdAt)
    ]);

    this.downloadCSV(headers, rows, 'newsletter-users');
  }

  private downloadCSV(headers: string[], rows: string[][], filename: string): void {
    const esc = (v: string) => {
      const value = String(v ?? '');
      return /[;"\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
    };

    const csv = [
      headers.map(esc).join(';'),
      ...rows.map(r => r.map(esc).join(';'))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    this.showToast('CSV exportiert!', 'success');
  }

  formatDate(date: Date | string): string {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const min = Math.floor(diffMs / 60000);
    const h = Math.floor(diffMs / 3600000);
    const days = Math.floor(diffMs / 86400000);

    if (min < 1) return 'Gerade eben';
    if (min < 60) return `Vor ${min} Min.`;
    if (h < 24) return `Vor ${h} Std.`;
    if (days < 7) return `Vor ${days} Tag${days > 1 ? 'en' : ''}`;
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  formatDateFull(date: Date | string): string {
    return new Date(date).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  private showToast(message: string, type: 'success' | 'error' | 'info'): void {
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toast = { show: true, message, type };
    this.toastTimeout = setTimeout(() => {
      this.toast.show = false;
    }, 3000);
  }
}
