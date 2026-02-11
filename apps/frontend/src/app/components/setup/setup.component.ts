import { Component, OnInit, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { trigger, transition, style, animate } from '@angular/animations';
import { AuthService, User, UserSignature } from '../../services/auth.service';
import { ApiService } from '../../api/api.service';
import { ToastService } from '../../shared/toasts/toast.service';

@Component({
  selector: 'app-setup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './setup.component.html',
  styleUrl: './setup.component.scss',
  animations: [
    trigger('slideIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(40px)' }),
        animate('400ms cubic-bezier(.23,1,.32,1)', style({ opacity: 1, transform: 'translateX(0)' }))
      ])
    ]),
    trigger('fadeUp', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(20px)' }),
        animate('500ms cubic-bezier(.23,1,.32,1)', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ])
  ]
})
export class SetupComponent implements OnInit {
  user: User | null = null;
  currentStep = 1;
  totalSteps = 3;
  saving = false;

  // Step 1: KI-Kontext
  editSignature: UserSignature = {
    name: '',
    position: '',
    company: '',
    phone: '',
    website: ''
  };

  // Step 2: E-Mail-Signatur (optional)
  editEmailSignature = '';
  skipSignature = false;

  // WYSIWYG
  editorView: 'wysiwyg' | 'code' = 'wysiwyg';
  @ViewChild('wysiwygEditor') wysiwygEditor!: ElementRef<HTMLDivElement>;
  @ViewChild('htmlTextarea') htmlTextarea!: ElementRef<HTMLTextAreaElement>;

  constructor(
    private authService: AuthService,
    private apiService: ApiService,
    private router: Router,
    private toasts: ToastService,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    // If not logged in, redirect to login
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }

    // If already setup complete, redirect to home
    const user = this.authService.getCurrentUser();
    if (user?.isProfileComplete) {
      this.router.navigate(['/']);
    }

