import { Component, EventEmitter, Input, Output, OnChanges, SimpleChanges, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { trigger, transition, style, animate } from '@angular/animations';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

export interface AttachmentInfo {
  filename: string;
  contentType: string;
  size: number;
  url?: string; // URL to fetch attachment content
  emailId?: string; // For fetching from backend
  index?: number; // Attachment index in email
}

@Component({
  selector: 'app-attachment-preview',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './attachment-preview.component.html',
  styleUrl: './attachment-preview.component.scss',
  animations: [
    trigger('modalAnimation', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('200ms ease-out', style({ opacity: 1 }))
      ]),
      transition(':leave', [
        animate('150ms ease-in', style({ opacity: 0 }))
      ])
    ]),
    trigger('contentAnimation', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.95) translateY(20px)' }),
        animate('250ms ease-out', style({ opacity: 1, transform: 'scale(1) translateY(0)' }))
      ]),
      transition(':leave', [
        animate('150ms ease-in', style({ opacity: 0, transform: 'scale(0.95)' }))
      ])
    ])
  ]
})
export class AttachmentPreviewComponent implements OnChanges, OnDestroy {
  @Input() attachment: AttachmentInfo | null = null;
  @Input() attachments: AttachmentInfo[] = []; // For navigation
  @Input() isOpen = false;
  @Output() close = new EventEmitter<void>();
  @Output() download = new EventEmitter<AttachmentInfo>();

  currentIndex = 0;
  loading = false;
  error = false;
  previewUrl: SafeResourceUrl | string | null = null;
  private blobUrl: string | null = null; // Keep track for cleanup

  constructor(
    private sanitizer: DomSanitizer,
    private http: HttpClient
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['attachment'] && this.attachment) {
      this.currentIndex = this.attachments.findIndex(
        a => a.filename === this.attachment?.filename
      );
      if (this.currentIndex === -1) this.currentIndex = 0;
      this.loadPreview();
    }
    if (changes['isOpen'] && !this.isOpen) {
      this.cleanupBlobUrl();
      this.previewUrl = null;
      this.error = false;
    }
  }

  ngOnDestroy(): void {
    this.cleanupBlobUrl();
  }

  private cleanupBlobUrl(): void {
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = null;
    }
  }

  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('auth_token');
    return new HttpHeaders({
      'Authorization': token ? `Bearer ${token}` : ''
    });
  }

  loadPreview(): void {
    if (!this.attachment) return;

    this.loading = true;
    this.error = false;
    this.cleanupBlobUrl();

    const url = this.attachment.url;
    if (!url) {
      this.loading = false;
      this.error = true;
      return;
    }

    // Fetch with auth token
    this.http.get(url, {
      headers: this.getAuthHeaders(),
      responseType: 'blob'
    }).subscribe({
      next: (blob) => {
        this.blobUrl = URL.createObjectURL(blob);
        
        if (this.isImage) {
          this.previewUrl = this.blobUrl;
        } else if (this.isPdf) {
          this.previewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.blobUrl);
        } else {
          this.previewUrl = this.blobUrl;
        }
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load attachment:', err);
        this.loading = false;
        this.error = true;
      }
    });
  }

  get isImage(): boolean {
    const type = this.attachment?.contentType?.toLowerCase() || '';
    return type.startsWith('image/');
  }

  get isPdf(): boolean {
    const type = this.attachment?.contentType?.toLowerCase() || '';
    return type === 'application/pdf';
  }

  get isPreviewable(): boolean {
    return this.isImage || this.isPdf;
  }

  get fileIcon(): string {
    const type = this.attachment?.contentType?.toLowerCase() || '';
    
    if (type.startsWith('image/')) return 'image';
    if (type === 'application/pdf') return 'picture_as_pdf';
    if (type.includes('word') || type.includes('document')) return 'description';
    if (type.includes('excel') || type.includes('spreadsheet')) return 'table_chart';
    if (type.includes('powerpoint') || type.includes('presentation')) return 'slideshow';
    if (type.includes('zip') || type.includes('archive') || type.includes('compressed')) return 'folder_zip';
    if (type.includes('audio')) return 'audio_file';
    if (type.includes('video')) return 'video_file';
    if (type.includes('text')) return 'article';
    
    return 'attach_file';
  }

  get formattedSize(): string {
    const size = this.attachment?.size || 0;
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  get canNavigate(): boolean {
    return this.attachments.length > 1;
  }

  get hasPrevious(): boolean {
    return this.currentIndex > 0;
  }

  get hasNext(): boolean {
    return this.currentIndex < this.attachments.length - 1;
  }

  navigatePrevious(): void {
    if (this.hasPrevious) {
      this.currentIndex--;
      this.attachment = this.attachments[this.currentIndex];
      this.loadPreview();
    }
  }

  navigateNext(): void {
    if (this.hasNext) {
      this.currentIndex++;
      this.attachment = this.attachments[this.currentIndex];
      this.loadPreview();
    }
  }

  onClose(): void {
    this.close.emit();
  }

  onDownload(): void {
    if (this.attachment) {
      this.download.emit(this.attachment);
    }
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.onClose();
    }
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.onClose();
    } else if (event.key === 'ArrowLeft') {
      this.navigatePrevious();
    } else if (event.key === 'ArrowRight') {
      this.navigateNext();
    }
  }

  onImageLoad(): void {
    this.loading = false;
  }

  onImageError(): void {
    this.loading = false;
    this.error = true;
  }
}
