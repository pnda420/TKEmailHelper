import {
  Component, EventEmitter, Input, Output,
  OnChanges, SimpleChanges, OnDestroy,
  ElementRef, ViewChild, HostListener, NgZone
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { trigger, transition, style, animate } from '@angular/animations';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

export interface AttachmentInfo {
  filename: string;
  contentType: string;
  size: number;
  url?: string;
  emailId?: string;
  index?: number;
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
    ]),
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('300ms ease-out', style({ opacity: 1 }))
      ])
    ])
  ]
})
export class AttachmentPreviewComponent implements OnChanges, OnDestroy {
  @Input() attachment: AttachmentInfo | null = null;
  @Input() attachments: AttachmentInfo[] = [];
  @Input() isOpen = false;
  @Output() close = new EventEmitter<void>();
  @Output() download = new EventEmitter<AttachmentInfo>();

  @ViewChild('zoomContainer') zoomContainer!: ElementRef<HTMLDivElement>;

  currentIndex = 0;
  loading = false;
  error = false;
  previewUrl: SafeResourceUrl | string | null = null;
  textContent: string | null = null;
  private blobUrl: string | null = null;

  // Zoom & Pan state
  zoom = 1;
  panX = 0;
  panY = 0;
  isPanning = false;
  private panStartX = 0;
  private panStartY = 0;
  private panOriginX = 0;
  private panOriginY = 0;

  readonly MIN_ZOOM = 0.25;
  readonly MAX_ZOOM = 8;

  // Fullscreen
  isFullscreen = false;

