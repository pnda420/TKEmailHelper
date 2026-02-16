import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { trigger, transition, style, animate, stagger, query } from '@angular/animations';
import { ApiService, Email, Mailbox } from '../../api/api.service';
import { ToastService } from '../../shared/toasts/toast.service';
import { AttachmentPreviewComponent, AttachmentInfo } from '../../shared/attachment-preview/attachment-preview.component';
import { ConfigService } from '../../services/config.service';
import { IdenticonPipe } from '../../shared/identicon.pipe';

type HistoryTab = 'sent' | 'trash';

@Component({
  selector: 'app-email-history',
  standalone: true,
  imports: [CommonModule, RouterModule, AttachmentPreviewComponent, IdenticonPipe],
  templateUrl: './email-history.component.html',
  styleUrls: ['./email-history.component.scss'],
  animations: [
    trigger('listAnimation', [
      transition('* => *', [
        query(':enter', [
          style({ opacity: 0, transform: 'translateY(8px)' }),
          stagger(30, [
            animate('180ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
          ])
        ], { optional: true })
      ])
    ]),
    trigger('fadeSlide', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(16px)' }),
        animate('180ms ease-out', style({ opacity: 1, transform: 'translateX(0)' }))
      ]),
      transition(':leave', [
        animate('120ms ease-in', style({ opacity: 0, transform: 'translateX(-8px)' }))
      ])
    ])
  ]
})
export class EmailHistoryComponent implements OnInit, OnDestroy {
  activeTab: HistoryTab = 'sent';
  emails: Email[] = [];
  totalEmails = 0;
  loading = false;
  loadingDetail = false;
  selectedEmail: Email | null = null;

  // Mailbox map
  mailboxMap = new Map<string, Mailbox>();

  // Conversation thread
  threadEmails: Email[] = [];
  threadLoading = false;

  // Attachment Preview
  attachmentPreviewOpen = false;
  selectedAttachment: AttachmentInfo | null = null;
  currentAttachments: AttachmentInfo[] = [];

  private limit = 50;
  private offset = 0;
  private sub?: Subscription;
  private detailSub?: Subscription;

  constructor(
    private api: ApiService,
    private toasts: ToastService,
    private configService: ConfigService,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    this.loadEmails();
    this.loadMailboxes();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.detailSub?.unsubscribe();
  }

  switchTab(tab: HistoryTab): void {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    this.selectedEmail = null;
    this.emails = [];
    this.offset = 0;
    this.loadEmails();
  }

  loadEmails(): void {
    this.loading = true;
    const obs = this.activeTab === 'sent'
      ? this.api.getSentEmails(this.limit, this.offset)
      : this.api.getTrashedEmails(this.limit, this.offset);

    this.sub = obs.subscribe({
      next: (res) => {
        this.emails = res.emails;
        this.totalEmails = res.total;
        this.loading = false;
      },
      error: () => {
        this.toasts.error(this.activeTab === 'sent'
          ? 'Gesendete E-Mails konnten nicht geladen werden'
          : 'Papierkorb konnte nicht geladen werden');
        this.loading = false;
      }
    });
  }

  selectEmail(email: Email): void {
    this.selectedEmail = email;
    this.currentAttachments = email.attachments?.length ? this.getAttachmentInfos(email) : [];
    this.threadEmails = [];

    // Fetch full email data (list API excludes heavy fields like replySentBody, htmlBody, textBody)
    this.loadingDetail = true;
    this.detailSub?.unsubscribe();
    this.detailSub = this.api.getEmailById(email.id).subscribe({
      next: (fullEmail) => {
        this.selectedEmail = fullEmail;
        this.currentAttachments = fullEmail.attachments?.length ? this.getAttachmentInfos(fullEmail) : [];
        this.loadingDetail = false;
        // Auto-load conversation thread
        this.loadThread(fullEmail.id);
      },
      error: () => {
        this.loadingDetail = false;
      }
    });
  }

  private loadThread(emailId: string): void {
    this.threadLoading = true;
    this.api.getEmailThread(emailId).subscribe({
      next: (res) => {
        this.threadEmails = res.thread;
        this.threadLoading = false;
      },
      error: () => {
        this.threadEmails = [];
        this.threadLoading = false;
      }
    });
  }

