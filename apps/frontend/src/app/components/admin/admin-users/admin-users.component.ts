import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../api/api.service';
import { User, UserRole } from '../../../services/auth.service';
import { AdminLayoutComponent } from '../admin-layout/admin-layout.component';
import { ConfirmationService } from '../../../shared/confirmation/confirmation.service';
import { IconComponent } from '../../../shared/icon/icon.component';

interface UserStats {
  totalUsers: number;
  newsletterSubscribers: number;
  subscriberRate: number;
}

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminLayoutComponent, IconComponent],
  templateUrl: './admin-users.component.html',
  styleUrl: './admin-users.component.scss'
})
export class AdminUsersComponent implements OnInit {
  users: User[] = [];
  stats: UserStats | null = null;
  loading = true;
  error = '';
  searchTerm = '';
  filterRole: 'all' | 'admin' | 'user' = 'all';
  processingUserId: string | null = null;

  // Toast
  toastMessage = '';
  toastType: 'success' | 'error' = 'success';
  private toastTimeout: any;

  UserRole = UserRole;

  constructor(
    private api: ApiService,
    private confirmationService: ConfirmationService
  ) { }

  ngOnInit(): void {
    this.loadData();
  }

  loadData() {
    this.loading = true;
    this.error = '';

    Promise.all([
      this.api.getAllUsers().toPromise(),
      this.api.getUserStats().toPromise()
    ])
      .then(([users, stats]) => {
        this.users = users || [];
        this.stats = stats || null;
        this.loading = false;
      })
      .catch((err) => {
        console.error('Fehler beim Laden:', err);
        this.error = 'Fehler beim Laden der Daten';
        this.loading = false;
      });
  }

  get filteredUsers(): User[] {
    return this.users.filter(user => {
      const matchesSearch = !this.searchTerm ||
        user.name.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(this.searchTerm.toLowerCase());

      const matchesRole = this.filterRole === 'all' ||
        (this.filterRole === 'admin' && user.role === UserRole.ADMIN) ||
        (this.filterRole === 'user' && user.role === UserRole.USER);

      return matchesSearch && matchesRole;
    });
  }

  async deleteUser(user: User) {
    const confirmed = await this.confirmationService.confirm({
      title: 'User löschen',
      message: `Möchtest du "${user.name}" wirklich löschen?`,
      confirmText: 'Löschen',
      cancelText: 'Abbrechen',
      type: 'danger',
      icon: 'delete'
    });

    if (!confirmed) return;

    this.processingUserId = user.id;
    this.api.deleteUser(user.id).subscribe({
      next: () => {
        this.users = this.users.filter(u => u.id !== user.id);
        this.showToast(`${user.name} wurde gelöscht`);
        this.processingUserId = null;
        this.loadData(); // Refresh stats
      },
      error: (err) => {
        console.error('Fehler beim Löschen:', err);
        this.showToast('Fehler beim Löschen', 'error');
        this.processingUserId = null;
      }
    });
  }

  async makeAdmin(user: User) {
    const confirmed = await this.confirmationService.confirm({
      title: 'Admin-Rechte vergeben',
      message: `"${user.name}" zum Administrator machen?`,
      confirmText: 'Zum Admin machen',
      cancelText: 'Abbrechen',
      type: 'warning',
      icon: 'shield_person'
    });

    if (!confirmed) return;

    this.processingUserId = user.id;
    this.api.updateUser(user.id, { role: UserRole.ADMIN }).subscribe({
      next: (updated) => {
        const index = this.users.findIndex(u => u.id === user.id);
        if (index !== -1) {
          this.users[index] = updated;
        }
        this.showToast(`${user.name} ist jetzt Admin`);
        this.processingUserId = null;
      },
      error: (err) => {
        console.error('Fehler:', err);
        this.showToast('Fehler beim Aktualisieren', 'error');
        this.processingUserId = null;
      }
    });
  }

  async removeAdmin(user: User) {
    const confirmed = await this.confirmationService.confirm({
      title: 'Admin-Rechte entfernen',
      message: `Admin-Rechte von "${user.name}" entfernen?`,
      confirmText: 'Entfernen',
      cancelText: 'Abbrechen',
      type: 'warning',
      icon: 'remove_moderator'
    });

    if (!confirmed) return;

    this.processingUserId = user.id;
    this.api.updateUser(user.id, { role: UserRole.USER }).subscribe({
      next: (updated) => {
        const index = this.users.findIndex(u => u.id === user.id);
        if (index !== -1) {
          this.users[index] = updated;
        }
        this.showToast(`Admin-Rechte von ${user.name} entfernt`);
        this.processingUserId = null;
      },
      error: (err) => {
        console.error('Fehler:', err);
        this.showToast('Fehler beim Aktualisieren', 'error');
        this.processingUserId = null;
      }
    });
  }

  async copyEmail(email: string) {
    try {
      await navigator.clipboard.writeText(email);
      this.showToast('E-Mail kopiert');
    } catch (err) {
      this.showToast('Kopieren fehlgeschlagen', 'error');
    }
  }

  showToast(message: string, type: 'success' | 'error' = 'success') {
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }
    this.toastMessage = message;
    this.toastType = type;
    this.toastTimeout = setTimeout(() => {
      this.toastMessage = '';
    }, 3000);
  }

  formatDate(dateString?: Date): string {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit'
    });
  }

  clearFilters() {
    this.searchTerm = '';
    this.filterRole = 'all';
  }
}