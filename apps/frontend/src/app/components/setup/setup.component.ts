import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { trigger, transition, style, animate } from '@angular/animations';
import { AuthService, User, UserSignature } from '../../services/auth.service';
import { ApiService, UserMailbox } from '../../api/api.service';
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

  // Step 1: KI-Kontext (Name + Position only)
  editSignature: UserSignature = {
    name: '',
    position: ''
  };

  // Step 2: Mailbox selection
  myMailboxes: UserMailbox[] = [];
  selectedMailboxIds: Set<string> = new Set();

  constructor(
    private authService: AuthService,
    private apiService: ApiService,
    private router: Router,
    private toasts: ToastService
  ) {}

  ngOnInit(): void {
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }

    const user = this.authService.getCurrentUser();
    if (user?.isProfileComplete) {
      this.router.navigate(['/']);
    }

    this.authService.currentUser$.subscribe(user => {
      this.user = user;
      if (user) {
        this.editSignature = {
          name: user.signatureName || user.name || '',
          position: user.signaturePosition || ''
        };
      }
    });

    // Load assigned mailboxes
    this.loadMailboxes();
  }

  private loadMailboxes(): void {
    this.apiService.getMyMailboxes().subscribe({
      next: (mailboxes) => {
        this.myMailboxes = mailboxes;
        // Pre-select already active ones
        mailboxes.forEach(um => {
          if (um.isActive) {
            this.selectedMailboxIds.add(um.mailbox.id);
          }
        });
      },
      error: (err) => console.error('Failed to load mailboxes:', err)
    });
  }

  get stepTitle(): string {
    switch (this.currentStep) {
      case 1: return 'KI-Kontext einrichten';
      case 2: return 'Postfächer auswählen';
      case 3: return 'Alles bereit!';
      default: return '';
    }
  }

  get stepDescription(): string {
    switch (this.currentStep) {
      case 1: return 'Diese Daten werden der KI übergeben, damit sie personalisierte Antworten generieren kann.';
      case 2: return 'Wähle die Postfächer aus, die du aktiv nutzen möchtest. Neue E-Mails werden nur aus aktiven Postfächern geladen.';
      case 3: return 'Dein Profil ist eingerichtet. Du kannst jetzt loslegen!';
      default: return '';
    }
  }

  get canProceed(): boolean {
    if (this.currentStep === 1) {
      return !!(this.editSignature.name?.trim());
    }
    return true;
  }

  isMailboxSelected(mailboxId: string): boolean {
    return this.selectedMailboxIds.has(mailboxId);
  }

  toggleMailbox(mailboxId: string): void {
    if (this.selectedMailboxIds.has(mailboxId)) {
      this.selectedMailboxIds.delete(mailboxId);
    } else {
      this.selectedMailboxIds.add(mailboxId);
    }
  }

  nextStep(): void {
    if (this.currentStep === 1) {
      this.saveKiContext();
    } else if (this.currentStep === 2) {
      this.saveMailboxSelection();
    }
  }

  prevStep(): void {
    if (this.currentStep > 1) {
      this.currentStep--;
    }
  }

  skipStep(): void {
    this.currentStep = 3;
  }

  private saveKiContext(): void {
    if (!this.user) return;
    this.saving = true;

    const data = {
      signatureName: this.editSignature.name?.trim() || null,
      signaturePosition: this.editSignature.position?.trim() || null
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

  private saveMailboxSelection(): void {
    this.saving = true;
    const mailboxIds = Array.from(this.selectedMailboxIds);

    this.apiService.setActiveMailboxes(mailboxIds).subscribe({
      next: () => {
        this.saving = false;
        this.currentStep = 3;
        this.toasts.success('Postfächer aktiviert!');
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
        this.toasts.success('Willkommen bei MailFlow!');
        this.router.navigate(['/']);
      },
      error: (err) => {
        this.saving = false;
        this.toasts.error('Fehler: ' + (err.error?.message || 'Unbekannter Fehler'));
      }
    });
  }
}
