// ==================== pages/profile/profile.component.ts ====================
import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { trigger, transition, style, animate } from '@angular/animations';
import { AuthService, User, UserRole, UserSignature } from '../../services/auth.service';
import { ApiService } from '../../api/api.service';
import { ToastService } from '../../shared/toasts/toast.service';
import { ConfirmationService } from '../../shared/confirmation/confirmation.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
  animations: [
    trigger('slideDown', [
      transition(':enter', [
        style({ opacity: 0, height: 0, overflow: 'hidden' }),
        animate('300ms ease-out', style({ opacity: 1, height: '*' }))
      ]),
      transition(':leave', [
        style({ opacity: 1, height: '*', overflow: 'hidden' }),
        animate('200ms ease-in', style({ opacity: 0, height: 0 }))
      ])
    ])
  ]
})
export class ProfileComponent implements OnInit {
  user: User | null = null;
  UserRole = UserRole;
  
  // Edit mode
  editMode = false;
  editName = '';
  saving = false;
  
  // AI Context (for AI to know who the user is)
  signatureSaving = false;
  editSignature: UserSignature = {
    name: '',
    position: '',
    company: '',
    phone: '',
    website: ''
  };
  
  // Real Email Signature edit mode (WYSIWYG, like Outlook)
  realSignatureEditMode = false;
  realSignatureSaving = false;
  editEmailSignature = '';
  selectedTextColor = '#333333';
  selectedBgColor = '#ffffff';
  editorView: 'wysiwyg' | 'code' | 'split' = 'wysiwyg';
  uploadingImage = false;
  
  @ViewChild('htmlTextarea') htmlTextarea!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('wysiwygEditor') wysiwygEditor!: ElementRef<HTMLDivElement>;
  @ViewChild('imageUpload') imageUpload!: ElementRef<HTMLInputElement>;

  constructor(
    private authService: AuthService,
    private apiService: ApiService,
    private router: Router,
    private toasts: ToastService,
    private confirmationService: ConfirmationService,
    private sanitizer: DomSanitizer
  ) { }

  ngOnInit(): void {
    this.authService.currentUser$.subscribe(user => {
      this.user = user;
      if (user) {
        this.editName = user.name;
        this.loadSignatureFromUser(user);
        this.editEmailSignature = user.emailSignature || '';
      }
    });
  }

  private loadSignatureFromUser(user: User): void {
    this.editSignature = {
      name: user.signatureName || '',
      position: user.signaturePosition || '',
      company: user.signatureCompany || '',
      phone: user.signaturePhone || '',
      website: user.signatureWebsite || ''
    };
  }

  // ==================== AI Context Methods ====================

  saveSignature(): void {
    if (!this.user) return;

    this.signatureSaving = true;
    
    const signatureData = {
      signatureName: this.editSignature.name?.trim() || null,
      signaturePosition: this.editSignature.position?.trim() || null,
      signatureCompany: this.editSignature.company?.trim() || null,
      signaturePhone: this.editSignature.phone?.trim() || null,
      signatureWebsite: this.editSignature.website?.trim() || null
    };

    this.apiService.updateMe(signatureData).subscribe({
      next: (updatedUser) => {
        localStorage.setItem('current_user', JSON.stringify(updatedUser));
        this.user = updatedUser;
        this.signatureSaving = false;
        this.toasts.success('KI-Kontext erfolgreich gespeichert!');
      },
      error: (err) => {
        this.signatureSaving = false;
        this.toasts.error('Fehler beim Speichern: ' + (err.error?.message || 'Unbekannter Fehler'));
      }
    });
  }

  hasSignature(): boolean {
    return !!(this.user?.signatureName || this.user?.signaturePosition || 
              this.user?.signatureCompany || this.user?.signaturePhone || 
              this.user?.signatureWebsite);
  }

  // ==================== Email Signature Methods (WYSIWYG) ====================

  toggleRealSignatureEditMode(): void {
    this.realSignatureEditMode = !this.realSignatureEditMode;
    if (this.realSignatureEditMode && this.user) {
      this.editEmailSignature = this.user.emailSignature || '';
      this.editorView = 'wysiwyg';
    }
  }

  cancelRealSignatureEdit(): void {
    this.realSignatureEditMode = false;
    if (this.user) {
      this.editEmailSignature = this.user.emailSignature || '';
    }
  }