    this.authService.currentUser$.subscribe(user => {
      this.user = user;
      if (user) {
        // Pre-fill if user already has some data
        this.editSignature = {
          name: user.signatureName || user.name || '',
          position: user.signaturePosition || '',
          company: user.signatureCompany || '',
          phone: user.signaturePhone || '',
          website: user.signatureWebsite || ''
        };
        this.editEmailSignature = user.emailSignature || '';
      }
    });
  }

  get stepTitle(): string {
    switch (this.currentStep) {
      case 1: return 'KI-Kontext einrichten';
      case 2: return 'E-Mail-Signatur (optional)';
      case 3: return 'Alles bereit!';
      default: return '';
    }
  }

  get stepDescription(): string {
    switch (this.currentStep) {
      case 1: return 'Diese Daten werden der KI übergeben, damit sie personalisierte Antworten generieren kann.';
      case 2: return 'Diese Signatur wird automatisch an alle ausgehenden E-Mails angehängt. Du kannst das auch später machen.';
      case 3: return 'Dein Profil ist eingerichtet. Du kannst jetzt loslegen!';
      default: return '';
    }
  }

  get canProceed(): boolean {
    if (this.currentStep === 1) {
      return !!(this.editSignature.name?.trim() && this.editSignature.company?.trim());
    }
    return true;
  }

  nextStep(): void {
    if (this.currentStep === 1) {
      this.saveKiContext();
    } else if (this.currentStep === 2) {
      if (!this.skipSignature && this.editEmailSignature.trim()) {
        this.saveEmailSignature();
      } else {
        this.currentStep = 3;
      }
    }
  }

  prevStep(): void {
    if (this.currentStep > 1) {
      this.currentStep--;
    }
  }

  skipStep(): void {
    this.skipSignature = true;
    this.currentStep = 3;
  }

  private saveKiContext(): void {
    if (!this.user) return;
    this.saving = true;

    const data = {
      signatureName: this.editSignature.name?.trim() || null,
      signaturePosition: this.editSignature.position?.trim() || null,
      signatureCompany: this.editSignature.company?.trim() || null,
      signaturePhone: this.editSignature.phone?.trim() || null,
      signatureWebsite: this.editSignature.website?.trim() || null,
    };

    this.apiService.updateMe(data).subscribe({
      next: (updatedUser) => {
        this.authService.updateCurrentUser(updatedUser);
        this.user = updatedUser;
        this.saving = false;
        this.currentStep = 2;
        this.toasts.success('KI-Kontext gespeichert!');
      },
      error: (err) => {
        this.saving = false;
        this.toasts.error('Fehler: ' + (err.error?.message || 'Unbekannter Fehler'));
      }
    });
  }

  private saveEmailSignature(): void {
    if (!this.user) return;
    this.syncFromWysiwyg();
    this.saving = true;

    this.apiService.updateMe({ emailSignature: this.editEmailSignature.trim() || null }).subscribe({
      next: (updatedUser) => {
        this.authService.updateCurrentUser(updatedUser);
        this.user = updatedUser;
        this.saving = false;
        this.currentStep = 3;
        this.toasts.success('E-Mail-Signatur gespeichert!');
      },
      error: (err) => {
        this.saving = false;
        this.toasts.error('Fehler: ' + (err.error?.message || 'Unbekannter Fehler'));
      }
    });
  }

  completeSetup(): void {
    if (!this.user) return;
    this.saving = true;

    this.apiService.updateMe({ isProfileComplete: true } as any).subscribe({
      next: (updatedUser) => {
        this.authService.updateCurrentUser(updatedUser);
        this.saving = false;
        this.toasts.success('Willkommen bei MailFlow! 🚀');
        this.router.navigate(['/']);
      },
      error: (err) => {
        this.saving = false;
        this.toasts.error('Fehler: ' + (err.error?.message || 'Unbekannter Fehler'));
      }
    });
  }

  // ── Signature Helpers ──
  generateDefaultSignature(): void {
    const sig = this.editSignature;
    let html = '<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">\n';
    html += '<p style="margin: 0;">Mit freundlichen Grüßen</p>\n';
    html += '<br>\n';
    if (sig.name) html += `<p style="margin: 0; font-weight: bold; font-size: 16px; color: #1a1a1a;">${sig.name}</p>\n`;
    if (sig.position) html += `<p style="margin: 0; color: #555;">${sig.position}</p>\n`;
    if (sig.company) html += `<p style="margin: 4px 0 0; font-weight: 600; color: #1565c0;">${sig.company}</p>\n`;
    html += '<hr style="border: none; border-top: 2px solid #1565c0; margin: 12px 0; width: 60px;">\n';
    const parts: string[] = [];
    if (sig.phone) parts.push(`<span>Tel: ${sig.phone}</span>`);
    if (sig.website) {
      const href = sig.website!.startsWith('http') ? sig.website : `https://${sig.website}`;
      parts.push(`<a href="${href}" style="color: #1565c0; text-decoration: none;">${sig.website}</a>`);
    }
    if (parts.length) html += `<p style="margin: 0; font-size: 13px; color: #666;">${parts.join(' &nbsp;|&nbsp; ')}</p>\n`;
    html += '</div>';
    this.editEmailSignature = html;
    this.syncToWysiwyg();
  }

  getSafeHtml(html: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  // WYSIWYG helpers
  execCommand(command: string, value?: string): void {
    this.wysiwygEditor?.nativeElement?.focus();
    document.execCommand(command, false, value || '');
    this.syncFromWysiwyg();
  }

  onWysiwygInput(): void {
    if (this.wysiwygEditor?.nativeElement) {
      this.editEmailSignature = this.wysiwygEditor.nativeElement.innerHTML;
    }
  }

  syncToWysiwyg(): void {
    setTimeout(() => {
      if (this.wysiwygEditor?.nativeElement) {
        this.wysiwygEditor.nativeElement.innerHTML = this.editEmailSignature;
      }
    }, 0);
  }

  syncFromWysiwyg(): void {
    if (this.wysiwygEditor?.nativeElement && this.editorView === 'wysiwyg') {
      this.editEmailSignature = this.wysiwygEditor.nativeElement.innerHTML;
    }
  }

  onCodeInput(): void {
    this.syncToWysiwyg();
  }
}
