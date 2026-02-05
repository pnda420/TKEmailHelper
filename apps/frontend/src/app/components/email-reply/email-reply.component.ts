import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { trigger, transition, style, animate, state } from '@angular/animations';
import { ApiService, Email, EmailTemplate, GenerateEmailDto } from '../../api/api.service';
import { ToastService } from '../../shared/toasts/toast.service';
import { AttachmentPreviewComponent, AttachmentInfo } from '../../shared/attachment-preview/attachment-preview.component';
import { ConfigService } from '../../services/config.service';
import { AuthService, User } from '../../services/auth.service';

type WorkflowStep = 'select' | 'customize' | 'generate' | 'polish' | 'send';

@Component({
  selector: 'app-email-reply',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, AttachmentPreviewComponent],
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
  steps: WorkflowStep[] = ['select', 'customize', 'generate', 'polish', 'send'];
  useTemplate = false; // Track if user wants to use a template
  
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
  
  // Current User (for signature)
  currentUser: User | null = null;
  
  // Speech Recognition
  isListening = false;
  isProcessingSpeech = false;
  speechRecognition: any = null;
  speechSupported = false;
  interimTranscript = ''; // For real-time display
  baseInstructions = ''; // Store finalized text
  
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
        
        // Analyze email for template suggestions
        this.analyzeEmailForSuggestions();
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

  analyzeEmailForSuggestions(): void {
    if (!this.email || this.templates.length === 0) return;

    // Use AI to recommend best template
    this.analyzingEmail = true;
    this.bestMatchTemplate = null;
    this.bestMatchReason = '';

    const emailBody = this.email.textBody || this.email.preview || '';
    
    this.api.getAITemplateRecommendation(this.email.subject, emailBody).subscribe({
      next: (recommendation) => {
        this.analyzingEmail = false;
        
        // Only show if confidence is high enough (> 50)
        if (recommendation.templateId && recommendation.confidence > 50) {
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
    if (sortedTemplates.length > 0 && sortedTemplates[0].score >= 2) {
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
    // Skip customize step, generate from scratch
    this.generateWithGPT();
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
      // Skip to generate step (step index 2)
      this.currentStep = 'generate';
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
        this.currentStep = 'generate';
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
    this.currentStep = 'generate';
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
