import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, CreateUserDto, UpdateUserDto } from '../../../api/api.service';
import { User, UserRole } from '../../../services/auth.service';
import { AuthService } from '../../../services/auth.service';
import { AdminLayoutComponent } from '../admin-layout/admin-layout.component';
import { ConfirmationService } from '../../../shared/confirmation/confirmation.service';
import { ToastService } from '../../../shared/toasts/toast.service';

interface UserStats {
  totalUsers: number;
}

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminLayoutComponent],
  templateUrl: './admin-users.component.html',
  styleUrl: './admin-users.component.scss'
})
export class AdminUsersComponent implements OnInit {
  users: User[] = [];
  stats: UserStats | null = null;
  loading = true;
  error = '';

  // Filters
  searchTerm = '';
  filterRole: 'all' | 'admin' | 'user' = 'all';
  sortBy: 'name' | 'email' | 'createdAt' | 'role' = 'createdAt';
  sortDir: 'asc' | 'desc' = 'desc';

  // Modal state
  modalOpen = false;
  modalMode: 'create' | 'edit' | 'password' = 'create';
  editingUser: User | null = null;
  processing = false;

  // Create/Edit form
  formName = '';
  formEmail = '';
  formRole: UserRole = UserRole.USER;
  formPassword = '';
  formPasswordConfirm = '';
  formIsVerified = false;
  formIsProfileComplete = false;

  // Password visibility
  showPassword = false;
  showPasswordConfirm = false;

  // Current admin
  currentUserId = '';

  UserRole = UserRole;

  constructor(
    private api: ApiService,
    private authService: AuthService,
    private confirmationService: ConfirmationService,
    private toasts: ToastService,
  ) {}

  ngOnInit(): void {
    this.currentUserId = this.authService.getCurrentUser()?.id || '';
    this.loadData();
  }