  saveRealSignature(): void {
    if (!this.user) return;

    // Sync from WYSIWYG if active
    this.syncFromWysiwyg();

    this.realSignatureSaving = true;

    this.apiService.updateMe({ emailSignature: this.editEmailSignature.trim() || null }).subscribe({
      next: (updatedUser) => {
        localStorage.setItem('current_user', JSON.stringify(updatedUser));
        this.user = updatedUser;
        this.realSignatureEditMode = false;
        this.realSignatureSaving = false;
        this.toasts.success('E-Mail-Signatur erfolgreich gespeichert!');
      },
      error: (err) => {
        this.realSignatureSaving = false;
        this.toasts.error('Fehler beim Speichern: ' + (err.error?.message || 'Unbekannter Fehler'));
      }
    });
  }

  hasRealSignature(): boolean {
    return !!(this.user?.emailSignature && this.user.emailSignature.trim().length > 0);
  }

  getSafeHtml(html: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  generateDefaultSignature(): void {
    const sig = this.editSignature;
    const name = sig.name || this.user?.signatureName || '';
    const position = sig.position || this.user?.signaturePosition || '';
    const company = sig.company || this.user?.signatureCompany || '';
    const phone = sig.phone || this.user?.signaturePhone || '';
    const website = sig.website || this.user?.signatureWebsite || '';

    let html = '<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">\n';
    html += '<p style="margin: 0;">Mit freundlichen Grüßen</p>\n';
    html += '<br>\n';
    
    if (name) html += `<p style="margin: 0; font-weight: bold; font-size: 16px; color: #1a1a1a;">${name}</p>\n`;
    if (position) html += `<p style="margin: 0; color: #555;">${position}</p>\n`;
    if (company) html += `<p style="margin: 4px 0 0; font-weight: 600; color: #1565c0;">${company}</p>\n`;
    
    html += '<hr style="border: none; border-top: 2px solid #1565c0; margin: 12px 0; width: 60px;">\n';
    
    const contactParts: string[] = [];
    if (phone) contactParts.push(`<span>Tel: ${phone}</span>`);
    if (website) {
      const href = website.startsWith('http') ? website : `https://${website}`;
      contactParts.push(`<a href="${href}" style="color: #1565c0; text-decoration: none;">${website}</a>`);
    }
    if (contactParts.length) html += `<p style="margin: 0; font-size: 13px; color: #666;">${contactParts.join(' &nbsp;|&nbsp; ')}</p>\n`;
    
    html += '</div>';
    
    this.editEmailSignature = html;
    this.syncToWysiwyg();
  }

  // ==================== WYSIWYG Editor Core ====================

  /**
   * Execute a document command on the contenteditable area
   */
  execCommand(command: string, value?: string): void {
    // Focus the editor to ensure commands work
    this.wysiwygEditor?.nativeElement?.focus();
    document.execCommand(command, false, value || '');
    this.syncFromWysiwyg();
  }

  /**
   * Sync WYSIWYG content → editEmailSignature
   */
  onWysiwygInput(): void {
    if (this.wysiwygEditor?.nativeElement) {
      this.editEmailSignature = this.wysiwygEditor.nativeElement.innerHTML;
    }
  }

  /**
   * Sync editEmailSignature → WYSIWYG (when switching views or loading)
   */
  syncToWysiwyg(): void {
    setTimeout(() => {
      if (this.wysiwygEditor?.nativeElement) {
        this.wysiwygEditor.nativeElement.innerHTML = this.editEmailSignature;
      }
    }, 0);
  }

  /**
   * Read current WYSIWYG content into the model
   */
  syncFromWysiwyg(): void {
    if (this.wysiwygEditor?.nativeElement && (this.editorView === 'wysiwyg' || this.editorView === 'split')) {
      this.editEmailSignature = this.wysiwygEditor.nativeElement.innerHTML;
    }
  }

  /**
   * When code textarea changes, sync to WYSIWYG
   */
  onCodeInput(): void {
    this.syncToWysiwyg();
  }

  /**
   * Handle paste in WYSIWYG — allow images from clipboard
   */
  onWysiwygPaste(event: ClipboardEvent): void {
    const items = event.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        event.preventDefault();
        const file = items[i].getAsFile();
        if (file) this.insertImageFile(file);
        return;
      }
    }
    // For non-image pastes, let the default paste happen, then sync
    setTimeout(() => this.onWysiwygInput(), 0);
  }

  /**
   * Handle drag & drop images into the editor
   */
  onWysiwygDrop(event: DragEvent): void {
    event.preventDefault();
    const files = event.dataTransfer?.files;
    if (!files) return;

    for (let i = 0; i < files.length; i++) {
      if (files[i].type.startsWith('image/')) {
        this.insertImageFile(files[i]);
      }
    }
  }

  // ==================== Image Handling ====================

  /**
   * Trigger the hidden file input
   */
  triggerImageUpload(): void {
    this.imageUpload?.nativeElement?.click();
  }

  /**
   * Handle file selection from input
   */
  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files) return;

    for (let i = 0; i < input.files.length; i++) {
      this.insertImageFile(input.files[i]);
    }
    // Reset input so same file can be selected again
    input.value = '';
  }

  /**
   * Convert image file to base64 and insert into editor
   */
  private insertImageFile(file: File): void {
    if (file.size > 2 * 1024 * 1024) {
      this.toasts.error('Bild zu groß. Maximal 2 MB erlaubt.');
      return;
    }

    this.uploadingImage = true;

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      
      // Create an img element with the image
      const img = new Image();
      img.onload = () => {
        // Resize if too large (max 600px wide for email signatures)
        let width = img.width;
        let height = img.height;
        const maxWidth = 600;
        
        if (width > maxWidth) {
          const ratio = maxWidth / width;
          width = maxWidth;
          height = Math.round(height * ratio);
        }

        // Use canvas to resize
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to base64 (JPEG for photos, PNG for transparency)
        const resizedBase64 = file.type === 'image/png' 
          ? canvas.toDataURL('image/png')
          : canvas.toDataURL('image/jpeg', 0.85);
        
        const imgHtml = `<img src="${resizedBase64}" alt="Signatur-Bild" style="max-width: 100%; height: auto; display: block;" width="${width}" height="${height}">`;
        
        if (this.editorView === 'wysiwyg' || this.editorView === 'split') {
          // Insert at cursor in WYSIWYG
          this.wysiwygEditor?.nativeElement?.focus();
          document.execCommand('insertHTML', false, imgHtml);
          this.onWysiwygInput();
        } else {
          // Insert at cursor in code editor
          this.insertAtCursor(imgHtml);
        }
        
        this.uploadingImage = false;
      };
      img.onerror = () => {
        this.toasts.error('Bild konnte nicht geladen werden.');
        this.uploadingImage = false;
      };
      img.src = base64;
    };
    reader.onerror = () => {
      this.toasts.error('Fehler beim Lesen der Datei.');
      this.uploadingImage = false;
    };
    reader.readAsDataURL(file);
  }

  // ==================== WYSIWYG Insert Helpers ====================

  insertLinkWysiwyg(): void {
    const url = prompt('URL eingeben:', 'https://');
    if (!url) return;
    
    const selection = window.getSelection();
    const selectedText = selection?.toString() || '';
    const text = selectedText || prompt('Link-Text eingeben:', url);
    if (!text) return;

    if (this.editorView === 'wysiwyg' || this.editorView === 'split') {
      this.wysiwygEditor?.nativeElement?.focus();
      if (selectedText) {
        document.execCommand('createLink', false, url);
      } else {
        document.execCommand('insertHTML', false, `<a href="${url}" style="color: #1565c0;">${text}</a>`);
      }
      this.onWysiwygInput();
    } else {
      this.insertAtCursor(`<a href="${url}" style="color: #1565c0;">${text}</a>`);
    }
  }

  insertTable(): void {
    const rows = parseInt(prompt('Anzahl Zeilen:', '2') || '0', 10);
    const cols = parseInt(prompt('Anzahl Spalten:', '2') || '0', 10);
    if (!rows || !cols) return;

    let tableHtml = '<table style="border-collapse: collapse; width: 100%; margin: 8px 0;" cellpadding="6" cellspacing="0">';
    for (let r = 0; r < rows; r++) {
      tableHtml += '<tr>';
      for (let c = 0; c < cols; c++) {
        const tag = r === 0 ? 'th' : 'td';
        const style = r === 0 
          ? 'border: 1px solid #ddd; padding: 8px; background: #f5f5f5; font-weight: bold; text-align: left;'
          : 'border: 1px solid #ddd; padding: 8px;';
        tableHtml += `<${tag} style="${style}">&nbsp;</${tag}>`;
      }
      tableHtml += '</tr>';
    }
    tableHtml += '</table>';

    if (this.editorView === 'wysiwyg' || this.editorView === 'split') {
      this.wysiwygEditor?.nativeElement?.focus();
      document.execCommand('insertHTML', false, tableHtml);
      this.onWysiwygInput();
    } else {
      this.insertAtCursor(tableHtml);
    }
  }

  // ==================== Code Editor Helpers (kept for code view) ====================

  private insertAtCursor(text: string, cursorOffset?: number): void {
    const textarea = this.htmlTextarea?.nativeElement;
    if (!textarea) {
      this.editEmailSignature += text;
      return;
    }

    const start = textarea.selectionStart;
    const before = this.editEmailSignature.substring(0, start);
    const after = this.editEmailSignature.substring(start);

    this.editEmailSignature = before + text + after;

    setTimeout(() => {
      textarea.focus();
      const cursorPos = start + (cursorOffset ?? text.length);
      textarea.setSelectionRange(cursorPos, cursorPos);
    }, 0);
  }

  onTextareaKeydown(event: KeyboardEvent): void {
    if (event.ctrlKey && event.key === 'b') {
      event.preventDefault();
      this.insertHtmlTag('strong');
    }
    if (event.ctrlKey && event.key === 'i') {
      event.preventDefault();
      this.insertHtmlTag('em');
    }
    if (event.ctrlKey && event.key === 'u') {
      event.preventDefault();
      this.insertHtmlTag('u');
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      this.insertAtCursor('  ');
    }
  }

  private insertHtmlTag(tag: string): void {
    const textarea = this.htmlTextarea?.nativeElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = this.editEmailSignature.substring(start, end);
    const before = this.editEmailSignature.substring(0, start);
    const after = this.editEmailSignature.substring(end);

    const newText = selectedText 
      ? `<${tag}>${selectedText}</${tag}>`
      : `<${tag}></${tag}>`;
    
    this.editEmailSignature = before + newText + after;
    
    setTimeout(() => {
      textarea.focus();
      const cursorPos = selectedText 
        ? start + newText.length 
        : start + tag.length + 2;
      textarea.setSelectionRange(cursorPos, cursorPos);
    }, 0);
  }

  // ==================== Profile Methods ====================

  toggleEditMode() {
    this.editMode = !this.editMode;
    if (this.editMode && this.user) {
      this.editName = this.user.name;
    }
  }

  cancelEdit() {
    this.editMode = false;
    if (this.user) {
      this.editName = this.user.name;
    }
  }

  saveProfile() {
    if (!this.user || !this.editName.trim() || this.editName.length < 2) {
      this.toasts.error('Name muss mindestens 2 Zeichen lang sein.');
      return;
    }

    this.saving = true;
    this.apiService.updateMe({ name: this.editName.trim() }).subscribe({
      next: (updatedUser) => {
        localStorage.setItem('current_user', JSON.stringify(updatedUser));
        this.user = updatedUser;
        this.editMode = false;
        this.saving = false;
        this.toasts.success('Profil erfolgreich aktualisiert!');
      },
      error: (err) => {
        this.saving = false;
        this.toasts.error('Fehler beim Speichern: ' + (err.error?.message || 'Unbekannter Fehler'));
      }
    });
  }

  copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      this.toasts.success('In Zwischenablage kopiert!');
    }).catch(() => {
      this.toasts.error('Kopieren fehlgeschlagen');
    });
  }

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
    }
  }

  routeTo(route: string) {
    this.router.navigate([route]);
  }

  getRoleBadgeClass(): string {
    return this.user?.role === UserRole.ADMIN ? 'role-admin' : 'role-user';
  }

  getRoleLabel(): string {
    return this.user?.role === UserRole.ADMIN ? 'Administrator' : 'Benutzer';
  }

  formatDate(dateString: Date | undefined): string {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  getRoleIcon(): string {
    return this.user?.role === UserRole.ADMIN ? 'admin_panel_settings' : 'person';
  }
}
