import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { trigger, transition, style, animate, state } from '@angular/animations';
import { ApiService, Email, EmailTemplate, GenerateEmailDto } from '../../api/api.service';
import { ToastService } from '../../shared/toasts/toast.service';

type WorkflowStep = 'select' | 'generate' | 'polish' | 'send';

@Component({
  selector: 'app-email-reply',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './email-reply.component.html',
  styleUrls: ['./email-reply.component.scss'],
  animations: [
    trigger('slideIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(20px)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0, transform: 'translateY(-10px)' }))
      ])
    ]),
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('200ms ease-out', style({ opacity: 1 }))
      ])
    ]),
    trigger('pulse', [
      state('active', style({ transform: 'scale(1.02)' })),
      state('inactive', style({ transform: 'scale(1)' })),
      transition('inactive => active', animate('150ms ease-out')),
      transition('active => inactive', animate('150ms ease-in'))
    ]),
    trigger('stepProgress', [
      transition(':enter', [
        style({ width: '0%' }),
        animate('400ms ease-out')
      ])
    ])
  ]
})
export class EmailReplyComponent implements OnInit, OnDestroy {
  email: Email | null = null;
  loading = true;
  
  // Workflow State
  currentStep: WorkflowStep = 'select';
  steps: WorkflowStep[] = ['select', 'generate', 'polish', 'send'];
  
  // Templates & AI Settings
  templates: EmailTemplate[] = [];
  selectedTemplateId = '';
  gptTone: 'professional' | 'friendly' | 'formal' | 'casual' = 'professional';
  gptInstructions = '';
  
  // Reply Content
  replySubject = '';
  replyBody = '';
  
  // Action States
  generatingGPT = false;
  polishingGPT = false;
  sendingReply = false;
  
  // AI Generation History (for undo)
  generationHistory: { subject: string; body: string }[] = [];
  
  private emailId: string = '';
  private sub?: Subscription;

  toneOptions = [
    { value: 'professional', label: 'Professionell', icon: 'business', description: 'Sachlich und geschäftsmäßig' },
    { value: 'friendly', label: 'Freundlich', icon: 'sentiment_satisfied', description: 'Persönlich und warm' },
    { value: 'formal', label: 'Formell', icon: 'verified', description: 'Sehr höflich und respektvoll' },
    { value: 'casual', label: 'Locker', icon: 'mood', description: 'Ungezwungen und entspannt' }
  ];

  constructor(
    private api: ApiService,
    private toasts: ToastService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.emailId = this.route.snapshot.params['id'];
    this.loadEmail();
    this.loadTemplates();
  }

