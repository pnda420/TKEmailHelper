// ==================== pages/profile/profile.component.ts ====================
import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { trigger, transition, style, animate } from '@angular/animations';
import { AuthService, User, UserRole, UserSignature } from '../../services/auth.service';
import { ApiService } from '../../api/api.service';
import { ToastService } from '../../shared/toasts/toast.service';
import { ConfirmationService } from '../../shared/confirmation/confirmation.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
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
  
  // AI Context Signature edit mode (for AI to know who the user is)
  signatureEditMode = false;
  signatureSaving = false;
  editSignature: UserSignature = {
    name: '',
    position: '',
    company: '',
    phone: '',
    website: ''
  };
  
  // Real Email Signature edit mode (HTML, like Outlook)
  realSignatureEditMode = false;
  realSignatureSaving = false;
  editEmailSignature = '';
  selectedTextColor = '#333333';
  
  @ViewChild('htmlTextarea') htmlTextarea!: ElementRef<HTMLTextAreaElement>;
  
  // Accordion
  showDetails = false;
  showSignature = false;
  showRealSignature = false;

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

  // ==================== AI Context Signature Methods ====================
  
  toggleSignatureSection(): void {
    this.showSignature = !this.showSignature;
  }

  toggleSignatureEditMode(): void {
    this.signatureEditMode = !this.signatureEditMode;
    if (this.signatureEditMode && this.user) {
      this.loadSignatureFromUser(this.user);
    }
  }

  cancelSignatureEdit(): void {
    this.signatureEditMode = false;
    if (this.user) {
      this.loadSignatureFromUser(this.user);
    }
  }

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
        this.signatureEditMode = false;
        this.signatureSaving = false;
        this.toasts.success('KI-Signatur erfolgreich gespeichert!');
      },
      error: (err) => {
        this.signatureSaving = false;
        this.toasts.error('Fehler beim Speichern: ' + (err.error?.message || 'Unbekannter Fehler'));
      }
    });
  }

  getSignaturePreview(): string {
    const parts: string[] = [];
    if (this.editSignature.name) parts.push(this.editSignature.name);
    if (this.editSignature.position) parts.push(this.editSignature.position);
    if (this.editSignature.company) parts.push(this.editSignature.company);
    if (this.editSignature.phone) parts.push(`Tel: ${this.editSignature.phone}`);
    if (this.editSignature.website) parts.push(this.editSignature.website);
    return parts.length > 0 ? parts.join('\n') : 'Keine KI-Signatur konfiguriert';
  }

  hasSignature(): boolean {
    return !!(this.user?.signatureName || this.user?.signaturePosition || 
              this.user?.signatureCompany || this.user?.signaturePhone || 
              this.user?.signatureWebsite);
  }

  // ==================== Real Email Signature Methods (HTML, like Outlook) ====================

  toggleRealSignatureSection(): void {
    this.showRealSignature = !this.showRealSignature;
  }

  toggleRealSignatureEditMode(): void {
    this.realSignatureEditMode = !this.realSignatureEditMode;
    if (this.realSignatureEditMode && this.user) {
      this.editEmailSignature = this.user.emailSignature || '';
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
    // Generate a default signature from AI context fields
    const parts: string[] = [];
    parts.push('<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">');
    parts.push('<p>Mit freundlichen Grüßen,</p>');
    
    if (this.user?.signatureName || this.editSignature.name) {
      parts.push(`<p><strong>${this.user?.signatureName || this.editSignature.name}</strong></p>`);
    }
    
    if (this.user?.signaturePosition || this.editSignature.position) {
      parts.push(`<p>${this.user?.signaturePosition || this.editSignature.position}</p>`);
    }
    
    if (this.user?.signatureCompany || this.editSignature.company) {
      parts.push(`<p>${this.user?.signatureCompany || this.editSignature.company}</p>`);
    }
    
    const contactLines: string[] = [];
    if (this.user?.signaturePhone || this.editSignature.phone) {
      contactLines.push(`Tel: ${this.user?.signaturePhone || this.editSignature.phone}`);
    }
    if (this.user?.signatureWebsite || this.editSignature.website) {
      const website = this.user?.signatureWebsite || this.editSignature.website || '';
      const href = website.startsWith('http') ? website : `https://${website}`;
      contactLines.push(`<a href="${href}" style="color: #007bff;">${website}</a>`);
    }
    
    if (contactLines.length > 0) {
      parts.push(`<p>${contactLines.join(' | ')}</p>`);
    }
    
    parts.push('</div>');
    
    this.editEmailSignature = parts.join('\n');
  }

  // ==================== HTML Editor Methods ====================

  insertHtmlTag(tag: string): void {
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
    
    // Set cursor position
    setTimeout(() => {
      textarea.focus();
      const cursorPos = selectedText 
        ? start + newText.length 
        : start + tag.length + 2;
      textarea.setSelectionRange(cursorPos, cursorPos);
    }, 0);
  }

  insertLineBreak(): void {
    this.insertAtCursor('<br>');
  }

  insertParagraph(): void {
    this.insertAtCursor('<p></p>', 3);
  }

  insertHorizontalRule(): void {
    this.insertAtCursor('<hr>');
  }

  insertLink(): void {
    const url = prompt('URL eingeben:', 'https://');
    if (!url) return;
    
    const text = prompt('Link-Text eingeben:', url);
    if (!text) return;

    const linkHtml = `<a href="${url}" style="color: #007bff;">${text}</a>`;
    this.insertAtCursor(linkHtml);
  }

  insertImage(): void {
    const url = prompt('Bild-URL eingeben:', 'https://');
    if (!url) return;

    const alt = prompt('Alternativer Text (für Barrierefreiheit):', 'Bild');
    const imgHtml = `<img src="${url}" alt="${alt || 'Bild'}" style="max-width: 100%; height: auto;">`;
    this.insertAtCursor(imgHtml);
  }

  insertColorSpan(event: Event): void {
    const color = (event.target as HTMLInputElement).value;
    this.selectedTextColor = color;
    
    const textarea = this.htmlTextarea?.nativeElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = this.editEmailSignature.substring(start, end);

    if (selectedText) {
      const before = this.editEmailSignature.substring(0, start);
      const after = this.editEmailSignature.substring(end);
      this.editEmailSignature = before + `<span style="color: ${color};">${selectedText}</span>` + after;
    } else {
      this.insertAtCursor(`<span style="color: ${color};"></span>`, 7 + color.length + 2);
    }
  }

  insertFontSize(event: Event): void {
    const size = (event.target as HTMLSelectElement).value;
    if (!size) return;

    const textarea = this.htmlTextarea?.nativeElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = this.editEmailSignature.substring(start, end);

    if (selectedText) {
      const before = this.editEmailSignature.substring(0, start);
      const after = this.editEmailSignature.substring(end);
      this.editEmailSignature = before + `<span style="font-size: ${size};">${selectedText}</span>` + after;
    } else {
      this.insertAtCursor(`<span style="font-size: ${size};"></span>`, 7 + 12 + size.length + 2);
    }

    // Reset select
    (event.target as HTMLSelectElement).value = '';
  }

  private insertAtCursor(text: string, cursorOffset?: number): void {
    const textarea = this.htmlTextarea?.nativeElement;
    if (!textarea) return;

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
    // Ctrl+B for bold
    if (event.ctrlKey && event.key === 'b') {
      event.preventDefault();
      this.insertHtmlTag('strong');
    }
    // Ctrl+I for italic
    if (event.ctrlKey && event.key === 'i') {
      event.preventDefault();
      this.insertHtmlTag('em');
    }
    // Ctrl+U for underline
    if (event.ctrlKey && event.key === 'u') {
      event.preventDefault();
      this.insertHtmlTag('u');
    }
    // Tab for indentation
    if (event.key === 'Tab') {
      event.preventDefault();
      this.insertAtCursor('  ');
    }
  }

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
        // Update local storage and auth service
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

  toggleNewsletter() {
    if (!this.user) return;

    const newValue = !this.user.wantsNewsletter;
    this.apiService.updateMe({ wantsNewsletter: newValue }).subscribe({
      next: (updatedUser) => {
        localStorage.setItem('current_user', JSON.stringify(updatedUser));
        this.user = updatedUser;
        this.toasts.success(newValue ? 'Newsletter abonniert!' : 'Newsletter abbestellt.');
      },
      error: (err) => {
        this.toasts.error('Fehler: ' + (err.error?.message || 'Konnte Newsletter-Status nicht ändern'));
      }
    });
  }

  toggleDetails() {
    this.showDetails = !this.showDetails;
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
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  getRoleIcon(): string {
    return this.user?.role === UserRole.ADMIN ? 'admin_panel_settings' : 'person';
  }
}
