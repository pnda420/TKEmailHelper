import { CommonModule, DOCUMENT } from '@angular/common';
import { Component, Inject, OnInit, OnDestroy, HostListener } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { AuthService, User, UserRole } from '../../services/auth.service';
import { ToastService } from '../toasts/toast.service';
import { ConfirmationService } from '../confirmation/confirmation.service';
import { ApiService, ServiceCategory, SystemStatus, UserMailbox, Mailbox } from '../../api/api.service';
import { Subscription } from 'rxjs';
import { MailboxStateService } from '../../services/mailbox-state.service';

interface NavCategory {
  id: string;
  name: string;
  icon: string;
}

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterModule, CommonModule],
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

  // Connection Status
  connectionStatus: SystemStatus | null = null;
  connectionPopupOpen = false;
  private connectionInterval?: any;

  // Mailbox Selector
  myMailboxes: UserMailbox[] = [];
  mailboxDropdownOpen = false;

  constructor(
    @Inject(DOCUMENT) private doc: Document,
    public router: Router,
    private authService: AuthService,
    private toasts: ToastService,
    private confirmationService: ConfirmationService,
    private api: ApiService,
    private mailboxState: MailboxStateService
  ) { }

  ngOnInit(): void {
    this.authService.currentUser$.subscribe(user => {
      this.user = user;
      if (user) {
        this.loadConnectionStatus();
        this.loadMyMailboxes();
        // Poll every 30s while logged in
        this.connectionInterval = setInterval(() => this.loadConnectionStatus(), 30_000);
      } else {
        this.connectionStatus = null;
        this.myMailboxes = [];
        if (this.connectionInterval) {
          clearInterval(this.connectionInterval);
          this.connectionInterval = undefined;
        }
      }
    });
    
    
    // Reset dropdown on EVERY route change
    this.routerSub = this.router.events.subscribe(() => {
      this.servicesDropdownOpen = false;
      this.connectionPopupOpen = false;
      this.mailboxDropdownOpen = false;
      this.open = false;
      this.doc.body.style.overflow = '';
      this.doc.body.style.touchAction = '';
    });
  }

  ngOnDestroy(): void {
    this.categoriesSub?.unsubscribe();
    this.routerSub?.unsubscribe();
    if (this.connectionInterval) {
      clearInterval(this.connectionInterval);
    }
  }

  // ── Connection Status ──

  private loadConnectionStatus(): void {
    this.api.getSystemStatus().subscribe({
      next: (status) => this.connectionStatus = status,
      error: () => this.connectionStatus = null,
    });
  }

  get connectionDotClass(): string {
    if (!this.connectionStatus) return 'unknown';
    const { vpn, postgres, mssql, imap } = this.connectionStatus;
    if (vpn && postgres && mssql && imap) return 'all-ok';
    if (postgres) return 'partial'; // At least app DB is fine
    return 'down';
  }

  get connectionLabel(): string {
    if (!this.connectionStatus) return 'Status unbekannt';
    const { vpn, postgres, mssql, imap } = this.connectionStatus;
    if (vpn && postgres && mssql && imap) return 'Alle Systeme online';
    if (postgres && !vpn) return 'VPN getrennt';
    if (postgres && !mssql) return 'WaWi getrennt';
    if (postgres && !imap) return 'IMAP getrennt';
    return 'Verbindungsprobleme';
  }

  toggleConnectionPopup(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.connectionPopupOpen = !this.connectionPopupOpen;
    this.servicesDropdownOpen = false;
  }

  refreshConnectionStatus(event: Event): void {
    event.stopPropagation();
    this.loadConnectionStatus();
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
    // Connection Popup schließen
    if (!target.closest('.connection-status-container')) {
      this.connectionPopupOpen = false;
    }
    // Mailbox Dropdown schließen
    if (!target.closest('.mailbox-selector-container')) {
      this.mailboxDropdownOpen = false;
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

  // ── Mailbox Selector ──

  private loadMyMailboxes(): void {
    this.api.getMyMailboxes().subscribe({
      next: (mailboxes) => this.myMailboxes = mailboxes,
      error: () => this.myMailboxes = [],
    });
  }

  toggleMailboxDropdown(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.mailboxDropdownOpen = !this.mailboxDropdownOpen;
    this.connectionPopupOpen = false;
    this.servicesDropdownOpen = false;
  }

  toggleMailboxActive(um: UserMailbox, event: Event): void {
    event.stopPropagation();
    const newActive = !um.isActive;
    // Compute new active mailbox IDs
    const activeIds = this.myMailboxes
      .filter(m => m.mailboxId === um.mailboxId ? newActive : m.isActive)
      .map(m => m.mailboxId);

    this.api.setActiveMailboxes(activeIds).subscribe({
      next: () => {
        this.myMailboxes = this.myMailboxes.map(m => ({
          ...m,
          isActive: activeIds.includes(m.mailboxId),
        }));
        this.mailboxState.notifyMailboxChanged();
      },
      error: () => {},
    });
  }

  get activeMailboxCount(): number {
    return this.myMailboxes.filter(m => m.isActive).length;
  }

  get hasMultipleMailboxes(): boolean {
    return this.myMailboxes.length > 1;
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