  setTone(tone: 'professional' | 'friendly' | 'formal' | 'casual'): void {
    this.gptTone = tone;
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  loadEmail(): void {
    this.loading = true;
    this.api.getEmailById(this.emailId).subscribe({
      next: (email) => {
        this.email = email;
        this.replySubject = email.subject.startsWith('Re:') 
          ? email.subject 
          : `Re: ${email.subject}`;
        this.loading = false;
      },
      error: (err) => {
        console.error('Fehler beim Laden der E-Mail:', err);
        this.toasts.error('E-Mail konnte nicht geladen werden');
        this.loading = false;
        this.router.navigate(['/emails']);
      }
    });
  }

  loadTemplates(): void {
    this.api.getEmailTemplates().subscribe({
      next: (templates) => {
        this.templates = templates;
      },
      error: (err) => console.error('Fehler beim Laden der Templates:', err)
    });
  }

  // ==================== WORKFLOW NAVIGATION ====================

  get currentStepIndex(): number {
    return this.steps.indexOf(this.currentStep);
  }

  get progressPercent(): number {
    return ((this.currentStepIndex + 1) / this.steps.length) * 100;
  }

  goToStep(step: WorkflowStep): void {
    // Can only go back or stay, not skip forward
    const targetIndex = this.steps.indexOf(step);
    if (targetIndex <= this.currentStepIndex) {
      this.currentStep = step;
    }
  }

  nextStep(): void {
    const nextIndex = this.currentStepIndex + 1;
    if (nextIndex < this.steps.length) {
      this.currentStep = this.steps[nextIndex];
    }
  }

  prevStep(): void {
    const prevIndex = this.currentStepIndex - 1;
    if (prevIndex >= 0) {
      this.currentStep = this.steps[prevIndex];
    }
  }

  canProceed(): boolean {
    switch (this.currentStep) {
      case 'select':
        return true; // Can always proceed from select
      case 'generate':
        return this.replyBody.trim().length > 0;
      case 'polish':
        return this.replyBody.trim().length > 0;
      case 'send':
        return this.replyBody.trim().length > 0 && this.replySubject.trim().length > 0;
      default:
        return false;
    }
  }

  // ==================== TEMPLATE HANDLING ====================

  applyTemplate(): void {
    if (!this.selectedTemplateId) return;
    
    const template = this.templates.find(t => t.id === this.selectedTemplateId);
    if (template) {
      this.saveToHistory();
      this.replyBody = template.body;
      if (template.subject) {
        this.replySubject = template.subject;
      }
      this.toasts.success('Vorlage eingefügt');
      this.nextStep();
    }
  }

  // ==================== AI GENERATION ====================

  generateWithGPT(): void {
    if (!this.email) return;

    this.generatingGPT = true;
    
    const dto: GenerateEmailDto = {
      originalEmail: {
        subject: this.email.subject,
        from: this.email.fromName || this.email.fromAddress,
        body: this.email.textBody || this.stripHtml(this.email.htmlBody || '')
      },
      tone: this.gptTone,
      instructions: this.gptInstructions || undefined,
      templateId: this.selectedTemplateId || undefined
    };

    this.api.generateEmailWithGPT(dto).subscribe({
      next: (result) => {
        this.saveToHistory();
        this.replySubject = result.subject;
        this.replyBody = result.body;
        this.generatingGPT = false;
        this.toasts.success('Antwort wurde generiert');
        this.nextStep();
      },
      error: (err) => {
        console.error('GPT Fehler:', err);
        this.toasts.error('Fehler bei der Generierung');
        this.generatingGPT = false;
      }
    });
  }

  polishWithGPT(): void {
    if (!this.email || !this.replyBody.trim()) return;

    this.polishingGPT = true;
    
    const dto: GenerateEmailDto = {
      originalEmail: {
        subject: this.email.subject,
        from: this.email.fromName || this.email.fromAddress,
        body: this.email.textBody || this.stripHtml(this.email.htmlBody || '')
      },
      tone: this.gptTone,
      instructions: `Poliere und verbessere diesen Entwurf. Behalte die Kernaussagen bei, verbessere aber Grammatik, Stil und Formulierungen:\n\n${this.replyBody}`
    };

    this.api.generateEmailWithGPT(dto).subscribe({
      next: (result) => {
        this.saveToHistory();
        this.replySubject = result.subject;
        this.replyBody = result.body;
        this.polishingGPT = false;
        this.toasts.success('Text wurde poliert');
      },
      error: (err) => {
        console.error('Polish Fehler:', err);
        this.toasts.error('Fehler beim Polieren');
        this.polishingGPT = false;
      }
    });
  }

  // ==================== HISTORY / UNDO ====================

  private saveToHistory(): void {
    if (this.replyBody.trim()) {
      this.generationHistory.push({
        subject: this.replySubject,
        body: this.replyBody
      });
      // Keep only last 5 versions
      if (this.generationHistory.length > 5) {
        this.generationHistory.shift();
      }
    }
  }

  undoGeneration(): void {
    if (this.generationHistory.length > 0) {
      const prev = this.generationHistory.pop()!;
      this.replySubject = prev.subject;
      this.replyBody = prev.body;
      this.toasts.success('Letzte Version wiederhergestellt');
    }
  }

  get canUndo(): boolean {
    return this.generationHistory.length > 0;
  }

  // ==================== SEND / ACTIONS ====================

  sendReply(): void {
    if (!this.email || !this.replyBody.trim()) {
      this.toasts.error('Bitte Text eingeben');
      return;
    }

    this.sendingReply = true;

    this.api.sendEmailReply({
      to: this.email.fromAddress,
      subject: this.replySubject,
      body: this.replyBody,
      inReplyTo: this.email.messageId
    }).subscribe({
      next: () => {
        // Mark as sent
        this.api.markEmailAsSent(this.email!.id, this.replySubject, this.replyBody).subscribe({
          next: () => {
            this.toasts.success('E-Mail wurde gesendet und archiviert!');
            this.sendingReply = false;
            this.router.navigate(['/emails']);
          },
          error: () => {
            this.toasts.success('E-Mail gesendet, aber Status konnte nicht aktualisiert werden');
            this.sendingReply = false;
            this.router.navigate(['/emails']);
          }
        });
      },
      error: (err) => {
        console.error('Senden fehlgeschlagen:', err);
        this.toasts.error('Fehler beim Senden');
        this.sendingReply = false;
      }
    });
  }

  markAsNoReplyNeeded(): void {
    if (!this.email) return;

    this.api.moveEmailToTrash(this.email.id).subscribe({
      next: () => {
        this.toasts.success('E-Mail in Papierkorb verschoben');
        this.router.navigate(['/emails']);
      },
      error: (err) => {
        console.error('Fehler:', err);
        this.toasts.error('Fehler beim Verschieben');
      }
    });
  }

  cancel(): void {
    this.router.navigate(['/emails']);
  }

  // ==================== HELPERS ====================

  private stripHtml(html: string): string {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }

  formatDate(date: Date | string): string {
    const d = new Date(date);
    return d.toLocaleDateString('de-DE', { 
      day: '2-digit', 
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getSenderDisplay(): string {
    if (!this.email) return '';
    if (this.email.fromName) {
      return `${this.email.fromName} <${this.email.fromAddress}>`;
    }
    return this.email.fromAddress;
  }

  getWordCount(): number {
    return this.replyBody.trim().split(/\s+/).filter(w => w.length > 0).length;
  }
}
