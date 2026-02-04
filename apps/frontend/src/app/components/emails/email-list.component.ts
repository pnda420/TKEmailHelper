import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { trigger, transition, style, animate, stagger, query } from '@angular/animations';
import { ApiService, Email } from '../../api/api.service';
import { ToastService } from '../../shared/toasts/toast.service';
import { PageTitleComponent } from '../../shared/page-title/page-title.component';

@Component({
  selector: 'app-email-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, PageTitleComponent],
  templateUrl: './email-list.component.html',
  styleUrl: './email-list.component.scss',
  animations: [
    trigger('listAnimation', [
      transition('* => *', [
        query(':enter', [
          style({ opacity: 0, transform: 'translateY(10px)' }),
          stagger(30, [
            animate('200ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
          ])
        ], { optional: true })
      ])
    ]),
    trigger('slideIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(20px)' }),
        animate('200ms ease-out', style({ opacity: 1, transform: 'translateX(0)' }))
      ]),
      transition(':leave', [
        animate('150ms ease-in', style({ opacity: 0 }))
      ])
    ])
  ]
})
export class EmailListComponent implements OnInit, OnDestroy {
  emails: Email[] = [];
  totalEmails = 0;
  loading = false;
  refreshing = false;
  selectedEmail: Email | null = null;
  
  private limit = 50;
  private offset = 0;
  private sub?: Subscription;

  constructor(
    private api: ApiService,
    private toasts: ToastService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadEmails();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  loadEmails(): void {
    this.loading = true;
    this.sub = this.api.getEmails(this.limit, this.offset).subscribe({
      next: (res) => {
        this.emails = res.emails;
        this.totalEmails = res.total;
        this.loading = false;
      },
      error: (err) => {
        console.error('Fehler beim Laden der E-Mails:', err);
        this.toasts.error('E-Mails konnten nicht geladen werden');
        this.loading = false;
      }
    });
  }

  refreshEmails(): void {
    this.refreshing = true;
    this.api.refreshEmails().subscribe({
      next: (res) => {
        this.toasts.success(`${res.stored} neue E-Mails abgerufen`);
        this.refreshing = false;
        this.loadEmails();
      },
      error: (err) => {
        console.error('Fehler beim Aktualisieren:', err);
        this.toasts.error('E-Mails konnten nicht aktualisiert werden');
        this.refreshing = false;
      }
    });
  }

  selectEmail(email: Email): void {
    this.selectedEmail = email;
    
    // Mark as read if not already
    if (!email.isRead) {
      this.api.markEmailAsRead(email.id).subscribe({
        next: (updated) => {
          const idx = this.emails.findIndex(e => e.id === email.id);
          if (idx !== -1) {
            this.emails[idx] = updated;
          }
          this.selectedEmail = updated;
        },
        error: (err) => console.error('Fehler beim Markieren:', err)
      });
    }
  }

  closeDetail(): void {
    this.selectedEmail = null;
  }

  // Navigate to reply page
  openReplyPage(): void {
    if (!this.selectedEmail) return;
    this.router.navigate(['/emails', this.selectedEmail.id, 'reply']);
  }

  // Move to trash (no reply needed)
  moveToTrash(): void {
    if (!this.selectedEmail) return;

    this.api.moveEmailToTrash(this.selectedEmail.id).subscribe({
      next: () => {
        this.toasts.success('E-Mail in Papierkorb verschoben');
        this.emails = this.emails.filter(e => e.id !== this.selectedEmail?.id);
        this.totalEmails--;
        this.selectedEmail = null;
      },
      error: (err) => {
        console.error('Fehler:', err);
        this.toasts.error('Fehler beim Verschieben');
      }
    });
  }

  formatDate(date: Date | string): string {
    const d = new Date(date);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    
    if (isToday) {
      return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    }
    
    return d.toLocaleDateString('de-DE', { 
      day: '2-digit', 
      month: '2-digit',
      year: '2-digit'
    });
  }

  getSenderName(email: Email): string {
    return email.fromName || email.fromAddress;
  }

  loadMore(): void {
    this.offset += this.limit;
    this.api.getEmails(this.limit, this.offset).subscribe({
      next: (res) => {
        this.emails = [...this.emails, ...res.emails];
      },
      error: (err) => {
        console.error('Fehler beim Laden:', err);
      }
    });
  }

  get hasMore(): boolean {
    return this.emails.length < this.totalEmails;
  }
}