  loadData(): void {
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
        this.error = 'Fehler beim Laden der Benutzerdaten';
        this.loading = false;
      });
  }

  // ==================== FILTERING & SORTING ====================

  get filteredUsers(): User[] {
    let result = this.users.filter(user => {
      const matchesSearch = !this.searchTerm ||
        user.name.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(this.searchTerm.toLowerCase());
      const matchesRole = this.filterRole === 'all' ||
        (this.filterRole === 'admin' && user.role === UserRole.ADMIN) ||
        (this.filterRole === 'user' && user.role === UserRole.USER);
      return matchesSearch && matchesRole;
    });

    result.sort((a, b) => {
      let cmp = 0;
      switch (this.sortBy) {
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'email': cmp = a.email.localeCompare(b.email); break;
        case 'role': cmp = a.role.localeCompare(b.role); break;
        case 'createdAt':
        default:
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
      }
      return this.sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }

  get adminCount(): number {
    return this.users.filter(u => u.role === UserRole.ADMIN).length;
  }

  get verifiedCount(): number {
    return this.users.filter(u => u.isVerified).length;
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.filterRole = 'all';
  }

  toggleSort(col: 'name' | 'email' | 'createdAt' | 'role'): void {
    if (this.sortBy === col) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = col;
      this.sortDir = col === 'createdAt' ? 'desc' : 'asc';
    }
  }

  // ==================== MODAL ====================

  openCreateModal(): void {
    this.modalMode = 'create';
    this.editingUser = null;
    this.formName = '';
    this.formEmail = '';
    this.formRole = UserRole.USER;
    this.formPassword = '';
    this.formPasswordConfirm = '';
    this.formIsVerified = true;
    this.formIsProfileComplete = false;
    this.showPassword = false;
    this.showPasswordConfirm = false;
    this.modalOpen = true;
  }

  openEditModal(user: User): void {
    this.modalMode = 'edit';
    this.editingUser = user;
    this.formName = user.name;
    this.formEmail = user.email;
    this.formRole = user.role;
    this.formPassword = '';
    this.formPasswordConfirm = '';
    this.formIsVerified = user.isVerified ?? false;
    this.formIsProfileComplete = user.isProfileComplete ?? false;
    this.showPassword = false;
    this.showPasswordConfirm = false;
    this.modalOpen = true;
  }

  openPasswordModal(user: User): void {
    this.modalMode = 'password';
    this.editingUser = user;
    this.formPassword = '';
    this.formPasswordConfirm = '';
    this.showPassword = false;
    this.showPasswordConfirm = false;
    this.modalOpen = true;
  }

  closeModal(): void {
    this.modalOpen = false;
    this.editingUser = null;
  }

  get modalTitle(): string {
    switch (this.modalMode) {
      case 'create': return 'Neuen Benutzer anlegen';
      case 'edit': return `${this.editingUser?.name} bearbeiten`;
      case 'password': return 'Passwort zurücksetzen';
    }
  }

  get modalIcon(): string {
    switch (this.modalMode) {
      case 'create': return 'person_add';
      case 'edit': return 'edit';
      case 'password': return 'lock_reset';
    }
  }

  get isFormValid(): boolean {
    if (this.modalMode === 'password') {
      return this.formPassword.length >= 8 && this.formPassword === this.formPasswordConfirm;
    }
    if (this.modalMode === 'create') {
      return this.formName.trim().length >= 2
        && this.isValidEmail(this.formEmail)
        && this.formPassword.length >= 8
        && this.formPassword === this.formPasswordConfirm;
    }
    // edit — password is optional
    return this.formName.trim().length >= 2
      && this.isValidEmail(this.formEmail)
      && (this.formPassword.length === 0 || (this.formPassword.length >= 8 && this.formPassword === this.formPasswordConfirm));
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  // ==================== SAVE ====================

  saveModal(): void {
    if (!this.isFormValid || this.processing) return;
    this.processing = true;

    if (this.modalMode === 'create') {
      const dto: CreateUserDto = {
        name: this.formName.trim(),
        email: this.formEmail.trim().toLowerCase(),
        password: this.formPassword,
      };
      this.api.adminCreateUser(dto).subscribe({
        next: (created) => {
          const updates: any = {};
          if (this.formRole !== UserRole.USER) updates.role = this.formRole;
          if (this.formIsVerified) updates.isVerified = true;
          if (this.formIsProfileComplete) updates.isProfileComplete = true;

          if (Object.keys(updates).length > 0) {
            this.api.updateUser(created.id, updates).subscribe({
              next: () => {
                this.toasts.success(`${created.name} wurde angelegt`);
                this.closeModal();
                this.loadData();
                this.processing = false;
              },
              error: () => {
                this.toasts.success(`${created.name} angelegt (Zusatz-Update fehlgeschlagen)`);
                this.closeModal();
                this.loadData();
                this.processing = false;
              }
            });
          } else {
            this.toasts.success(`${created.name} wurde angelegt`);
            this.closeModal();
            this.loadData();
            this.processing = false;
          }
        },
        error: (err) => {
          this.toasts.error(err.error?.message || 'Fehler beim Anlegen');
          this.processing = false;
        }
      });
    } else if (this.modalMode === 'edit' && this.editingUser) {
      const dto: UpdateUserDto = {
        name: this.formName.trim(),
        email: this.formEmail.trim().toLowerCase(),
        role: this.formRole,
        isVerified: this.formIsVerified,
        isProfileComplete: this.formIsProfileComplete,
      };
      if (this.formPassword.length >= 8 && this.formPassword === this.formPasswordConfirm) {
        (dto as any).password = this.formPassword;
      }
      this.api.updateUser(this.editingUser.id, dto).subscribe({
        next: (updated) => {
          const idx = this.users.findIndex(u => u.id === updated.id);
          if (idx !== -1) this.users[idx] = updated;
          this.toasts.success(`${updated.name} wurde aktualisiert`);
          this.closeModal();
          this.processing = false;
        },
        error: (err) => {
          this.toasts.error(err.error?.message || 'Fehler beim Speichern');
          this.processing = false;
        }
      });
    } else if (this.modalMode === 'password' && this.editingUser) {
      this.api.adminResetPassword(this.editingUser.id, this.formPassword).subscribe({
        next: (res) => {
          this.toasts.success(res.message);
          this.closeModal();
          this.processing = false;
        },
        error: (err) => {
          this.toasts.error(err.error?.message || 'Fehler beim Zurücksetzen');
          this.processing = false;
        }
      });
    }
  }

  // ==================== QUICK ACTIONS ====================

  async toggleRole(user: User): Promise<void> {
    const isAdmin = user.role === UserRole.ADMIN;
    const confirmed = await this.confirmationService.confirm({
      title: isAdmin ? 'Admin-Rechte entfernen' : 'Zum Admin machen',
      message: isAdmin
        ? `Admin-Rechte von "${user.name}" entfernen?`
        : `"${user.name}" zum Administrator machen?`,
      confirmText: isAdmin ? 'Entfernen' : 'Zum Admin machen',
      cancelText: 'Abbrechen',
      type: 'warning',
      icon: isAdmin ? 'remove_moderator' : 'shield_person'
    });
    if (!confirmed) return;

    const newRole = isAdmin ? UserRole.USER : UserRole.ADMIN;
    this.api.updateUser(user.id, { role: newRole }).subscribe({
      next: (updated) => {
        const idx = this.users.findIndex(u => u.id === user.id);
        if (idx !== -1) this.users[idx] = updated;
        this.toasts.success(isAdmin ? `Admin-Rechte von ${user.name} entfernt` : `${user.name} ist jetzt Admin`);
      },
      error: () => this.toasts.error('Fehler beim Aktualisieren')
    });
  }

  async deleteUser(user: User): Promise<void> {
    if (user.id === this.currentUserId) {
      this.toasts.error('Du kannst dich nicht selbst löschen');
      return;
    }
    const confirmed = await this.confirmationService.confirm({
      title: 'Benutzer löschen',
      message: `"${user.name}" (${user.email}) wirklich endgültig löschen?`,
      confirmText: 'Endgültig löschen',
      cancelText: 'Abbrechen',
      type: 'danger',
      icon: 'delete_forever'
    });
    if (!confirmed) return;

    this.api.deleteUser(user.id).subscribe({
      next: () => {
        this.users = this.users.filter(u => u.id !== user.id);
        this.toasts.success(`${user.name} wurde gelöscht`);
        this.loadData();
      },
      error: () => this.toasts.error('Fehler beim Löschen')
    });
  }

  async toggleVerified(user: User): Promise<void> {
    const newVal = !user.isVerified;
    this.api.updateUser(user.id, { isVerified: newVal } as any).subscribe({
      next: (updated) => {
        const idx = this.users.findIndex(u => u.id === user.id);
        if (idx !== -1) this.users[idx] = updated;
        this.toasts.success(newVal ? `${user.name} verifiziert` : `Verifizierung von ${user.name} entfernt`);
      },
      error: () => this.toasts.error('Fehler beim Aktualisieren')
    });
  }

  // ==================== HELPERS ====================

  getInitials(name: string): string {
    return name.split(' ').map(n => n.charAt(0).toUpperCase()).slice(0, 2).join('');
  }

  formatDate(date?: Date): string {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
  }

  formatDateTime(date?: Date): string {
    if (!date) return '—';
    return new Date(date).toLocaleString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  async copyEmail(email: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(email);
      this.toasts.success('E-Mail kopiert');
    } catch {
      this.toasts.error('Kopieren fehlgeschlagen');
    }
  }

  get passwordMismatch(): boolean {
    return this.formPasswordConfirm.length > 0 && this.formPassword !== this.formPasswordConfirm;
  }

  get passwordTooShort(): boolean {
    return this.formPassword.length > 0 && this.formPassword.length < 8;
  }
}
