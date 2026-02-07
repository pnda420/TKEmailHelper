import { Component, OnInit, OnDestroy, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { trigger, transition, style, animate, state } from '@angular/animations';
import { AngularSplitModule } from 'angular-split';
import { ApiService, Email, EmailTemplate, GenerateEmailDto } from '../../api/api.service';
import { ToastService } from '../../shared/toasts/toast.service';
import { AttachmentPreviewComponent, AttachmentInfo } from '../../shared/attachment-preview/attachment-preview.component';
import { ConfigService } from '../../services/config.service';
import { AuthService, User } from '../../services/auth.service';

type WorkflowStep = 'select' | 'customize' | 'edit' | 'send';

interface AnalysisStep {
  type: 'start' | 'tool_call' | 'tool_result' | 'thinking' | 'complete' | 'error';
  tool?: string;
  args?: Record<string, any>;
  result?: any;
  content?: string;
  status: 'running' | 'done' | 'error';
}

@Component({
  selector: 'app-email-reply',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, AttachmentPreviewComponent, AngularSplitModule],
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
  allSteps: WorkflowStep[] = ['select', 'customize', 'edit', 'send'];
  useTemplate = false; // Track if user wants to use a template

  // Dynamic steps based on template usage
  get steps(): WorkflowStep[] {
    if (this.useTemplate) {
      return this.allSteps;
    }
    // Skip customize step when not using template
    return ['select', 'edit', 'send'];
  }
  
  // Templates & AI Settings
  templates: EmailTemplate[] = [];
  selectedTemplateId = '';
  selectedTemplate: EmailTemplate | null = null;
  gptTone: 'professional' | 'friendly' | 'formal' | 'casual' = 'professional';
  gptInstructions = '';
  customizeInstructions = ''; // Separate instructions for template customization
  
  // Reply Content
  replySubject = '';
  replyBody = '';
  
  // Action States
  generatingGPT = false;
  polishingGPT = false;
  sendingReply = false;
  
  // AI Generation History (for undo)
  generationHistory: { subject: string; body: string }[] = [];
  
  // Attachment Preview
  attachmentPreviewOpen = false;
  selectedAttachment: AttachmentInfo | null = null;
  currentAttachments: AttachmentInfo[] = [];
  
  // Smart Template Suggestions
  suggestedTemplates: EmailTemplate[] = [];
  bestMatchTemplate: EmailTemplate | null = null; // Single best recommendation
  bestMatchReason = ''; // Why this template was recommended
  showTemplateSuggestions = true;
  analyzingEmail = false;
  
  // Email Summary
  emailSummary = '';
  emailTags: string[] = [];
  loadingSummary = false;
  
  // Toggle Original vs AI Email View
  showOriginalEmail = false;
  
  // Current User (for signature)
  currentUser: User | null = null;
  
  // Speech Recognition
  isListening = false;
  isProcessingSpeech = false;
  speechRecognition: any = null;
  speechSupported = false;
  interimTranscript = ''; // For real-time display
  baseInstructions = ''; // Store finalized text
  
  // AI Agent Analysis
  analyzing = false;
  analysisSteps: AnalysisStep[] = [];
  analysisSummary = '';
  suggestedReply = '';
  analysisError = '';
  showAnalysisPanel = false;
  analysisContextApplied = false;
  showAnalysisDetails = false;
  analysisKeyFacts: { icon: string; label: string; value: string }[] = [];
  feedCollapsed = false;
  customerPhone = '';
  private analysisEventSource: EventSource | null = null;
  
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
    private router: Router,
    private configService: ConfigService,
    private http: HttpClient,
    private authService: AuthService,
    private sanitizer: DomSanitizer,
    private ngZone: NgZone
  ) {}

  ngOnInit(): void {
    this.emailId = this.route.snapshot.params['id'];
    this.loadEmail();
    this.loadTemplates();
    this.initSpeechRecognition();
    
    // Subscribe to current user for signature
    this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;
    });
  }

  setTone(tone: 'professional' | 'friendly' | 'formal' | 'casual'): void {
    this.gptTone = tone;
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.stopListening();
    this.closeAnalysisStream();
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
        
        // Load attachments for preview
        if (email.attachments?.length) {
          this.currentAttachments = this.getAttachmentInfos(email);
        }
        
        // Analyze email for template suggestions and get summary
        this.analyzeEmailForSuggestions();
        this.loadEmailSummary();
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
        // Re-analyze for suggestions after templates are loaded
        if (this.email) {
          this.analyzeEmailForSuggestions();
        }
      },
      error: (err) => console.error('Fehler beim Laden der Templates:', err)
    });
  }

  // ==================== SMART TEMPLATE SUGGESTIONS ====================

  loadEmailSummary(): void {
    if (!this.email) return;
    
    // Use stored AI data if available
    if (this.email.aiProcessedAt) {
      this.emailSummary = this.email.aiSummary || '';
      this.emailTags = this.email.aiTags || [];
      this.loadingSummary = false;
      return;
    }
    
    // Fallback: Make API call if not processed yet
    this.loadingSummary = true;
    const emailBody = this.email.textBody || this.email.preview || '';
    
    this.api.getEmailSummary(this.email.subject, emailBody).subscribe({
      next: (result) => {
        this.emailSummary = result.summary;
        this.emailTags = result.tags || [];
        this.loadingSummary = false;
      },
      error: () => {
        this.emailSummary = '';
        this.emailTags = [];
        this.loadingSummary = false;
      }
    });
  }

  analyzeEmailForSuggestions(): void {
    if (!this.email || this.templates.length === 0) return;

    // Use stored AI data if available
    if (this.email.aiProcessedAt && this.email.recommendedTemplateId) {
      const template = this.templates.find(t => t.id === this.email!.recommendedTemplateId);
      if (template) {
        this.bestMatchTemplate = template;
        this.bestMatchReason = this.email.recommendedTemplateReason || 'KI-Empfehlung';
      }
      this.analyzingEmail = false;
      return;
    }

    // Fallback: Use AI to recommend best template
    this.analyzingEmail = true;
    this.bestMatchTemplate = null;
    this.bestMatchReason = '';

    const emailBody = this.email.textBody || this.email.preview || '';
    
    this.api.getAITemplateRecommendation(this.email.subject, emailBody).subscribe({
      next: (recommendation) => {
        this.analyzingEmail = false;
        
        // Only show if confidence is high enough (> 70)
        if (recommendation.templateId && recommendation.confidence > 70) {
          const template = this.templates.find(t => t.id === recommendation.templateId);
          if (template) {
            this.bestMatchTemplate = template;
            this.bestMatchReason = recommendation.reason;
          }
        }
      },
      error: (err) => {
        console.error('Fehler bei KI-Empfehlung:', err);
        this.analyzingEmail = false;
        // Fallback to simple keyword matching
        this.fallbackKeywordMatching();
      }
    });
  }

  // Fallback wenn KI nicht verfügbar
  private fallbackKeywordMatching(): void {
    if (!this.email) return;
    
    const emailText = `${this.email.subject} ${this.email.textBody || ''} ${this.email.preview || ''}`.toLowerCase();
    
    // Keyword categories with reasons
    const keywordCategories = [
      { keywords: ['preis', 'angebot', 'kosten', 'budget'], reason: 'Preisanfrage erkannt' },
      { keywords: ['rechnung', 'zahlung', 'bezahlung', 'überweisung'], reason: 'Zahlungsthema erkannt' },
      { keywords: ['termin', 'datum', 'meeting', 'besprechung', 'treffen'], reason: 'Terminanfrage erkannt' },
      { keywords: ['frage', 'anfrage', 'information', 'details', 'wissen'], reason: 'Informationsanfrage erkannt' },
      { keywords: ['problem', 'fehler', 'support', 'hilfe', 'funktioniert nicht'], reason: 'Supportanfrage erkannt' },
      { keywords: ['danke', 'vielen dank', 'bestätigung', 'erhalten'], reason: 'Bestätigung erkannt' },
      { keywords: ['lieferung', 'versand', 'bestellung', 'paket'], reason: 'Versandthema erkannt' },
      { keywords: ['projekt', 'auftrag', 'zusammenarbeit', 'kooperation'], reason: 'Projektanfrage erkannt' },
      { keywords: ['beschwerde', 'unzufrieden', 'enttäuscht', 'reklamation'], reason: 'Beschwerde erkannt' },
      { keywords: ['kündigung', 'kündigen', 'beenden', 'stornieren'], reason: 'Kündigungsthema erkannt' }
    ];
    
    // Score templates based on keyword matches
    const scoredTemplates = this.templates.map(template => {
      let score = 0;
      let matchedReason = '';
      const templateText = `${template.name} ${template.body} ${template.category || ''}`.toLowerCase();
      
      // Check keyword categories
      keywordCategories.forEach(category => {
        category.keywords.forEach(keyword => {
          if (emailText.includes(keyword) && templateText.includes(keyword)) {
            score += 2;
            if (!matchedReason) matchedReason = category.reason;
          }
        });
      });

      // Category match bonus
      if (template.category) {
        const category = template.category.toLowerCase();
        if (emailText.includes(category)) {
          score += 3;
        }
      }

      return { template, score, reason: matchedReason };
    });

    // Sort by score
    const sortedTemplates = scoredTemplates
      .filter(t => t.score > 0)
      .sort((a, b) => b.score - a.score);

    // Set best match (single recommendation)
    if (sortedTemplates.length > 0 && sortedTemplates[0].score >= 4) {
      this.bestMatchTemplate = sortedTemplates[0].template;
      this.bestMatchReason = sortedTemplates[0].reason || 'Basierend auf E-Mail-Inhalt';
    } else {
      this.bestMatchTemplate = null;
      this.bestMatchReason = '';
    }

    // Get top 3 templates for alternative suggestions
    this.suggestedTemplates = sortedTemplates
      .slice(0, 3)
      .map(t => t.template);
  }

  useSuggestedTemplate(template: EmailTemplate): void {
    // Use the new workflow - go to customize step
    this.selectTemplateAndContinue(template);
  }

  applyTemplateWithAI(template: EmailTemplate): void {
    // Legacy method - redirect to new workflow
    this.selectTemplateAndContinue(template);
  }

  applySelectedTemplateWithAI(): void {
    const template = this.templates.find(t => t.id === this.selectedTemplateId);
    if (template) {
      this.selectTemplateAndContinue(template);
    }
  }

  dismissSuggestions(): void {
    this.showTemplateSuggestions = false;
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
      case 'customize':
        return this.selectedTemplate !== null;
      case 'edit':
        return this.replyBody.trim().length > 0;
      case 'send':
        return this.replyBody.trim().length > 0 && this.replySubject.trim().length > 0;
      default:
        return false;
    }
  }

  // ==================== TEMPLATE WORKFLOW ====================

  selectTemplateAndContinue(template: EmailTemplate): void {
    this.selectedTemplateId = template.id;
    this.selectedTemplate = template;
    this.useTemplate = true;
    this.showTemplateSuggestions = false;
    // Go to customize step
    this.currentStep = 'customize';
  }

  selectChosenTemplate(): void {
    if (!this.selectedTemplateId) return;
    const template = this.templates.find(t => t.id === this.selectedTemplateId);
    if (template) {
      this.selectTemplateAndContinue(template);
    }
  }

  startWithoutTemplate(): void {
    this.useTemplate = false;
    this.selectedTemplate = null;
    this.selectedTemplateId = '';
    // Generate and go directly to draft step (customize is skipped automatically via getter)
    this.generateDirectlyToDraft();
  }

  generateDirectlyToDraft(): void {
    if (!this.email) return;

    this.generatingGPT = true;
    
    // Build instructions including user's signature name
    let fullInstructions = this.gptInstructions || '';
    if (this.currentUser?.signatureName) {
      const nameInstruction = `Beende die E-Mail mit "Mit freundlichen Grüßen" gefolgt von dem Namen "${this.currentUser.signatureName}".`;
      fullInstructions = fullInstructions ? `${fullInstructions}\n\n${nameInstruction}` : nameInstruction;
    }
    
    const dto: GenerateEmailDto = {
      originalEmail: {
        subject: this.email.subject,
        from: this.email.fromName || this.email.fromAddress,
        body: this.email.textBody || this.stripHtml(this.email.htmlBody || '')
      },
      tone: this.gptTone,
      instructions: fullInstructions || undefined
    };

    this.api.generateEmailWithGPT(dto).subscribe({
      next: (result) => {
        this.saveToHistory();
        this.replySubject = result.subject;
        this.replyBody = result.body;
        this.generatingGPT = false;
        this.toasts.success('Antwort wurde generiert');
        // Go directly to 'edit' step
        this.currentStep = 'edit';
      },
      error: (err) => {
        console.error('GPT Fehler:', err);
        this.toasts.error('Fehler bei der Generierung');
        this.generatingGPT = false;
      }
    });
  }

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
      // Skip to edit step
      this.currentStep = 'edit';
    }
  }

  // Generate from template with customization
  generateFromTemplate(): void {
    if (!this.email || !this.selectedTemplate) return;

    this.generatingGPT = true;
    
    // Combine template content with customization instructions
    let instructions = `Nutze diese Vorlage als Basis und passe sie an die ursprüngliche E-Mail-Anfrage an:\n\n--- VORLAGE ---\n${this.selectedTemplate.body}\n--- ENDE VORLAGE ---`;
    
    if (this.customizeInstructions.trim()) {
      instructions += `\n\nZusätzliche Anpassungen:\n${this.customizeInstructions}`;
    }
    
    // Add signature name if available
    if (this.currentUser?.signatureName) {
      instructions += `\n\nBeende die E-Mail mit "Mit freundlichen Grüßen" gefolgt von dem Namen "${this.currentUser.signatureName}".`;
    }
    
    const dto: GenerateEmailDto = {
      originalEmail: {
        subject: this.email.subject,
        from: this.email.fromName || this.email.fromAddress,
        body: this.email.textBody || this.stripHtml(this.email.htmlBody || '')
      },
      tone: this.gptTone,
      instructions: instructions,
      templateId: this.selectedTemplate.id
    };

    this.api.generateEmailWithGPT(dto).subscribe({
      next: (result) => {
        this.saveToHistory();
        this.replySubject = result.subject;
        this.replyBody = result.body;
        this.generatingGPT = false;
        this.toasts.success(`Vorlage "${this.selectedTemplate!.name}" angepasst`);
        this.currentStep = 'edit';
      },
      error: (err) => {
        console.error('GPT Fehler:', err);
        this.toasts.error('Fehler bei der KI-Generierung');
        this.generatingGPT = false;
      }
    });
  }

  // Insert template as-is without AI
  insertTemplateRaw(): void {
    if (!this.selectedTemplate) return;
    
    this.saveToHistory();
    this.replyBody = this.selectedTemplate.body;
    if (this.selectedTemplate.subject) {
      this.replySubject = this.selectedTemplate.subject;
    }
    this.toasts.success('Vorlage eingefügt (ohne KI-Anpassung)');
    this.currentStep = 'edit';
  }

  // ==================== AI GENERATION ====================

  generateWithGPT(): void {
    if (!this.email) return;

    this.generatingGPT = true;
    
    // Build instructions including user's signature name
    let fullInstructions = this.gptInstructions || '';
    if (this.currentUser?.signatureName) {
      const nameInstruction = `Beende die E-Mail mit "Mit freundlichen Grüßen" gefolgt von dem Namen "${this.currentUser.signatureName}".`;
      fullInstructions = fullInstructions ? `${fullInstructions}\n\n${nameInstruction}` : nameInstruction;
    }
    
    const dto: GenerateEmailDto = {
      originalEmail: {
        subject: this.email.subject,
        from: this.email.fromName || this.email.fromAddress,
        body: this.email.textBody || this.stripHtml(this.email.htmlBody || '')
      },
      tone: this.gptTone,
      instructions: fullInstructions || undefined,
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

  getSenderInitials(): string {
    if (!this.email) return '?';
    
    if (this.email.fromName) {
      const parts = this.email.fromName.trim().split(/\s+/);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      }
      return this.email.fromName.substring(0, 2).toUpperCase();
    }
    
    // Fallback to email address
    const emailPart = this.email.fromAddress.split('@')[0];
    return emailPart.substring(0, 2).toUpperCase();
  }

  getSenderName(): string {
    if (!this.email) return 'Unbekannt';
    return this.email.fromName || this.email.fromAddress.split('@')[0];
  }

  getWordCount(): number {
    return this.replyBody.trim().split(/\s+/).filter(w => w.length > 0).length;
  }

  /**
   * Get the full preview including the user's email signature (text only, no HTML)
   */
  getFullPreview(): string {
    let preview = this.replyBody;
    
    // Add signature if user has one (strip HTML for plain text preview)
    if (this.currentUser?.emailSignature && this.currentUser.emailSignature.trim()) {
      const plainSignature = this.stripHtml(this.currentUser.emailSignature);
      preview += '\n\n' + plainSignature;
    }
    
    return preview;
  }

  /**
   * Check if the signature contains HTML tags
   */
  isSignatureHtml(): boolean {
    if (!this.currentUser?.emailSignature) return false;
    return /<[a-z][\s\S]*>/i.test(this.currentUser.emailSignature);
  }

  /**
   * Get the signature for HTML rendering
   */
  getSignatureHtml(): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(this.currentUser?.emailSignature || '');
  }

  // ==================== SPEECH RECOGNITION ====================

  initSpeechRecognition(): void {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      this.speechSupported = true;
      this.speechRecognition = new SpeechRecognition();
      this.speechRecognition.continuous = true;
      this.speechRecognition.interimResults = true;
      this.speechRecognition.lang = 'de-DE';

      this.speechRecognition.onresult = (event: any) => {
        let interimText = '';
        let finalText = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalText += transcript;
          } else {
            interimText += transcript;
          }
        }

        // If we have final text, add it to the base
        if (finalText) {
          if (this.baseInstructions.trim()) {
            this.baseInstructions += ' ' + finalText;
          } else {
            this.baseInstructions = finalText;
          }
        }

        // Update the display: base (finalized) + interim (in progress)
        this.interimTranscript = interimText;
        
        // Update the correct target field
        const fullText = this.baseInstructions + (interimText ? ' ' + interimText : '');
        if (this.currentSpeechTarget === 'customizeInstructions') {
          this.customizeInstructions = fullText;
        } else {
          this.gptInstructions = fullText;
        }
      };

      this.speechRecognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        this.isListening = false;
        this.interimTranscript = '';
        if (event.error === 'not-allowed') {
          this.toasts.error('Mikrofonzugriff wurde verweigert');
        }
      };

      this.speechRecognition.onend = () => {
        // Only set to false if we didn't manually stop it
        if (this.isListening) {
          // Restart if still listening (continuous mode workaround)
          this.speechRecognition.start();
        }
      };
    }
  }

  toggleSpeechRecognition(): void {
    if (!this.speechSupported) {
      this.toasts.warning('Spracherkennung wird von deinem Browser nicht unterstützt');
      return;
    }

    if (this.isListening) {
      this.stopListening();
    } else {
      this.startListening('gptInstructions');
    }
  }

  toggleSpeechRecognitionForCustomize(): void {
    if (!this.speechSupported) {
      this.toasts.warning('Spracherkennung wird von deinem Browser nicht unterstützt');
      return;
    }

    if (this.isListening) {
      this.stopListeningForCustomize();
    } else {
      this.startListening('customizeInstructions');
    }
  }

  currentSpeechTarget: 'gptInstructions' | 'customizeInstructions' = 'gptInstructions';

  startListening(target: 'gptInstructions' | 'customizeInstructions' = 'gptInstructions'): void {
    if (!this.speechRecognition) {
      this.initSpeechRecognition();
    }
    
    try {
      this.currentSpeechTarget = target;
      // Store current text as base for appending
      this.baseInstructions = target === 'gptInstructions' ? this.gptInstructions : this.customizeInstructions;
      this.interimTranscript = '';
      this.isListening = true;
      this.speechRecognition.start();
      this.toasts.info('Spracherkennung aktiv - sprich jetzt...');
    } catch (e) {
      console.error('Error starting speech recognition:', e);
      this.isListening = false;
    }
  }

  stopListening(): void {
    this.isListening = false;
    this.isProcessingSpeech = true;
    
    if (this.speechRecognition) {
      this.speechRecognition.stop();
    }
    
    // Short delay to finalize, then update the text
    setTimeout(() => {
      this.gptInstructions = this.baseInstructions;
      this.interimTranscript = '';
      this.isProcessingSpeech = false;
    }, 500);
  }

  stopListeningForCustomize(): void {
    this.isListening = false;
    this.isProcessingSpeech = true;
    
    if (this.speechRecognition) {
      this.speechRecognition.stop();
    }
    
    // Short delay to finalize, then update the text
    setTimeout(() => {
      this.customizeInstructions = this.baseInstructions;
      this.interimTranscript = '';
      this.isProcessingSpeech = false;
    }, 500);
  }

  /**
   * Check if user has a signature configured
   */
  hasSignature(): boolean {
    return !!(this.currentUser?.emailSignature && this.currentUser.emailSignature.trim().length > 0);
  }

  // ==================== AI AGENT ANALYSIS ====================

  analyzeWithAgent(): void {
    if (!this.email || this.analyzing) return;

    this.analyzing = true;
    this.analysisSteps = [];
    this.analysisSummary = '';
    this.suggestedReply = '';
    this.analysisError = '';
    this.analysisContextApplied = false;
    this.analysisKeyFacts = [];
    this.showAnalysisDetails = false;
    this.showAnalysisPanel = true;
    this.feedCollapsed = false;
    this.customerPhone = '';

    const token = localStorage.getItem('access_token');
    const url = `${this.configService.apiUrl}/api/ai/analyze?emailId=${this.emailId}&token=${token}`;

    this.closeAnalysisStream();
    
    this.analysisEventSource = new EventSource(url);

    this.analysisEventSource.onmessage = (event) => {
      this.ngZone.run(() => {
        try {
          const step: AnalysisStep = JSON.parse(event.data);
          this.handleAnalysisStep(step);
        } catch (e) {
          console.error('Failed to parse SSE event:', e);
        }
      });
    };

    this.analysisEventSource.onerror = () => {
      this.ngZone.run(() => {
        if (this.analyzing) {
          // Only show error if we haven't completed naturally
          if (!this.analysisSummary) {
            this.analysisError = 'Verbindung zur Analyse unterbrochen';
            this.toasts.error('Analyse-Verbindung unterbrochen');
          }
          this.analyzing = false;
          this.closeAnalysisStream();
        }
      });
    };
  }

  private handleAnalysisStep(step: AnalysisStep): void {
    switch (step.type) {
      case 'start':
        this.analysisSteps.push(step);
        break;

      case 'tool_call':
        this.analysisSteps.push(step);
        break;

      case 'tool_result':
        // Replace matching tool_call's status or add result
        const callIdx = [...this.analysisSteps].reverse()
          .findIndex(s => s.type === 'tool_call' && s.tool === step.tool && s.status === 'running');
        if (callIdx >= 0) {
          const actualIdx = this.analysisSteps.length - 1 - callIdx;
          this.analysisSteps[actualIdx] = { ...this.analysisSteps[actualIdx], status: 'done' };
        }
        this.analysisSteps.push(step);
        break;

      case 'complete':
        this.analysisSteps.push(step);
        this.analyzing = false;
        this.feedCollapsed = true; // Collapse feed to show results
        this.closeAnalysisStream();
        this.parseAnalysisResult(step.content || '');
        break;

      case 'error':
        this.analysisSteps.push(step);
        this.analysisError = step.content || 'Unbekannter Fehler';
        this.analyzing = false;
        this.closeAnalysisStream();
        this.toasts.error('Analyse fehlgeschlagen');
        break;
    }
  }

  private parseAnalysisResult(content: string): void {
    this.analysisSummary = content;
    
    // Try to extract suggested reply from the analysis
    const replyMatch = content.match(/(?:Antwortvorschlag|Vorgeschlagene Antwort)[:\s]*\n([\s\S]+?)(?:\n\n---|\n\n##|$)/i);
    if (replyMatch) {
      this.suggestedReply = replyMatch[1].trim();
    }

    // Extract human-readable key facts from the analysis
    this.extractKeyFacts(content);

    // Pack the analysis context into gptInstructions so the KI uses it
    this.applyAnalysisContext(content);
    this.toasts.success('Kundendaten geladen — Kontext übernommen');
  }

  private applyAnalysisContext(content: string): void {
    // Build compact context block from analysis
    const contextBlock = `[JTL-KUNDENKONTEXT]\n${content.substring(0, 2000)}\n[/JTL-KUNDENKONTEXT]`;

    // Prepend to existing instructions or set as new
    if (this.gptInstructions.trim() && !this.gptInstructions.includes('[JTL-KUNDENKONTEXT]')) {
      this.gptInstructions = contextBlock + '\n\n' + this.gptInstructions;
    } else if (this.gptInstructions.includes('[JTL-KUNDENKONTEXT]')) {
      // Replace existing context block
      this.gptInstructions = this.gptInstructions.replace(
        /\[JTL-KUNDENKONTEXT\][\s\S]*?\[\/JTL-KUNDENKONTEXT\]/,
        contextBlock
      );
    } else {
      this.gptInstructions = contextBlock;
    }

    this.analysisContextApplied = true;
  }

  useSuggestedReply(): void {
    if (!this.suggestedReply) return;
    this.saveToHistory();
    this.replyBody = this.suggestedReply;
    this.toasts.success('Vorgeschlagene Antwort übernommen');
    // Navigate to edit step
    this.useTemplate = false;
    this.currentStep = 'edit';
  }

  closeAnalysisStream(): void {
    if (this.analysisEventSource) {
      this.analysisEventSource.close();
      this.analysisEventSource = null;
    }
  }

  /** Returns a simple, human-readable message for the current analysis activity */
  getCurrentActivityMessage(): string {
    // Find the last tool_call that's still running
    const lastRunningCall = [...this.analysisSteps].reverse().find(s => s.type === 'tool_call' && s.status === 'running');
    if (lastRunningCall?.tool) {
      const messages: Record<string, string> = {
        'find_customer': 'Kundendaten werden gesucht…',
        'find_customer_by_email': 'Kunde wird per E-Mail-Adresse gesucht…',
        'get_customer_orders': 'Bestellungen werden geladen…',
        'get_order_details': 'Bestelldetails werden abgerufen…',
        'get_order_shipping': 'Versandstatus wird geprüft…',
        'get_order_invoice': 'Rechnungsdaten werden geladen…',
        'get_customer_tickets': 'Support-Tickets werden gesucht…',
        'get_customer_full_context': 'Kundenprofil wird geladen…',
      };
      return messages[lastRunningCall.tool] || 'Daten werden abgerufen…';
    }

    // Count completed tools
    const doneCount = this.analysisSteps.filter(s => s.type === 'tool_result').length;
    if (doneCount > 0) {
      return `${doneCount} Abfrage${doneCount > 1 ? 'n' : ''} erledigt – Ergebnis wird zusammengefasst…`;
    }

    return 'Analyse wird vorbereitet…';
  }

  /** Visible steps for the live feed — show both calls and results */
  getVisibleSteps(): AnalysisStep[] {
    return this.analysisSteps.filter(s =>
      s.type === 'tool_call' || s.type === 'tool_result' || s.type === 'complete' || s.type === 'error'
    );
  }

  /** Toggle feed collapsed/expanded */
  toggleFeedCollapsed(): void {
    this.feedCollapsed = !this.feedCollapsed;
  }

  /** TrackBy for ngFor */
  trackStep(index: number, step: AnalysisStep): string {
    return `${index}-${step.type}-${step.tool || ''}-${step.status}`;
  }

  /** Check if there's a currently running tool call */
  hasRunningToolCall(): boolean {
    return this.analysisSteps.some(s => s.type === 'tool_call' && s.status === 'running');
  }

  /** Icon for the live feed */
  getStepFeedIcon(step: AnalysisStep): string {
    if (step.status === 'running') return 'progress_activity';
    if (step.status === 'error') return 'error_outline';
    if (step.type === 'complete') return 'task_alt';

    const icons: Record<string, string> = {
      'find_customer': 'person_search',
      'find_customer_by_email': 'contact_mail',
      'get_customer_orders': 'shopping_cart',
      'get_order_details': 'receipt_long',
      'get_order_shipping': 'local_shipping',
      'get_order_invoice': 'request_quote',
      'get_customer_tickets': 'confirmation_number',
      'get_customer_full_context': 'account_circle',
    };
    if (step.type === 'tool_result') return 'check_circle';
    return icons[step.tool || ''] || 'build';
  }

  /** Human-readable message for the live feed */
  getStepFeedMessage(step: AnalysisStep): string {
    if (step.type === 'complete') return 'Analyse abgeschlossen — Ergebnisse stehen bereit';
    if (step.type === 'error') return step.content || 'Fehler bei der Analyse';

    const toolMessages: Record<string, { running: string; done: string }> = {
      'find_customer': { running: 'Kundendatenbank wird durchsucht…', done: 'Kunde in JTL-Wawi gefunden' },
      'find_customer_by_email': { running: 'E-Mail-Adresse wird in JTL abgeglichen…', done: 'Kundenkonto per E-Mail identifiziert' },
      'get_customer_orders': { running: 'Bestellhistorie wird abgerufen…', done: 'Bestellhistorie geladen' },
      'get_order_details': { running: 'Bestellpositionen & Details werden geladen…', done: 'Bestelldetails vollständig' },
      'get_order_shipping': { running: 'Versandstatus & Tracking wird geprüft…', done: 'Versandinformationen geladen' },
      'get_order_invoice': { running: 'Rechnungen & Zahlungsstatus werden geprüft…', done: 'Rechnungsdaten geladen' },
      'get_customer_tickets': { running: 'Offene Support-Tickets werden gesucht…', done: 'Ticket-Übersicht geladen' },
      'get_customer_full_context': { running: 'Komplettes Kundenprofil wird zusammengestellt…', done: 'Kundenprofil vollständig geladen' },
    };

    const tool = step.tool || '';
    const msg = toolMessages[tool];
    if (msg) {
      return step.type === 'tool_call' ? msg.running : msg.done;
    }
    return step.type === 'tool_call' ? 'Daten werden abgerufen…' : 'Daten geladen';
  }

  /** Detailed info for tool results in the live feed */
  getStepFeedDetail(step: AnalysisStep): string {
    const result = step.result;
    if (!result) return '';
    if (result.error) return `⚠ ${result.error}`;

    // Extract phone numbers from customer results
    if (step.tool === 'find_customer_by_email' || step.tool === 'find_customer' || step.tool === 'get_customer_full_context') {
      const customer = Array.isArray(result) ? result[0] : result;
      if (customer) {
        // Capture phone number for call button
        const phone = customer.cTel || customer.cMobil || '';
        if (phone && !this.customerPhone) {
          this.customerPhone = phone.trim();
        }
      }
    }

    if (Array.isArray(result)) {
      if (result.length === 0) return 'Keine Ergebnisse gefunden';
      const first = result[0];

      // Customer results
      if (first?.cFirma || first?.cName) {
        const name = first.cFirma || `${first.cVorname || ''} ${first.cName || ''}`.trim();
        const extra = first.cMail ? ` · ${first.cMail}` : '';
        return `${result.length} Treffer – ${name}${extra}`;
      }

      // Order list
      if (first?.cAuftragsNr) {
        const latest = first.cAuftragsNr;
        const total = result.reduce((s: number, o: any) => s + (parseFloat(o.fWertBrutto) || 0), 0);
        return `${result.length} Aufträge · zuletzt ${latest}${total ? ` · Gesamt €${total.toFixed(2)}` : ''}`;
      }

      // Shipping results
      if (first?.TrackingNummer || first?.VersandStatus) {
        return `${first.VersandStatus || 'Status unbekannt'}${first.TrackingNummer ? ` · Tracking: ${first.TrackingNummer}` : ''}`;
      }

      // Invoice results
      if (first?.cRechnungsnr) {
        return `Rechnung ${first.cRechnungsnr} · ${first.ZahlungsStatus || 'Status unbekannt'}`;
      }

      // Tickets
      if (first?.TicketNr) {
        const open = result.filter((t: any) => t.TicketStatus === 'Offen').length;
        return `${result.length} Tickets · ${open} offen`;
      }

      return `${result.length} Ergebnis${result.length > 1 ? 'se' : ''}`;
    }

    if (typeof result === 'object') {
      // Single customer
      if (result.kKunde) {
        const name = result.cFirma || `${result.cVorname || ''} ${result.cName || ''}`.trim();
        const parts = [`#${result.cKundenNr || result.kKunde}`, name];
        if (result.cOrt) parts.push(result.cOrt);
        if (result.AnzahlAuftraege) parts.push(`${result.AnzahlAuftraege} Aufträge`);
        if (result.GesamtUmsatz) parts.push(`€${parseFloat(result.GesamtUmsatz).toFixed(2)} Umsatz`);
        return parts.join(' · ');
      }
      // Order details
      if (result.header?.cAuftragsNr) {
        const h = result.header;
        return `${h.cAuftragsNr} · ${result.positions?.length || 0} Positionen · €${parseFloat(h.fWertBrutto || 0).toFixed(2)}`;
      }
    }
    return '';
  }

  /** Extract structured Steckbrief-style facts from the analysis summary */
  private extractKeyFacts(content: string): void {
    this.analysisKeyFacts = [];

    // Try to extract Kunde
    const kundeMatch = content.match(/\*?\*?Kunde\*?\*?[:\s]+(.+)/i);
    if (kundeMatch) {
      this.analysisKeyFacts.push({ icon: 'person', label: 'Kunde', value: kundeMatch[1].trim().replace(/\*\*/g, '').split('\n')[0] });
    }

    // Kundennummer
    const knrMatch = content.match(/(?:Kundennummer|KundenNr|cKundenNr)[:\s#]*(\S+)/i);
    if (knrMatch) {
      this.analysisKeyFacts.push({ icon: 'badge', label: 'Kd-Nr.', value: knrMatch[1].trim().replace(/\*\*/g, '') });
    }

    // Firma
    const firmaMatch = content.match(/(?:Firma|Unternehmen|cFirma)[:\s]+([^\n,]+)/i);
    if (firmaMatch && !kundeMatch?.[1]?.includes(firmaMatch[1].trim())) {
      this.analysisKeyFacts.push({ icon: 'business', label: 'Firma', value: firmaMatch[1].trim().replace(/\*\*/g, '') });
    }

    // Ort / Adresse
    const ortMatch = content.match(/(?:Ort|Stadt|PLZ)[:\s]+([^\n]+)/i);
    if (ortMatch) {
      this.analysisKeyFacts.push({ icon: 'location_on', label: 'Ort', value: ortMatch[1].trim().replace(/\*\*/g, '') });
    }

    // Telefon from analysis text or from tool results
    if (this.customerPhone) {
      this.analysisKeyFacts.push({ icon: 'phone', label: 'Telefon', value: this.customerPhone });
    } else {
      const telMatch = content.match(/(?:Telefon|Tel|Mobil|cTel|cMobil)[:\s]+([\d\s+\-/()]+)/i);
      if (telMatch && telMatch[1].trim().length >= 5) {
        this.customerPhone = telMatch[1].trim();
        this.analysisKeyFacts.push({ icon: 'phone', label: 'Telefon', value: this.customerPhone });
      }
    }

    // Kunde seit
    const seitMatch = content.match(/(?:Kunde seit|KundeSeit|Registriert)[:\s]+([^\n,]+)/i);
    if (seitMatch) {
      this.analysisKeyFacts.push({ icon: 'calendar_today', label: 'Kunde seit', value: seitMatch[1].trim().replace(/\*\*/g, '') });
    }

    // Anliegen
    const anliegenMatch = content.match(/\*?\*?Anliegen\*?\*?[:\s]+(.+)/i);
    if (anliegenMatch) {
      this.analysisKeyFacts.push({ icon: 'help_outline', label: 'Anliegen', value: anliegenMatch[1].trim().replace(/\*\*/g, '').split('\n')[0] });
    }

    // Bestellungen count
    const orderMatch = content.match(/(?:Auftr[aä]g|Bestellung)[^\n]*?(\d+\s*(?:Auftr[aä]g|Bestellung))/i);
    if (orderMatch) {
      this.analysisKeyFacts.push({ icon: 'shopping_cart', label: 'Bestellungen', value: orderMatch[1].trim() });
    } else {
      const orderNums = content.match(/(?:Auftrag|Bestellung|cBestellNr)[^\n]*?[A-Z]*\d{4,}/gi);
      if (orderNums && orderNums.length > 0) {
        this.analysisKeyFacts.push({ icon: 'shopping_cart', label: 'Bestellungen', value: `${orderNums.length} gefunden` });
      }
    }

    // Umsatz
    const umsatzMatch = content.match(/(?:Gesamt[Uu]msatz|Umsatz)[:\s]*[€]?\s*([\d.,]+)/i);
    if (umsatzMatch) {
      this.analysisKeyFacts.push({ icon: 'payments', label: 'Umsatz', value: `€${umsatzMatch[1].trim()}` });
    }

    // Offene Tickets
    const ticketMatch = content.match(/(?:Offene?\s*Tickets?)[:\s]*(\d+)/i);
    if (ticketMatch && parseInt(ticketMatch[1]) > 0) {
      this.analysisKeyFacts.push({ icon: 'confirmation_number', label: 'Offene Tickets', value: ticketMatch[1] });
    }

    // Empfohlene Aktion
    const aktionMatch = content.match(/\*?\*?Empfohlene Aktion\*?\*?[:\s]+(.+)/i);
    if (aktionMatch) {
      this.analysisKeyFacts.push({ icon: 'lightbulb', label: 'Empfehlung', value: aktionMatch[1].trim().replace(/\*\*/g, '').split('\n')[0] });
    }

    // If no facts extracted, add a generic one
    if (this.analysisKeyFacts.length === 0) {
      this.analysisKeyFacts.push({ icon: 'info', label: 'Status', value: 'Kundenkontext wurde geladen' });
    }
  }

  // ==================== ATTACHMENT PREVIEW ====================

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
    if (!this.email) return;

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
        this.toasts.success('Download gestartet');
      },
      error: (err) => {
        console.error('Download failed:', err);
        this.toasts.error('Download fehlgeschlagen');
      }
    });
  }

  getAttachmentIcon(contentType: string): string {
    const type = contentType.toLowerCase();
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
}
