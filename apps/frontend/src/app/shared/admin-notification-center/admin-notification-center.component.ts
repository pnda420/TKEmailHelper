import { Component, OnInit, OnDestroy, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Subject, forkJoin, interval, of, merge } from 'rxjs';
import { takeUntil, startWith, switchMap, tap, catchError } from 'rxjs/operators';
import { ApiService, ContactRequest, Booking, BookingStatus } from '../../api/api.service';
import { IconComponent } from '../icon/icon.component';
import { NotificationRefreshService } from './notification-refresh.service';

@Component({
  selector: 'app-admin-notification-center',
  standalone: true,
  imports: [CommonModule, RouterModule, IconComponent],
  templateUrl: './admin-notification-center.component.html',
  styleUrls: ['./admin-notification-center.component.scss']
})
export class AdminNotificationCenterComponent implements OnInit, OnDestroy {
  isOpen = false;
  loading = false;
  
  unprocessedContacts: ContactRequest[] = [];
  pendingBookings: Booking[] = [];
  
  private destroy$ = new Subject<void>();
  private refreshInterval = 60000; // 1 Minute

  constructor(
    private api: ApiService,
    private elementRef: ElementRef,
    private notificationRefresh: NotificationRefreshService
  ) {}

  ngOnInit() {
    // Initial load + periodic refresh + event-triggered refresh
    merge(
      interval(this.refreshInterval).pipe(startWith(0)),
      this.notificationRefresh.onRefreshNeeded$
    )
      .pipe(
        takeUntil(this.destroy$),
        switchMap(() => this.loadNotifications())
      )
      .subscribe();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('document:click', ['$event'])
  onClickOutside(event: Event) {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.isOpen = false;
    }
  }

  @HostListener('document:keydown.escape')
  onEscapeKey() {
    this.isOpen = false;
  }

  toggle() {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.refresh();
    }
  }

  refresh() {
    this.loading = true;
    this.loadNotifications().subscribe({
      next: () => this.loading = false,
      error: () => this.loading = false
    });
  }

  close() {
    this.isOpen = false;
  }

  private loadNotifications() {
    return forkJoin({
      contacts: this.api.getUnprocessedContactRequests().pipe(catchError(() => of([]))),
      bookings: this.api.getAllBookings().pipe(catchError(() => of([])))
    }).pipe(
      tap(({ contacts, bookings }) => {
        this.unprocessedContacts = contacts;
        this.pendingBookings = bookings.filter(b => b.status === BookingStatus.PENDING);
      }),
      takeUntil(this.destroy$)
    );
  }

  get totalCount(): number {
    return this.unprocessedContacts.length + this.pendingBookings.length;
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
}
