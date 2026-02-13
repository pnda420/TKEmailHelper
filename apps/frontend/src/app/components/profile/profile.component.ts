// ==================== pages/profile/profile.component.ts ====================
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { trigger, transition, style, animate } from '@angular/animations';
import { AuthService, User, UserRole, UserSignature } from '../../services/auth.service';
import { ApiService, UserMailbox } from '../../api/api.service';
import { ToastService } from '../../shared/toasts/toast.service';
import { ConfirmationService } from '../../shared/confirmation/confirmation.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
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
  
  // AI Context (for AI to know who the user is)
  signatureSaving = false;
  editSignature: UserSignature = {
    name: '',
    position: ''
  };

  // Assigned mailboxes
  myMailboxes: UserMailbox[] = [];

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
        this.loadSignatureFromUser(user);
        this.loadMyMailboxes();
      }
    });
  }

  private loadSignatureFromUser(user: User): void {
    this.editSignature = {
      name: user.signatureName || '',
      position: user.signaturePosition || ''
    };
  }

  private loadMyMailboxes(): void {
    this.apiService.getMyMailboxes().subscribe({
      next: (mailboxes) => this.myMailboxes = mailboxes,
      error: (err) => console.error('Failed to load mailboxes:', err)
    });
  }

  // ==================== AI Context Methods ====================

  saveSignature(): void {
    if (!this.user) return;

    this.signatureSaving = true;
    
    const signatureData = {
      signatureName: this.editSignature.name?.trim() || null,
      signaturePosition: this.editSignature.position?.trim() || null
    };

    this.apiService.updateMe(signatureData).subscribe({
      next: (updatedUser) => {
        localStorage.setItem('current_user', JSON.stringify(updatedUser));
        this.user = updatedUser;
        this.signatureSaving = false;
        this.toasts.success('KI-Kontext erfolgreich gespeichert!');
      },
      error: (err) => {
        this.signatureSaving = false;
        this.toasts.error('Fehler beim Speichern: ' + (err.error?.message || 'Unbekannter Fehler'));
      }
    });
  }

  hasSignature(): boolean {
    return !!(this.user?.signatureName || this.user?.signaturePosition);
  }

  // ==================== Profile Methods ====================

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
    this.apiService.updateMe({ name: this.editName.trim() }).subscribe({
      next: (updatedUser) => {
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
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  getRoleIcon(): string {
    return this.user?.role === UserRole.ADMIN ? 'admin_panel_settings' : 'person';
  }
}
