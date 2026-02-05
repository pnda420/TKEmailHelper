import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { trigger, transition, style, animate, stagger, query } from '@angular/animations';
import { ApiService, Email } from '../../api/api.service';
import { ToastService } from '../../shared/toasts/toast.service';
import { PageTitleComponent } from '../../shared/page-title/page-title.component';
import { AttachmentPreviewComponent, AttachmentInfo } from '../../shared/attachment-preview/attachment-preview.component';
import { ConfigService } from '../../services/config.service';

@Component({
  selector: 'app-sent-history',
  standalone: true,
  imports: [CommonModule, RouterModule, PageTitleComponent, AttachmentPreviewComponent],
  templateUrl: './sent-history.component.html',
  styleUrl: './sent-history.component.scss',
  animations: [
    trigger('listAnimation', [
      transition('* => *', [
        query(':enter', [
          style({ opacity: 0, transform: 'translateY(10px)' }),
          stagger(50, [
            animate('200ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
          ])
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
export class SentHistoryComponent implements OnInit, OnDestroy {
  emails: Email[] = [];
  totalEmails = 0;
  loading = false;
  selectedEmail: Email | null = null;
  
  // Attachment Preview
  attachmentPreviewOpen = false;
  selectedAttachment: AttachmentInfo | null = null;
  currentAttachments: AttachmentInfo[] = [];
  
  private limit = 50;
  private offset = 0;
  private sub?: Subscription;

  constructor(
    private api: ApiService,
    private toasts: ToastService,
    private configService: ConfigService,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    this.loadEmails();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  loadEmails(): void {
    this.loading = true;
    this.sub = this.api.getSentEmails(this.limit, this.offset).subscribe({
      next: (res) => {
        this.emails = res.emails;
        this.totalEmails = res.total;
        this.loading = false;
      },
      error: (err) => {
        console.error('Fehler beim Laden:', err);
        this.toasts.error('Gesendete E-Mails konnten nicht geladen werden');
        this.loading = false;
      }
    });
  }

  selectEmail(email: Email): void {
    this.selectedEmail = email;
    if (email.attachments?.length) {
      this.currentAttachments = this.getAttachmentInfos(email);
    } else {
      this.currentAttachments = [];
    }
  }

  closeDetail(): void {
    this.selectedEmail = null;
    this.currentAttachments = [];
  }

  // ==================== ATTACHMENT METHODS ====================

  getAttachmentInfos(email: Email): AttachmentInfo[] {
    if (!email.attachments) return [];
    
    return email.attachments.map((att, index) => ({
      filename: att.filename,
      contentType: att.contentType,
      size: att.size,
      emailId: email.id,
      index: index,
      url: `${this.configService.apiUrl}/emails/${email.id}/attachments/${index}`
    }));
  }

  openAttachmentPreview(attachment: { filename: string; contentType: string; size: number }, index: number): void {
    if (!this.selectedEmail) return;
    this.selectedAttachment = this.currentAttachments[index];
    this.attachmentPreviewOpen = true;
  }

  closeAttachmentPreview(): void {
    this.attachmentPreviewOpen = false;
    this.selectedAttachment = null;
  }

  downloadAttachment(attachment: AttachmentInfo): void {
    if (!attachment.url) return;
    
    const token = localStorage.getItem('auth_token');
    const headers = new HttpHeaders({
      'Authorization': token ? `Bearer ${token}` : ''
    });

    this.http.get(attachment.url, {
      headers,
      responseType: 'blob'
    }).subscribe({
      next: (blob) => {
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = attachment.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
      },
      error: (err) => {
        console.error('Download failed:', err);
        this.toasts.error('Download fehlgeschlagen');
      }
    });
  }

  getFileIcon(contentType: string): string {
    const type = contentType?.toLowerCase() || '';
    if (type.startsWith('image/')) return 'image';
    if (type === 'application/pdf') return 'picture_as_pdf';
    if (type.includes('word') || type.includes('document')) return 'description';
    if (type.includes('excel') || type.includes('spreadsheet')) return 'table_chart';
    if (type.includes('zip') || type.includes('archive')) return 'folder_zip';
    return 'attach_file';
  }

  formatFileSize(size: number): string {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
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
    this.api.getSentEmails(this.limit, this.offset).subscribe({
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