  closeDetail(): void {
    this.selectedEmail = null;
    this.currentAttachments = [];
    this.threadEmails = [];
  }

  getAttachmentInfos(email: Email): AttachmentInfo[] {
    if (!email.attachments) return [];
    return email.attachments.map((att, index) => ({
      filename: att.filename,
      contentType: att.contentType,
      size: att.size,
      emailId: email.id,
      index,
      url: `${this.configService.apiUrl}/emails/${email.id}/attachments/${index}`
    }));
  }

  openAttachmentPreview(att: { filename: string; contentType: string; size: number }, index: number): void {
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
    const headers = new HttpHeaders({ 'Authorization': token ? `Bearer ${token}` : '' });

    this.http.get(attachment.url, { headers, responseType: 'blob' }).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = attachment.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      },
      error: () => this.toasts.error('Download fehlgeschlagen')
    });
  }

  restoreEmail(email: Email, event?: Event): void {
    event?.stopPropagation();
    this.api.restoreEmailFromTrash(email.id).subscribe({
      next: () => {
        this.toasts.success('E-Mail wiederhergestellt');
        this.emails = this.emails.filter(e => e.id !== email.id);
        this.totalEmails--;
        if (this.selectedEmail?.id === email.id) this.selectedEmail = null;
      },
      error: () => this.toasts.error('Fehler beim Wiederherstellen')
    });
  }

  loadMore(): void {
    this.offset += this.limit;
    const obs = this.activeTab === 'sent'
      ? this.api.getSentEmails(this.limit, this.offset)
      : this.api.getTrashedEmails(this.limit, this.offset);

    obs.subscribe({
      next: (res) => { this.emails = [...this.emails, ...res.emails]; },
      error: () => {}
    });
  }

  get hasMore(): boolean {
    return this.emails.length < this.totalEmails;
  }

  // ===== Helpers =====

  getFileIcon(contentType: string): string {
    const t = contentType?.toLowerCase() || '';
    if (t.startsWith('image/')) return 'image';
    if (t === 'application/pdf') return 'picture_as_pdf';
    if (t.includes('word') || t.includes('document')) return 'description';
    if (t.includes('excel') || t.includes('spreadsheet')) return 'table_chart';
    if (t.includes('zip') || t.includes('archive')) return 'folder_zip';
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
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }

  formatFullDate(date: Date | string): string {
    return new Date(date).toLocaleDateString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  getSenderName(email: Email): string {
    return email.fromName || email.fromAddress;
  }

  getSenderInitials(email: Email): string {
    const name = this.activeTab === 'sent' ? (email.fromAddress || '?') : (email.fromName || email.fromAddress || '?');
    const parts = name.split(/[\s@]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  }

  /** Get the best available body text for the original email */
  getOriginalBody(email: Email): string {
    return email.textBody || email.preview || email.cleanedBody || '';
  }

  /** Get the best available body text for the reply */
  getReplyBody(email: Email): string {
    return email.replySentBody || '';
  }

  /** Get the best available snippet for the list view */
  getListSnippet(email: Email): string {
    if (this.activeTab === 'sent') {
      return email.aiSummary || email.cleanedBody || email.preview || '';
    }
    return email.preview || email.cleanedBody || '';
  }

  /** Get display name for "to" addresses */
  getToDisplay(email: Email): string {
    return email.toAddresses?.join(', ') || email.fromAddress || '';
  }

  // ===== Mailbox helpers =====

  private loadMailboxes(): void {
    this.api.getMyMailboxes().subscribe({
      next: (userMailboxes) => {
        this.mailboxMap.clear();
        userMailboxes.forEach(um => {
          if (um.mailbox) {
            this.mailboxMap.set(um.mailbox.id, um.mailbox as any);
          }
        });
      },
      error: (err) => console.error('Failed to load mailboxes:', err)
    });
  }

  getMailboxName(mailboxId: string): string {
    return this.mailboxMap.get(mailboxId)?.name || '';
  }

  getMailboxColor(mailboxId: string): string {
    return this.mailboxMap.get(mailboxId)?.color || '#1565c0';
  }
}
