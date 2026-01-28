import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { forkJoin, Subject, of } from 'rxjs';
import { takeUntil, catchError } from 'rxjs/operators';
import { AdminLayoutComponent } from '../admin-layout/admin-layout.component';
import { IconComponent } from '../../../shared/icon/icon.component';
import { ApiService, ContactRequest, Booking, BookingStatus, Settings } from '../../../api/api.service';

interface DashboardCard {
  title: string;
  value: number | string;
  subtitle: string;
  icon: string;
  route: string;
  color: 'primary' | 'success' | 'warning' | 'danger' | 'info';
  trend?: { value: number; label: string };
}

interface QuickAction {
  label: string;
  icon: string;
  route: string;
  description: string;
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, AdminLayoutComponent, IconComponent],
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.scss']
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading = true;
  error = '';
  currentTime = new Date();
  private timeInterval: any;

  // Stats
  unprocessedContacts: ContactRequest[] = [];
  pendingBookings: Booking[] = [];
  allBookings: Booking[] = [];
  settings: Settings | null = null;

  // Dashboard cards
  cards: DashboardCard[] = [];

  // Quick actions
  quickActions: QuickAction[] = [
    { label: 'Neue Anfragen', icon: 'mail', route: '/admin/requests', description: 'Kontaktanfragen bearbeiten' },
    { label: 'Buchungen', icon: 'calendar_today', route: '/admin/booking', description: 'Termine verwalten' },
    { label: 'Newsletter', icon: 'newspaper', route: '/admin/newsletter', description: 'Abonnenten verwalten' },
    { label: 'FAQ verwalten', icon: 'quiz', route: '/admin/faq', description: 'Häufige Fragen bearbeiten' },
    { label: 'Services', icon: 'build', route: '/admin/services', description: 'Dienstleistungen pflegen' },
    { label: 'Rechnungen', icon: 'receipt_long', route: '/admin/invoices', description: 'Rechnungen erstellen' },
    { label: 'Benutzer', icon: 'group', route: '/admin/users', description: 'Nutzer verwalten' },
    { label: 'Einstellungen', icon: 'settings', route: '/admin/settings', description: 'System konfigurieren' }
  ];

  // Recent activity
  recentContacts: ContactRequest[] = [];
  recentBookings: Booking[] = [];

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.loadDashboardData();
    
    // Update time every minute
    this.timeInterval = setInterval(() => {
      this.currentTime = new Date();
    }, 60000);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.timeInterval) {
      clearInterval(this.timeInterval);
    }
  }

  loadDashboardData(): void {
    this.loading = true;
    this.error = '';

    forkJoin({
      contacts: this.api.getUnprocessedContactRequests().pipe(catchError(() => of([]))),
      allContacts: this.api.getAllContactRequests().pipe(catchError(() => of([]))),
      bookings: this.api.getAllBookings().pipe(catchError(() => of([]))),
      settings: this.api.getSettings().pipe(catchError(() => of(null)))
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ contacts, allContacts, bookings, settings }) => {
          this.unprocessedContacts = contacts;
          this.allBookings = bookings;
          this.pendingBookings = bookings.filter(b => b.status === BookingStatus.PENDING);
          this.settings = settings;

          // Recent items (last 5)
          this.recentContacts = contacts.slice(0, 5);
          this.recentBookings = this.pendingBookings.slice(0, 5);

          this.buildCards(allContacts);
          this.loading = false;
        },
        error: (err) => {
          console.error('Dashboard load error:', err);
          this.error = 'Fehler beim Laden der Dashboard-Daten';
          this.loading = false;
        }
      });
  }

  private buildCards(allContacts: ContactRequest[]): void {
    const confirmedBookings = this.allBookings.filter(b => b.status === BookingStatus.CONFIRMED);
    const todayBookings = this.allBookings.filter(b => {
      if (!b.slot?.date) return false;
      const bookingDate = new Date(b.slot.date);
      const today = new Date();
      return bookingDate.toDateString() === today.toDateString();
    });

    this.cards = [
      {
        title: 'Offene Anfragen',
        value: this.unprocessedContacts.length,
        subtitle: `von ${allContacts.length} gesamt`,
        icon: 'mail',
        route: '/admin/requests',
        color: this.unprocessedContacts.length > 0 ? 'warning' : 'success'
      },
      {
        title: 'Ausstehende Buchungen',
        value: this.pendingBookings.length,
        subtitle: `${confirmedBookings.length} bestätigt`,
        icon: 'pending_actions',
        route: '/admin/booking',
        color: this.pendingBookings.length > 0 ? 'warning' : 'success'
      },
      {
        title: 'Termine heute',
        value: todayBookings.length,
        subtitle: 'für heute geplant',
        icon: 'today',
        route: '/admin/booking',
        color: todayBookings.length > 0 ? 'info' : 'primary'
      },
      {
        title: 'System-Status',
        value: this.settings?.isUnderConstruction ? 'Wartung' : 'Online',
        subtitle: this.settings?.isUnderConstruction ? 'Wartungsmodus aktiv' : 'Alles funktioniert',
        icon: this.settings?.isUnderConstruction ? 'construction' : 'check_circle',
        route: '/admin/settings',
        color: this.settings?.isUnderConstruction ? 'danger' : 'success'
      }
    ];
  }

  getGreeting(): string {
    const hour = this.currentTime.getHours();
    if (hour < 12) return 'Guten Morgen';
    if (hour < 18) return 'Guten Tag';
    return 'Guten Abend';
  }

  formatTime(date: Date): string {
    return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }

  formatDate(date: Date): string {
    return date.toLocaleDateString('de-DE', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric' 
    });
  }

  getRelativeTime(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Gerade eben';
    if (diffMins < 60) return `vor ${diffMins} Min`;
    if (diffHours < 24) return `vor ${diffHours} Std`;
    if (diffDays === 1) return 'Gestern';
    if (diffDays < 7) return `vor ${diffDays} Tagen`;
    return d.toLocaleDateString('de-DE');
  }

  trackByRoute(_: number, item: QuickAction): string {
    return item.route;
  }

  trackById(_: number, item: ContactRequest | Booking): string {
    return item.id;
  }
}