  constructor(
    private sanitizer: DomSanitizer,
    private http: HttpClient,
    private zone: NgZone
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['attachment'] && this.attachment) {
      this.currentIndex = this.attachments.findIndex(
        a => a.filename === this.attachment?.filename
      );
      if (this.currentIndex === -1) this.currentIndex = 0;
      this.resetZoom();
      this.loadPreview();
    }
    if (changes['isOpen'] && !this.isOpen) {
      this.cleanupAll();
    }
  }

  ngOnDestroy(): void {
    this.cleanupAll();
  }

  private cleanupAll(): void {
    this.cleanupBlobUrl();
    this.previewUrl = null;
    this.textContent = null;
    this.error = false;
    this.resetZoom();
    this.isFullscreen = false;
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

  // ─── Preview Loading ─────────────────────────────────────────

  loadPreview(): void {
    if (!this.attachment) return;

    this.loading = true;
    this.error = false;
    this.textContent = null;
    this.previewUrl = null;
    this.cleanupBlobUrl();

    const url = this.attachment.url;
    if (!url) {
      this.loading = false;
      this.error = true;
      return;
    }

    this.http.get(url, {
      headers: this.getAuthHeaders(),
      responseType: 'blob'
    }).subscribe({
      next: (blob) => {
        this.blobUrl = URL.createObjectURL(blob);

        if (this.isText) {
          const reader = new FileReader();
          reader.onload = () => {
            this.zone.run(() => {
              this.textContent = reader.result as string;
              this.loading = false;
            });
          };
          reader.readAsText(blob);
        } else if (this.isImage) {
          this.previewUrl = this.blobUrl;
          // loading = false set on img onload; fallback timeout in case event never fires
          setTimeout(() => {
            if (this.loading) {
              this.zone.run(() => this.loading = false);
            }
          }, 10000);
        } else if (this.isPdf) {
          this.previewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.blobUrl);
          this.loading = false;
        } else if (this.isAudio || this.isVideo) {
          this.previewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.blobUrl);
          this.loading = false;
        } else {
          this.previewUrl = this.blobUrl;
          this.loading = false;
        }
      },
      error: (err) => {
        console.error('Failed to load attachment:', err);
        this.loading = false;
        this.error = true;
      }
    });
  }

  // ─── Type Detection ──────────────────────────────────────────

  get isImage(): boolean {
    return this.mimeType.startsWith('image/');
  }

  get isPdf(): boolean {
    return this.mimeType === 'application/pdf';
  }

  get isAudio(): boolean {
    return this.mimeType.startsWith('audio/');
  }

  get isVideo(): boolean {
    return this.mimeType.startsWith('video/');
  }

  get isText(): boolean {
    const t = this.mimeType;
    const name = (this.attachment?.filename || '').toLowerCase();
    if (t.startsWith('text/')) return true;
    if (['application/json', 'application/xml', 'application/javascript'].includes(t)) return true;
    const textExts = [
      '.json', '.xml', '.csv', '.md', '.yml', '.yaml', '.ini', '.cfg',
      '.log', '.sql', '.sh', '.bat', '.ps1', '.ts', '.js', '.jsx', '.tsx',
      '.py', '.rb', '.java', '.c', '.cpp', '.h', '.cs', '.go', '.rs',
      '.vue', '.svelte', '.env', '.toml', '.conf', '.properties'
    ];
    return textExts.some(ext => name.endsWith(ext));
  }

  get isPreviewable(): boolean {
    return this.isImage || this.isPdf || this.isAudio || this.isVideo || this.isText;
  }

  private get mimeType(): string {
    return (this.attachment?.contentType || '').toLowerCase();
  }

  get fileIcon(): string {
    const t = this.mimeType;
    if (t.startsWith('image/')) return 'image';
    if (t === 'application/pdf') return 'picture_as_pdf';
    if (t.includes('word') || t.includes('document')) return 'description';
    if (t.includes('excel') || t.includes('spreadsheet')) return 'table_chart';
    if (t.includes('powerpoint') || t.includes('presentation')) return 'slideshow';
    if (t.includes('zip') || t.includes('archive') || t.includes('compressed')) return 'folder_zip';
    if (t.startsWith('audio/')) return 'audio_file';
    if (t.startsWith('video/')) return 'video_file';
    if (this.isText) return 'article';
    return 'attach_file';
  }

  get fileExtension(): string {
    const name = this.attachment?.filename || '';
    const idx = name.lastIndexOf('.');
    return idx > 0 ? name.substring(idx + 1).toUpperCase() : '';
  }

  get formattedSize(): string {
    const size = this.attachment?.size || 0;
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  // ─── Navigation ──────────────────────────────────────────────

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
      this.resetZoom();
      this.loadPreview();
    }
  }

  navigateNext(): void {
    if (this.hasNext) {
      this.currentIndex++;
      this.attachment = this.attachments[this.currentIndex];
      this.resetZoom();
      this.loadPreview();
    }
  }

  // ─── Zoom & Pan ──────────────────────────────────────────────

  get zoomPercent(): number {
    return Math.round(this.zoom * 100);
  }

  get imageTransform(): string {
    return `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
  }

  resetZoom(): void {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.isPanning = false;
  }

  zoomIn(): void {
    this.setZoom(Math.min(this.zoom * 1.4, this.MAX_ZOOM));
  }

  zoomOut(): void {
    this.setZoom(Math.max(this.zoom / 1.4, this.MIN_ZOOM));
  }

  zoomToFit(): void {
    this.resetZoom();
  }

  private setZoom(newZoom: number): void {
    this.zoom = Math.round(newZoom * 100) / 100;
    if (this.zoom <= 1) {
      this.panX = 0;
      this.panY = 0;
    }
  }

  onWheel(event: WheelEvent): void {
    if (!this.isImage) return;
    event.preventDefault();
    event.stopPropagation();

    const delta = event.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(this.MIN_ZOOM, Math.min(this.zoom * delta, this.MAX_ZOOM));

    if (this.zoomContainer) {
      const rect = this.zoomContainer.nativeElement.getBoundingClientRect();
      const cx = event.clientX - rect.left - rect.width / 2;
      const cy = event.clientY - rect.top - rect.height / 2;
      const scale = newZoom / this.zoom;
      this.panX = cx - scale * (cx - this.panX);
      this.panY = cy - scale * (cy - this.panY);
    }

    this.zoom = newZoom;
  }

  onPanStart(event: MouseEvent): void {
    if (!this.isImage || this.zoom <= 1) return;
    event.preventDefault();
    this.isPanning = true;
    this.panStartX = event.clientX;
    this.panStartY = event.clientY;
    this.panOriginX = this.panX;
    this.panOriginY = this.panY;
  }

  @HostListener('document:mousemove', ['$event'])
  onPanMove(event: MouseEvent): void {
    if (!this.isPanning) return;
    this.panX = this.panOriginX + (event.clientX - this.panStartX);
    this.panY = this.panOriginY + (event.clientY - this.panStartY);
  }

  @HostListener('document:mouseup')
  onPanEnd(): void {
    this.isPanning = false;
  }

  onDoubleClick(event: MouseEvent): void {
    if (!this.isImage) return;
    if (this.zoom > 1) {
      this.resetZoom();
    } else {
      if (this.zoomContainer) {
        const rect = this.zoomContainer.nativeElement.getBoundingClientRect();
        const cx = event.clientX - rect.left - rect.width / 2;
        const cy = event.clientY - rect.top - rect.height / 2;
        const newZoom = 3;
        const scale = newZoom / this.zoom;
        this.panX = cx - scale * (cx - this.panX);
        this.panY = cy - scale * (cy - this.panY);
        this.zoom = newZoom;
      }
    }
  }

  // ─── Touch zoom (pinch) ──────────────────────────────────────

  private lastTouchDist = 0;

  onTouchStart(event: TouchEvent): void {
    if (event.touches.length === 2) {
      event.preventDefault();
      this.lastTouchDist = this.getTouchDist(event);
    } else if (event.touches.length === 1 && this.zoom > 1) {
      this.panStartX = event.touches[0].clientX;
      this.panStartY = event.touches[0].clientY;
      this.panOriginX = this.panX;
      this.panOriginY = this.panY;
      this.isPanning = true;
    }
  }

  onTouchMove(event: TouchEvent): void {
    if (event.touches.length === 2) {
      event.preventDefault();
      const dist = this.getTouchDist(event);
      const scale = dist / this.lastTouchDist;
      this.zoom = Math.max(this.MIN_ZOOM, Math.min(this.zoom * scale, this.MAX_ZOOM));
      this.lastTouchDist = dist;
    } else if (event.touches.length === 1 && this.isPanning) {
      this.panX = this.panOriginX + (event.touches[0].clientX - this.panStartX);
      this.panY = this.panOriginY + (event.touches[0].clientY - this.panStartY);
    }
  }

  onTouchEnd(event: TouchEvent): void {
    if (event.touches.length < 2) this.lastTouchDist = 0;
    if (event.touches.length === 0) this.isPanning = false;
  }

  private getTouchDist(e: TouchEvent): number {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // ─── Fullscreen ──────────────────────────────────────────────

  toggleFullscreen(): void {
    this.isFullscreen = !this.isFullscreen;
    if (!this.isFullscreen) this.resetZoom();
  }

  // ─── Events ──────────────────────────────────────────────────

  onClose(): void {
    this.isFullscreen = false;
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
    switch (event.key) {
      case 'Escape':
        if (this.isFullscreen) { this.isFullscreen = false; }
        else { this.onClose(); }
        break;
      case 'ArrowLeft': this.navigatePrevious(); break;
      case 'ArrowRight': this.navigateNext(); break;
      case '+': case '=': this.zoomIn(); event.preventDefault(); break;
      case '-': this.zoomOut(); event.preventDefault(); break;
      case '0': this.zoomToFit(); event.preventDefault(); break;
      case 'f': case 'F': this.toggleFullscreen(); break;
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
