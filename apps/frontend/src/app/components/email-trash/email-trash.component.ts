import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { trigger, transition, style, animate, stagger, query } from '@angular/animations';
import { ApiService, Email } from '../../api/api.service';
import { ToastService } from '../../shared/toasts/toast.service';
import { PageTitleComponent } from '../../shared/page-title/page-title.component';

@Component({
  selector: 'app-email-trash',
  standalone: true,
  imports: [CommonModule, RouterModule, PageTitleComponent],
  templateUrl: './email-trash.component.html',
  styleUrl: './email-trash.component.scss',
  animations: [
    trigger('listAnimation', [
      transition('* => *', [
        query(':enter', [
          style({ opacity: 0, transform: 'translateY(10px)' }),
          stagger(50, [
            animate('200ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
          ])
        ], { optional: true }),
        query(':leave', [
          animate('150ms ease-in', style({ opacity: 0, transform: 'translateX(-20px)' }))
        ], { optional: true })
      ])
    ]),
    trigger('fadeSlide', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(20px)' }),
        animate('200ms ease-out', style({ opacity: 1, transform: 'translateX(0)' }))
      ]),
      transition(':leave', [
        animate('150ms ease-in', style({ opacity: 0, transform: 'translateX(-10px)' }))
      ])
    ])
  ]
})
export class EmailTrashComponent implements OnInit, OnDestroy {
  emails: Email[] = [];
  totalEmails = 0;
  loading = false;
  selectedEmail: Email | null = null;
  
  private limit = 50;
  private offset = 0;
  private sub?: Subscription;

  constructor(
    private api: ApiService,
    private toasts: ToastService
  ) {}

  ngOnInit(): void {
    this.loadEmails();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  loadEmails(): void {
    this.loading = true;
    this.sub = this.api.getTrashedEmails(this.limit, this.offset).subscribe({
      next: (res) => {
        this.emails = res.emails;
        this.totalEmails = res.total;
        this.loading = false;
      },
      error: (err) => {
        console.error('Fehler beim Laden:', err);
        this.toasts.error('Papierkorb konnte nicht geladen werden');
        this.loading = false;
      }
    });
  }

  selectEmail(email: Email): void {
    this.selectedEmail = email;
  }

  closeDetail(): void {
    this.selectedEmail = null;
  }

  restoreEmail(email: Email): void {
    this.api.restoreEmailFromTrash(email.id).subscribe({
      next: () => {
        this.toasts.success('E-Mail wurde wiederhergestellt');
        this.emails = this.emails.filter(e => e.id !== email.id);
        this.totalEmails--;
        if (this.selectedEmail?.id === email.id) {
          this.selectedEmail = null;
        }
      },
      error: (err) => {
        console.error('Fehler:', err);
        this.toasts.error('Fehler beim Wiederherstellen');
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

  formatFullDate(date: Date | string): string {
    const d = new Date(date);
    return d.toLocaleDateString('de-DE', { 
      day: '2-digit', 
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getSenderName(email: Email): string {
    return email.fromName || email.fromAddress;
  }

  loadMore(): void {
    this.offset += this.limit;
    this.api.getTrashedEmails(this.limit, this.offset).subscribe({
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
