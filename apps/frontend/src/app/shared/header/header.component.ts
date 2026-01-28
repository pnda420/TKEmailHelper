import { CommonModule, DOCUMENT } from '@angular/common';
import { Component, Inject, OnInit, OnDestroy, HostListener } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { AuthService, User, UserRole } from '../../services/auth.service';
import { ToastService } from '../toasts/toast.service';
import { ConfirmationService } from '../confirmation/confirmation.service';
import { AdminNotificationCenterComponent } from '../admin-notification-center/admin-notification-center.component';
import { ApiService, ServiceCategory } from '../../api/api.service';
import { Subscription } from 'rxjs';

interface NavCategory {
  id: string;
  name: string;
  icon: string;
}

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterModule, CommonModule, AdminNotificationCenterComponent],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class HeaderComponent implements OnInit, OnDestroy {
  open = false;
  user: User | null = null;
  UserRole = UserRole;
  
  // Services Dropdown
  servicesDropdownOpen = false;
  serviceCategories: NavCategory[] = [];
  private categoriesSub?: Subscription;
  private routerSub?: Subscription;

  constructor(
    @Inject(DOCUMENT) private doc: Document,
    public router: Router,
    private authService: AuthService,
    private toasts: ToastService,
    private confirmationService: ConfirmationService,
    private api: ApiService
  ) { }

  ngOnInit(): void {
    this.authService.currentUser$.subscribe(user => {
      this.user = user;
    });
    
    
    // Reset dropdown on EVERY route change
    this.routerSub = this.router.events.subscribe(() => {
      this.servicesDropdownOpen = false;
      this.open = false;
      this.doc.body.style.overflow = '';
      this.doc.body.style.touchAction = '';
    });
  }

  ngOnDestroy(): void {
    this.categoriesSub?.unsubscribe();
    this.routerSub?.unsubscribe();
  }

  // Close dropdown when clicking outside
  // KEIN touchend - das stört den Burger-Button!
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    const target = event.target as HTMLElement;
    // Wenn Klick NICHT im Dropdown-Container UND NICHT im nav-toggle ist
    if (!target.closest('.nav-dropdown-container') && !target.closest('.nav-toggle')) {
      this.servicesDropdownOpen = false;
    }
  }

  toggleServicesDropdown(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.servicesDropdownOpen = !this.servicesDropdownOpen;
  }

  navigateToCategory(categoryId: string): void {
    this.router.navigate(['/services'], { 
      queryParams: { category: categoryId } 
    });
    this.servicesDropdownOpen = false;
    this.closeMenu();
  }

  navigateToServices(): void {
    this.router.navigate(['/services']);
    this.servicesDropdownOpen = false;
    this.closeMenu();
  }

  // Public damit es im Template verwendet werden kann
  closeMenu(): void {
    this.open = false;
    this.servicesDropdownOpen = false;
    this.doc.body.style.overflow = '';
    this.doc.body.style.touchAction = '';
  }

  // Safari Touch Fix: Event explizit behandeln
  toggle(event?: Event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    // IMMER Dropdown resetten - egal ob öffnen oder schließen
    this.servicesDropdownOpen = false;
    
    // Dann toggle das Menu
    this.open = !this.open;
    this.doc.body.style.overflow = this.open ? 'hidden' : '';
    this.doc.body.style.touchAction = this.open ? 'none' : '';
  }

  // Safari Touch Fix: Event explizit behandeln
  routeTo(route: string, event?: Event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.router.navigate([route]);
    this.open = false;
    this.servicesDropdownOpen = false;
    this.doc.body.style.overflow = '';
    this.doc.body.style.touchAction = '';
  }

  // GEÄNDERT!
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

      this.open = false;
      this.doc.body.style.overflow = '';
      this.doc.body.style.touchAction = '';
    }
  }

  getRoleBadgeClass(): string {
    return this.user?.role === UserRole.ADMIN ? 'badge--admin' : 'badge--user';
  }

  getRoleLabel(): string {
    return this.user?.role === UserRole.ADMIN ? 'Admin' : 'User';
  }

  isAdmin(): boolean {
    return this.user?.role === UserRole.ADMIN;
  }

  isInAdminArea(): boolean {
    return this.router.url.startsWith('/admin');
  }
}