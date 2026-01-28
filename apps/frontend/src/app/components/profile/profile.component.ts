// ==================== pages/profile/profile.component.ts ====================
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { trigger, transition, style, animate } from '@angular/animations';
import { AuthService, User, UserRole } from '../../services/auth.service';
import { ApiService } from '../../api/api.service';
import { ToastService } from '../../shared/toasts/toast.service';
import { ConfirmationService } from '../../shared/confirmation/confirmation.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
  animations: [
    trigger('slideDown', [
      transition(':enter', [
        style({ opacity: 0, height: 0, overflow: 'hidden' }),
        animate('300ms ease-out', style({ opacity: 1, height: '*' }))
      ]),
      transition(':leave', [
        style({ opacity: 1, height: '*', overflow: 'hidden' }),
        animate('200ms ease-in', style({ opacity: 0, height: 0 }))
      ])
    ])
  ]
})
export class ProfileComponent implements OnInit {
  user: User | null = null;
  UserRole = UserRole;
  
  // Edit mode
  editMode = false;
  editName = '';
  saving = false;
  
  // Accordion
  showDetails = false;

  constructor(
    private authService: AuthService,
    private apiService: ApiService,
    private router: Router,
    private toasts: ToastService,
    private confirmationService: ConfirmationService
  ) { }

  ngOnInit(): void {
    this.authService.currentUser$.subscribe(user => {
      this.user = user;
      if (user) {
        this.editName = user.name;
      }
    });
  }

  toggleEditMode() {
    this.editMode = !this.editMode;
    if (this.editMode && this.user) {
      this.editName = this.user.name;
    }
  }

  cancelEdit() {
    this.editMode = false;
    if (this.user) {
      this.editName = this.user.name;
    }
  }

  saveProfile() {
    if (!this.user || !this.editName.trim() || this.editName.length < 2) {
      this.toasts.error('Name muss mindestens 2 Zeichen lang sein.');
      return;
    }

    this.saving = true;
    this.apiService.updateUser(this.user.id, { name: this.editName.trim() }).subscribe({
      next: (updatedUser) => {
        // Update local storage and auth service
        localStorage.setItem('current_user', JSON.stringify(updatedUser));
        this.user = updatedUser;
        this.editMode = false;
        this.saving = false;
        this.toasts.success('Profil erfolgreich aktualisiert!');
      },
      error: (err) => {
        this.saving = false;
        this.toasts.error('Fehler beim Speichern: ' + (err.error?.message || 'Unbekannter Fehler'));
      }
    });
  }

  toggleNewsletter() {
    if (!this.user) return;

    const newValue = !this.user.wantsNewsletter;
    this.apiService.updateUser(this.user.id, { wantsNewsletter: newValue }).subscribe({
      next: (updatedUser) => {
        localStorage.setItem('current_user', JSON.stringify(updatedUser));
        this.user = updatedUser;
        this.toasts.success(newValue ? 'Newsletter abonniert!' : 'Newsletter abbestellt.');
      },
      error: (err) => {
        this.toasts.error('Fehler: ' + (err.error?.message || 'Konnte Newsletter-Status nicht ändern'));
      }
    });
  }

  toggleDetails() {
    this.showDetails = !this.showDetails;
  }

  copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      this.toasts.success('In Zwischenablage kopiert!');
    }).catch(() => {
      this.toasts.error('Kopieren fehlgeschlagen');
    });
  }

  async logout() {
    const confirmed = await this.confirmationService.confirm({
      title: 'Abmelden',
      message: 'Möchtest du dich wirklich abmelden?',
      confirmText: 'Ja, abmelden',
      cancelText: 'Abbrechen',
      type: 'danger',
      icon: 'logout'
    });

    if (confirmed) {
      this.authService.logout();
      this.toasts.success('Erfolgreich abgemeldet.');
      this.router.navigate(['/']);
    }
  }

  routeTo(route: string) {
    this.router.navigate([route]);
  }

  getRoleBadgeClass(): string {
    return this.user?.role === UserRole.ADMIN ? 'role-admin' : 'role-user';
  }

  getRoleLabel(): string {
    return this.user?.role === UserRole.ADMIN ? 'Administrator' : 'Benutzer';
  }

  formatDate(dateString: Date | undefined): string {
    if (!dateString) return '-';

    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  getRoleIcon(): string {
    return this.user?.role === UserRole.ADMIN ? 'admin_panel_settings' : 'person';
  }
}
