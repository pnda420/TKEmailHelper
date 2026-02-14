import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { trigger, transition, style, animate, state } from '@angular/animations';
import { AngularSplitModule } from 'angular-split';
import { ApiService, Email, EmailTemplate, GenerateEmailDto, ReviseEmailDto, Mailbox } from '../../api/api.service';
import { ToastService } from '../../shared/toasts/toast.service';
import { AttachmentPreviewComponent, AttachmentInfo } from '../../shared/attachment-preview/attachment-preview.component';
import { ConfigService } from '../../services/config.service';
import { AuthService, User } from '../../services/auth.service';

type WorkflowStep = 'select' | 'customize' | 'edit' | 'send';

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

  // Dynamic steps based on template usage and draft availability
  get steps(): WorkflowStep[] {
    if (this.hasDraft) {
      // Pre-computed draft: skip select, go directly to edit → send
      return ['edit', 'send'];
    }
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
  
  // AI Agent Analysis (pre-computed from batch processing)
  analysisSummary = '';
  suggestedReply = '';
  suggestedReplySubject = '';
  showAnalysisPanel = false;
  analysisContextApplied = false;
  showAnalysisDetails = false;
  analysisKeyFacts: { icon: string; label: string; value: string }[] = [];
  analysisFactSections: { title: string; icon: string; facts: { icon: string; label: string; value: string; copyable?: boolean; link?: string }[] }[] = [];
  customerPhone = '';
  
  // Pre-computed draft state
  hasDraft = false;       // true when a pre-computed reply was loaded
  draftEdited = false;    // true when user has modified the draft

  // Mailbox signature (resolved from mailbox template)
  mailboxSignature = '';
  
  // Revision feature
  originalReplyBody = ''; // Stores the original AI-generated reply for diff tracking
  originalReplySubject = '';
  revisionInstructions = ''; // TTS/text instructions for revision
  revisingReply = false;     // Loading state for revision
  showDiffView = false;      // Toggle diff highlighting
  revisionCount = 0;         // Track how many revisions were made

  // Responsive layout
  splitDirection: 'horizontal' | 'vertical' = 'horizontal';
  isSmallScreen = false;

  // AI animation state
  scrambleDisplayText = '';
  private scrambleInterval: any;
  private scrambleTargetText = '';
  private scrambleChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&!?<>{}[]|/\\~äöüß';
  
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
    private sanitizer: DomSanitizer
  ) {}

  @HostListener('window:resize')
  onResize(): void {
    this.checkScreenSize();
  }

  private checkScreenSize(): void {
    const width = window.innerWidth;
    this.isSmallScreen = width < 1100;
    this.splitDirection = width < 1100 ? 'vertical' : 'horizontal';
  }

  ngOnInit(): void {
    this.checkScreenSize();
    this.emailId = this.route.snapshot.params['id'];
    this.loadEmail();
    this.loadTemplates();
    this.initSpeechRecognition();
    
    // Subscribe to current user for signature
    this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;
    });

    // Lock email so no other user can open it
    this.lockCurrentEmail();
  }

  @HostListener('window:beforeunload')
  onBeforeUnload(): void {
    // Use fetch+keepalive so the unlock survives page reload
    if (this.emailId) {
      this.api.unlockEmailSync(this.emailId);
    }
  }

  private lockCurrentEmail(): void {
    if (!this.emailId) return;
    this.api.lockEmail(this.emailId).subscribe({
      next: (res: any) => {
        if (!res.locked) {
          this.toasts.error(`Diese E-Mail wird bereits von ${res.lockedByName || 'einem anderen Benutzer'} bearbeitet`);
          this.router.navigate(['/emails']);
        }
      },
      error: () => {
        this.toasts.error('Fehler beim Sperren der E-Mail');
      }
    });
  }

  private unlockCurrentEmail(): void {
    if (!this.emailId) return;
    this.api.unlockEmail(this.emailId).subscribe();
  }

  setTone(tone: 'professional' | 'friendly' | 'formal' | 'casual'): void {
    this.gptTone = tone;
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.stopListening();
    this.stopInsaneAnimation();
    this.unlockCurrentEmail();
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
        
        // Load mailbox signature if email has a mailboxId
        if (email.mailboxId) {
          this.loadMailboxSignature(email.mailboxId);
        }
        
        // Analyze email for template suggestions and get summary
        this.analyzeEmailForSuggestions();
        this.loadEmailSummary();
        
        // Load pre-computed agent analysis from DB
        this.loadAgentAnalysis();
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
        this.originalReplyBody = result.body;
        this.originalReplySubject = result.subject;
        this.revisionCount = 0;
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
        this.originalReplyBody = result.body;
        this.originalReplySubject = result.subject;
        this.revisionCount = 0;
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
        this.originalReplyBody = result.body;
        this.originalReplySubject = result.subject;
        this.revisionCount = 0;
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
    this.startInsaneAnimation('Feinschliff wird angewendet…');
    
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
        this.stopInsaneAnimation();
        this.toasts.success('Text wurde poliert');
      },
      error: (err) => {
        console.error('Polish Fehler:', err);
        this.toasts.error('Fehler beim Polieren');
        this.polishingGPT = false;
        this.stopInsaneAnimation();
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
      emailId: this.email.id,
      to: this.email.fromAddress,
      subject: this.replySubject,
      body: this.replyBody,
      inReplyTo: this.email.messageId,
      references: this.email.references || this.email.messageId,
      originalFrom: this.email.fromName
        ? `${this.email.fromName} <${this.email.fromAddress}>`
        : this.email.fromAddress,
      originalDate: this.email.receivedAt?.toString(),
      originalHtmlBody: this.email.htmlBody || undefined,
      originalTextBody: this.email.textBody || undefined,
      mailboxId: this.email.mailboxId || undefined,
    }).subscribe({
      next: () => {
        this.toasts.success('E-Mail wurde gesendet und archiviert!');
        this.sendingReply = false;
        this.unlockCurrentEmail();
        this.router.navigate(['/emails']);
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
        this.unlockCurrentEmail();
        this.router.navigate(['/emails']);
      },
      error: (err) => {
        console.error('Fehler:', err);
        this.toasts.error('Fehler beim Verschieben');
      }
    });
  }

  cancel(): void {
    this.unlockCurrentEmail();
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
   * Get the full preview including the mailbox email signature (text only, no HTML)
   */
  getFullPreview(): string {
    let preview = this.replyBody;
    
    if (this.mailboxSignature && this.mailboxSignature.trim()) {
      const plainSignature = this.stripHtml(this.mailboxSignature);
      preview += '\n\n' + plainSignature;
    }
    
    return preview;
  }

  /**
   * Check if the signature contains HTML tags
   */
  isSignatureHtml(): boolean {
    if (!this.mailboxSignature) return false;
    return /<[a-z][\s\S]*>/i.test(this.mailboxSignature);
  }

  /**
   * Get the signature for HTML rendering
   */
  getSignatureHtml(): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(this.mailboxSignature || '');
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
        } else if (this.currentSpeechTarget === 'revisionInstructions') {
          this.revisionInstructions = fullText;
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

  currentSpeechTarget: 'gptInstructions' | 'customizeInstructions' | 'revisionInstructions' = 'gptInstructions';

  startListening(target: 'gptInstructions' | 'customizeInstructions' | 'revisionInstructions' = 'gptInstructions'): void {
    if (!this.speechRecognition) {
      this.initSpeechRecognition();
    }
    
    try {
      this.currentSpeechTarget = target;
      // Store current text as base for appending
      this.baseInstructions = target === 'gptInstructions' 
        ? this.gptInstructions 
        : target === 'customizeInstructions' 
          ? this.customizeInstructions 
          : this.revisionInstructions;
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

  toggleSpeechRecognitionForRevision(): void {
    if (!this.speechSupported) {
      this.toasts.warning('Spracherkennung wird von deinem Browser nicht unterstützt');
      return;
    }

    if (this.isListening && this.currentSpeechTarget === 'revisionInstructions') {
      this.stopListeningForRevision();
    } else {
      this.startListening('revisionInstructions');
    }
  }

  stopListeningForRevision(): void {
    this.isListening = false;
    this.isProcessingSpeech = true;
    
    if (this.speechRecognition) {
      this.speechRecognition.stop();
    }
    
    setTimeout(() => {
      this.revisionInstructions = this.baseInstructions;
      this.interimTranscript = '';
      this.isProcessingSpeech = false;
    }, 500);
  }

  // ==================== REVISION FEATURE ====================

  /**
   * Check if the user has made edits to the reply body compared to the original
   */
  get hasUserEdits(): boolean {
    return this.originalReplyBody.trim() !== '' && this.replyBody.trim() !== this.originalReplyBody.trim();
  }

  /**
   * Compute a simple word-level diff between original and current reply.
   * Returns an array of { text, type } segments where type is 'same', 'added', or 'removed'.
   */
  computeDiff(): { text: string; type: 'same' | 'added' | 'removed' }[] {
    if (!this.originalReplyBody) return [{ text: this.replyBody, type: 'same' }];
    
    const originalWords = this.originalReplyBody.split(/(\s+)/);
    const currentWords = this.replyBody.split(/(\s+)/);
    
    // Simple LCS-based diff
    const result: { text: string; type: 'same' | 'added' | 'removed' }[] = [];
    
    const m = originalWords.length;
    const n = currentWords.length;
    
    // For very long texts, fall back to a simpler line-based diff
    if (m * n > 500000) {
      return this.computeLineDiff();
    }
    
    // Build LCS table
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (originalWords[i - 1] === currentWords[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }
    
    // Backtrack to find diff
    let i = m, j = n;
    const segments: { text: string; type: 'same' | 'added' | 'removed' }[] = [];
    
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && originalWords[i - 1] === currentWords[j - 1]) {
        segments.unshift({ text: originalWords[i - 1], type: 'same' });
        i--; j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        segments.unshift({ text: currentWords[j - 1], type: 'added' });
        j--;
      } else {
        segments.unshift({ text: originalWords[i - 1], type: 'removed' });
        i--;
      }
    }
    
    // Merge consecutive segments of the same type
    for (const seg of segments) {
      if (result.length > 0 && result[result.length - 1].type === seg.type) {
        result[result.length - 1].text += seg.text;
      } else {
        result.push({ ...seg });
      }
    }
    
    return result;
  }

  private computeLineDiff(): { text: string; type: 'same' | 'added' | 'removed' }[] {
    const originalLines = this.originalReplyBody.split('\n');
    const currentLines = this.replyBody.split('\n');
    const result: { text: string; type: 'same' | 'added' | 'removed' }[] = [];
    
    const maxLen = Math.max(originalLines.length, currentLines.length);
    
    for (let i = 0; i < maxLen; i++) {
      const orig = i < originalLines.length ? originalLines[i] : undefined;
      const curr = i < currentLines.length ? currentLines[i] : undefined;
      
      if (orig === curr) {
        result.push({ text: orig + '\n', type: 'same' });
      } else {
        if (orig !== undefined) result.push({ text: orig + '\n', type: 'removed' });
        if (curr !== undefined) result.push({ text: curr + '\n', type: 'added' });
      }
    }
    
    return result;
  }

  /**
   * Auto-resize the revision textarea to fit content (up to max-height).
   */
  autoResizeRevisionInput(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }

  /**
   * Send revision request to AI with original, edited reply, and instructions
   */
  reviseReply(): void {
    if (!this.email || this.revisingReply) return;
    if (!this.revisionInstructions.trim() && !this.hasUserEdits) {
      this.toasts.warning('Bitte gib Anweisungen ein oder bearbeite den Text');
      return;
    }

    this.revisingReply = true;
    this.startInsaneAnimation('KI überarbeitet den Entwurf…');

    const dto: ReviseEmailDto = {
      originalEmail: {
        subject: this.email.subject,
        from: this.email.fromName || this.email.fromAddress,
        body: this.email.textBody || this.stripHtml(this.email.htmlBody || '')
      },
      originalReply: this.originalReplyBody,
      editedReply: this.replyBody,
      revisionInstructions: this.revisionInstructions,
      tone: this.gptTone,
      currentSubject: this.replySubject
    };

    this.api.reviseEmailWithGPT(dto).subscribe({
      next: (result) => {
        this.saveToHistory();
        this.replySubject = result.subject;
        this.replyBody = result.body;
        // Update original to the new version for continued diffing
        this.originalReplyBody = result.body;
        this.revisionInstructions = '';
        this.revisionCount++;
        this.revisingReply = false;
        this.stopInsaneAnimation();
        this.showDiffView = false;
        this.toasts.success('Antwort wurde überarbeitet');
      },
      error: (err) => {
        console.error('Revision error:', err);
        this.toasts.error('Fehler bei der Überarbeitung');
        this.revisingReply = false;
        this.stopInsaneAnimation();
      }
    });
  }

  /**
   * Check if user has a signature configured (via mailbox)
   */
  hasSignature(): boolean {
    return !!(this.mailboxSignature && this.mailboxSignature.trim().length > 0);
  }

  /**
   * Load and resolve mailbox signature with user data
   */
  private loadMailboxSignature(mailboxId: string): void {
    this.api.getMailbox(mailboxId).subscribe({
      next: (mailbox) => {
        if (mailbox.signatureTemplate) {
          // Resolve placeholders locally for preview
          let sig = mailbox.signatureTemplate;
          sig = sig.replace(/\{\{userName\}\}/g, this.currentUser?.signatureName || this.currentUser?.name || '');
          sig = sig.replace(/\{\{userPosition\}\}/g, this.currentUser?.signaturePosition || '');
          sig = sig.replace(/\{\{companyName\}\}/g, mailbox.companyName || '');
          sig = sig.replace(/\{\{companyPhone\}\}/g, mailbox.companyPhone || '');
          sig = sig.replace(/\{\{companyWebsite\}\}/g, mailbox.companyWebsite || '');
          sig = sig.replace(/\{\{companyAddress\}\}/g, mailbox.companyAddress || '');
          sig = sig.replace(/\{\{mailboxEmail\}\}/g, mailbox.email || '');
          this.mailboxSignature = sig;
        }
      },
      error: (err) => console.error('Failed to load mailbox for signature:', err)
    });
  }

  // ==================== AI AGENT ANALYSIS (Pre-computed) ====================

  /**
   * Load pre-computed agent analysis from the email entity.
   * No more live SSE — everything was computed during batch processing.
   */
  private loadAgentAnalysis(): void {
    if (!this.email) return;

    if (this.email.agentAnalysis) {
      this.analysisSummary = this.email.agentAnalysis;
      this.showAnalysisPanel = true;

      // Use pre-computed key facts if available, otherwise extract from raw text
      if (this.email.agentKeyFacts?.length) {
        this.analysisKeyFacts = this.email.agentKeyFacts;
      } else {
        this.extractKeyFacts(this.email.agentAnalysis);
      }
      this.buildFactSections();

      this.suggestedReply = this.email.suggestedReply || '';
      this.suggestedReplySubject = this.email.suggestedReplySubject || '';
      this.customerPhone = this.email.customerPhone || '';

      // Auto-apply JTL context to GPT instructions
      this.applyAnalysisContext(this.email.agentAnalysis);
    }

    // Auto-load pre-computed reply draft into editor and jump to edit step
    if (this.email.suggestedReply) {
      this.replyBody = this.email.suggestedReply;
      this.originalReplyBody = this.email.suggestedReply;
      if (this.email.suggestedReplySubject) {
        this.replySubject = this.email.suggestedReplySubject;
        this.originalReplySubject = this.email.suggestedReplySubject;
      }
      this.revisionCount = 0;
      this.hasDraft = true;
      this.draftEdited = false;
      this.useTemplate = false;
      this.currentStep = 'edit';
    }
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
    if (this.suggestedReplySubject) {
      this.replySubject = this.suggestedReplySubject;
    }
    this.toasts.success('Vorgeschlagene Antwort übernommen');
    // Navigate to edit step
    this.useTemplate = false;
    this.currentStep = 'edit';
  }

  /** User wants to start from scratch instead of using the pre-computed draft */
  startFromScratch(): void {
    this.hasDraft = false;
    this.replyBody = '';
    this.currentStep = 'select';
  }

  // ==================== AI TEXT SCRAMBLE ANIMATION ====================

  startInsaneAnimation(_label: string): void {
    this.scrambleTargetText = this.replyBody || ' ';
    this.scrambleDisplayText = this.scrambleTargetText;

    let tick = 0;
    this.scrambleInterval = setInterval(() => {
      tick++;
      this.scrambleDisplayText = this.scrambleTargetText
        .split('')
        .map((char, i) => {
          if (char === ' ' || char === '\n' || char === '\r' || char === '\t') return char;
          // Wave: brief moments of clarity sweep across the text
          const wave = (tick * 3 + i) % 28;
          if (wave < 3) return this.scrambleTargetText[i];
          return this.scrambleChars[Math.floor(Math.random() * this.scrambleChars.length)];
        })
        .join('');
    }, 45);
  }

  stopInsaneAnimation(): void {
    if (this.scrambleInterval) {
      clearInterval(this.scrambleInterval);
      this.scrambleInterval = null;
    }
    this.scrambleDisplayText = '';
  }

  /** Track when user modifies the draft body */
  onDraftChange(): void {
    if (this.hasDraft) {
      this.draftEdited = true;
    }
  }

  /** Sync the backdrop scroll position with the textarea */
  syncBackdropScroll(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement;
    const backdrop = textarea.parentElement?.querySelector('.editor-backdrop') as HTMLElement;
    if (backdrop) {
      backdrop.scrollTop = textarea.scrollTop;
      backdrop.scrollLeft = textarea.scrollLeft;
    }
  }

  /** Extract structured Steckbrief-style facts from the analysis summary (fallback if DB has none) */
  private extractKeyFacts(content: string): void {
    this.analysisKeyFacts = [];

    // Strict helper: only matches structured data lines, rejects sentence fragments
    const extractField = (pattern: RegExp, icon: string, label: string, maxLen = 60) => {
      const match = content.match(pattern);
      if (match) {
        let val = match[1].trim().replace(/\*\*/g, '').replace(/^-\s*/, '').split('\n')[0];
        if (val.length > maxLen) val = val.substring(0, maxLen) + '…';
        if (val.length >= 2 && !this.looksLikeSentenceFragment(val)) {
          this.analysisKeyFacts.push({ icon, label, value: val });
        }
      }
    };

    // --- Contact data ---
    extractField(/(?:^|\n)\s*[-*]*\s*\*?\*?Kunde\*?\*?[:\s]+([^\n]{2,60})/i, 'person', 'Kunde', 50);
    extractField(/(?:^|\n)\s*[-*]*\s*(?:Kundennummer|KundenNr|Kd-?Nr\.?)[:\s#]*(\d{3,10})/i, 'badge', 'Kd-Nr.', 20);
    extractField(/(?:^|\n)\s*[-*]*\s*\*?\*?(?:Firma|Unternehmen)\*?\*?[:\s]+([^\n,]{2,50})/i, 'business', 'Firma', 50);

    // E-Mail
    const emailMatch = content.match(/(?:E-?Mail|cMail)[:\s]+([\w.+-]+@[\w.-]+)/i);
    if (emailMatch) {
      this.analysisKeyFacts.push({ icon: 'mail', label: 'E-Mail', value: emailMatch[1].trim() });
    }

    // Phone
    if (this.customerPhone) {
      this.analysisKeyFacts.push({ icon: 'phone', label: 'Telefon', value: this.customerPhone });
    } else {
      const telMatch = content.match(/(?:Telefon|Tel\.?)[:\s]+([+\d][\d\s\-/()]{4,20})/i);
      if (telMatch && /\d{5,}/.test(telMatch[1].replace(/\s/g, ''))) {
        this.customerPhone = telMatch[1].trim();
        this.analysisKeyFacts.push({ icon: 'phone', label: 'Telefon', value: this.customerPhone });
      }
    }

    // Mobile
    const mobilMatch = content.match(/(?:Mobil|Handy)[:\s]+([+\d][\d\s\-/()]{4,20})/i);
    if (mobilMatch && /\d{5,}/.test(mobilMatch[1].replace(/\s/g, '')) && mobilMatch[1].trim() !== this.customerPhone) {
      this.analysisKeyFacts.push({ icon: 'smartphone', label: 'Mobil', value: mobilMatch[1].trim() });
    }

    // --- Address ---
    const streetMatch = content.match(/(?:^|\n)\s*[-*]*\s*\*?\*?(?:Stra[sß]e|Adresse)\*?\*?[:\s]+([A-ZÄÖÜ][a-zäöüßA-ZÄÖÜ\s.-]+\d[\w\s/-]*)/im);
    if (streetMatch) {
      const sv = streetMatch[1].trim().replace(/\*\*/g, '');
      if (sv.length >= 5 && sv.length <= 60 && !this.looksLikeSentenceFragment(sv)) {
        this.analysisKeyFacts.push({ icon: 'home', label: 'Straße', value: sv });
      }
    }

    const ortMatch = content.match(/(?:^|\n)\s*[-*]*\s*\*?\*?(?:Ort|Stadt|PLZ)\*?\*?[:\s]+(\d{4,5}\s+[A-ZÄÖÜa-zäöüß\s.-]{2,40})/im);
    if (ortMatch) {
      const ortVal = ortMatch[1].trim().replace(/\*\*/g, '');
      if (ortVal.length <= 50 && !this.looksLikeSentenceFragment(ortVal)) {
        this.analysisKeyFacts.push({ icon: 'location_on', label: 'Ort', value: ortVal });
      }
    }

    // --- Account info ---
    const seitMatch = content.match(/(?:Kunde seit|Registriert)[:\s]+([\d]{1,2}[./][\d]{1,2}[./][\d]{2,4}|\d{4})/i);
    if (seitMatch) {
      this.analysisKeyFacts.push({ icon: 'calendar_today', label: 'Kunde seit', value: seitMatch[1].trim() });
    }

    // --- Order & revenue data ---
    const umsatzMatch = content.match(/(?:Gesamt[Uu]msatz|Umsatz)[:\s]*[€]?\s*([\d.,]+\s*€?)/i);
    if (umsatzMatch) {
      const uVal = umsatzMatch[1].trim().replace(/€$/, '');
      if (/^[\d.,]+$/.test(uVal)) this.analysisKeyFacts.push({ icon: 'payments', label: 'Umsatz', value: `€${uVal}` });
    }

    const orderCountMatch = content.match(/(?:Anzahl\s*(?:Auftr[aä]ge|Bestellungen)|AnzahlAuftraege|Bestellungen)[:\s]*(\d+)/i);
    if (orderCountMatch) {
      this.analysisKeyFacts.push({ icon: 'shopping_cart', label: 'Bestellungen', value: orderCountMatch[1] });
    }

    const lastOrderMatch = content.match(/(?:Letzter?\s*(?:Auftrag|Bestellung))[:\s]+([\d]{1,2}[./][\d]{1,2}[./][\d]{2,4})/i);
    if (lastOrderMatch) {
      this.analysisKeyFacts.push({ icon: 'event', label: 'Letzte Bestellung', value: lastOrderMatch[1].trim() });
    }

    const payMatch = content.match(/(?:^|\n)\s*[-*]*\s*\*?\*?Zahlungsart\*?\*?[:\s]+([^\n]{2,30})/im);
    if (payMatch) {
      const pv = payMatch[1].trim().replace(/\*\*/g, '');
      if (pv.length <= 30 && !this.looksLikeSentenceFragment(pv)) {
        this.analysisKeyFacts.push({ icon: 'credit_card', label: 'Zahlungsart', value: pv });
      }
    }

    const trackMatch = content.match(/(?:Tracking|Sendungsnummer|Trackingnummer)[:\s]+([A-Za-z0-9\-]{8,40}(?:\s*\([^)]+\))?)/i);
    if (trackMatch) {
      this.analysisKeyFacts.push({ icon: 'local_shipping', label: 'Tracking', value: trackMatch[1].trim() });
    }

    const shipMatch = content.match(/(?:^|\n)\s*[-*]*\s*\*?\*?(?:Versandstatus|Lieferstatus)\*?\*?[:\s]+([^\n]{2,30})/im);
    if (shipMatch) {
      const shv = shipMatch[1].trim().replace(/\*\*/g, '');
      if (!this.looksLikeSentenceFragment(shv)) {
        this.analysisKeyFacts.push({ icon: 'package_2', label: 'Versandstatus', value: shv });
      }
    }

    const ticketMatch = content.match(/(?:Offene?\s*Tickets?)[:\s]*(\d+)/i);
    if (ticketMatch && parseInt(ticketMatch[1]) > 0) {
      this.analysisKeyFacts.push({ icon: 'confirmation_number', label: 'Offene Tickets', value: ticketMatch[1] });
    }

    // --- Request context ---
    const anliegenMatch = content.match(/(?:^|\n)\s*[-*]*\s*\*?\*?Anliegen\*?\*?[:\s]+([^\n]{5,120})/im);
    if (anliegenMatch) {
      let av = anliegenMatch[1].trim().replace(/\*\*/g, '').replace(/^-\s*/, '');
      if (av.length > 80) av = av.substring(0, 80) + '…';
      this.analysisKeyFacts.push({ icon: 'help', label: 'Anliegen', value: av });
    }

    const empfehlungMatch = content.match(/(?:^|\n)\s*[-*]*\s*\*?\*?(?:Empfohlene Aktion|Empfehlung)\*?\*?[:\s]+([^\n]{5,120})/im);
    if (empfehlungMatch) {
      let ev = empfehlungMatch[1].trim().replace(/\*\*/g, '').replace(/^-\s*/, '');
      if (ev.length > 80) ev = ev.substring(0, 80) + '…';
      this.analysisKeyFacts.push({ icon: 'recommend', label: 'Empfehlung', value: ev });
    }

    if (this.analysisKeyFacts.length === 0) {
      this.analysisKeyFacts.push({ icon: 'info', label: 'Status', value: 'Kundenkontext wurde geladen' });
    }
  }

  /** Check if a value looks like a sentence fragment rather than structured data */
  private looksLikeSentenceFragment(val: string): boolean {
    if (/\b(bestätigen|veranlassen|prüfen|anbieten|senden|kontaktieren|bitten|erstatten|sollte|muss|kann|wird|wurde|haben|nicht angekommen|ob \w+)\b/i.test(val)) {
      return true;
    }
    if (/^[a-zäöü]/.test(val) && val.length > 15) return true;
    if (val.split(/\s+/).length > 8 && !/[\d@]/.test(val)) return true;
    return false;
  }

  /** Build grouped sections from flat analysisKeyFacts for the sectioned UI */
  private buildFactSections(): void {
    this.analysisFactSections = [];

    // Define which labels belong to which section
    const contactLabels = ['Kunde', 'Kd-Nr.', 'Firma', 'E-Mail', 'Telefon', 'Mobil'];
    const addressLabels = ['Straße', 'Ort'];
    const accountLabels = ['Kunde seit', 'Sperre'];
    const orderLabels = ['Umsatz', 'Bestellungen', 'Letzte Bestellung', 'Zahlungsart', 'Tracking', 'Versandstatus', 'Offene Tickets'];
    const productLabels = ['Artikel', 'Artikelnr.', 'VK-Preis', 'Preis', 'Verfügbarkeit', 'Lagerbestand', 'Warengruppe', 'Bestellter Artikel', 'Bestellte Artikel'];
    const contextLabels = ['Anliegen', 'Empfehlung'];

    const copyableLabels = new Set(['E-Mail', 'Telefon', 'Mobil', 'Kd-Nr.', 'Tracking']);
    const linkLabels: Record<string, (v: string) => string> = {
      'E-Mail': (v) => `mailto:${v}`,
      'Telefon': (v) => `tel:${v}`,
      'Mobil': (v) => `tel:${v}`,
    };

    const buildSection = (title: string, icon: string, labels: string[]) => {
      const facts = this.analysisKeyFacts
        .filter(f => labels.includes(f.label))
        .map(f => ({
          ...f,
          copyable: copyableLabels.has(f.label),
          link: linkLabels[f.label]?.(f.value) || undefined,
        }));
      if (facts.length > 0) {
        this.analysisFactSections.push({ title, icon, facts });
      }
    };

    buildSection('Kontakt', 'person', contactLabels);
    buildSection('Adresse', 'location_on', addressLabels);
    buildSection('Konto', 'manage_accounts', accountLabels);
    buildSection('Bestellungen & Umsatz', 'shopping_cart', orderLabels);
    buildSection('Produkte', 'inventory_2', productLabels);
    buildSection('Anfrage', 'support_agent', contextLabels);

    // Catch any facts that don't fit into predefined sections
    const allKnownLabels = new Set([...contactLabels, ...addressLabels, ...accountLabels, ...orderLabels, ...productLabels, ...contextLabels]);
    const uncategorized = this.analysisKeyFacts.filter(f => !allKnownLabels.has(f.label));
    if (uncategorized.length > 0) {
      this.analysisFactSections.push({
        title: 'Weitere Infos',
        icon: 'info',
        facts: uncategorized.map(f => ({ ...f, copyable: false, link: undefined })),
      });
    }
  }

  copyToClipboard(value: string): void {
    navigator.clipboard.writeText(value).then(() => {
      this.toasts.success('Kopiert!');
    });
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
