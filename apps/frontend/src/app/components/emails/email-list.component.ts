import { Component, OnInit, OnDestroy, NgZone, ViewChild, ElementRef, AfterViewChecked, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { trigger, transition, style, animate, stagger, query } from '@angular/animations';

export interface TerminalLogEntry {
  timestamp: Date;
  type: 'info' | 'success' | 'error' | 'progress' | 'system' | 'step' | 'warn';
  message: string;
  detail?: string;
}
import { ApiService, Email, Mailbox } from '../../api/api.service';
import { ToastService } from '../../shared/toasts/toast.service';
import { MailboxStateService } from '../../services/mailbox-state.service';
import { PageTitleComponent } from '../../shared/page-title/page-title.component';
import { AttachmentPreviewComponent, AttachmentInfo } from '../../shared/attachment-preview/attachment-preview.component';
import { ConfigService } from '../../services/config.service';
import { AuthService } from '../../services/auth.service';
import { ConfirmationService } from '../../shared/confirmation/confirmation.service';
import { IdenticonPipe } from '../../shared/identicon.pipe';

@Component({
  selector: 'app-email-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, PageTitleComponent, AttachmentPreviewComponent, IdenticonPipe],
  templateUrl: './email-list.component.html',
  styleUrl: './email-list.component.scss',
  animations: [
    trigger('listAnimation', [
      transition('* => *', [
        query(':enter', [
          style({ opacity: 0, transform: 'translateY(10px)' }),
          stagger(30, [
            animate('200ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
          ])
        ], { optional: true })
      ])
    ]),
    trigger('slideIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(20px)' }),
        animate('200ms ease-out', style({ opacity: 1, transform: 'translateX(0)' }))
      ]),
      transition(':leave', [
        animate('150ms ease-in', style({ opacity: 0 }))
      ])
    ])
  ]
})
export class EmailListComponent implements OnInit, OnDestroy, AfterViewChecked {
  emails: Email[] = [];
  totalEmails = 0;
  loading = false;
  refreshing = false;
  selectedEmail: Email | null = null;
  
  // Search & Filter
  searchQuery = '';
  filterTag = '';
  filterRead: boolean | undefined = undefined;
  availableTags: string[] = [];
  private searchDebounceTimer?: any;
  
  // AI Processing status
  aiProcessing = false;
  aiStatus: { total: number; processed: number; processing: number; pending: number } | null = null;
  
  // Email detail view toggle
  showAiView = false;
  activeDetailTab: 'email' | 'attachments' = 'email';
  threadLoading = false;
  historyLoading = false;
  
  // Conversation threading
  threadEmails: Email[] = [];
  threadOpen = false;
  customerHistory: Email[] = [];
  customerHistoryOpen = false;
  
  // Mailbox map
  mailboxMap = new Map<string, Mailbox>();

  // IMAP IDLE status
  idleConnected = false;
  
  // Attachment Preview
  attachmentPreviewOpen = false;
  selectedAttachment: AttachmentInfo | null = null;
  currentAttachments: AttachmentInfo[] = [];

  // Terminal log panel
  terminalOpen = false;
  terminalLogs: TerminalLogEntry[] = [];
  terminalEta: string | null = null;
  terminalElapsed: string | null = null;
  terminalFilter: 'all' | 'steps' | 'progress' | 'errors' = 'all';
  terminalStepCount = 0;
  terminalErrorCount = 0;
  currentProcessingSubject: string | null = null;
  currentProcessingStep: string | null = null;
  isTerminalAtBottom = true;
  private processingStartTime: number | null = null;
  private shouldScrollTerminal = false;
  private etaInterval?: any;
  private sseReconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  @ViewChild('terminalBody') terminalBody?: ElementRef<HTMLDivElement>;
  
  private limit = 50;
  private offset = 0;
  private sub?: Subscription;
  private mailboxSub?: Subscription;
  private eventSource?: EventSource;
  private globalEventSource?: EventSource;
  private pollInterval?: any;
  
  // Admin status
  isAdmin = false;
  currentUserId: string | null = null;

  constructor(
    private api: ApiService,
    private toasts: ToastService,
    private router: Router,
    private configService: ConfigService,
    private http: HttpClient,
    private authService: AuthService,
    private ngZone: NgZone,
    private confirmationService: ConfirmationService,
    private mailboxState: MailboxStateService
  ) {}

  ngOnInit(): void {
    this.isAdmin = this.authService.isAdmin();
    this.currentUserId = this.authService.getCurrentUser()?.id || null;
    // Load emails AND check processing status in parallel
    this.loadMailboxes();
    this.loadEmails();
    this.loadAvailableTags();
    this.checkProcessingAndConnect();
    this.connectGlobalEvents();

    // Re-fetch when user toggles active mailboxes in the header
    this.mailboxSub = this.mailboxState.mailboxChanged$.subscribe(() => {
      this.offset = 0;
      this.loadEmails();
      this.loadMailboxes();
    });
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollTerminal) {
      this.scrollTerminalToBottom();
      this.shouldScrollTerminal = false;
    }
  }

  // ==================== TERMINAL LOG ====================

  private readonly toolLabels: Record<string, string> = {
    'find_customer': 'Kunden suchen',
    'find_customer_by_email': 'Kunden per E-Mail suchen',
    'get_customer_orders': 'Aufträge laden',
    'get_order_details': 'Auftragsdetails laden',
    'get_order_shipping': 'Versandstatus laden',
    'get_order_invoice': 'Rechnungsinfos laden',
    'get_customer_tickets': 'Tickets laden',
    'get_customer_full_context': 'Kundenkontext laden',
    'search_product': 'Produkt suchen',
    'get_product_details': 'Produktdetails laden',
    'get_product_stock': 'Lagerbestand prüfen',
    'get_customer_bought_products': 'Bestellhistorie laden',
    'get_customer_notes': 'Kundennotizen laden',
    'get_product_variants': 'Produktvarianten laden',
    'get_customer_returns': 'Retouren laden',
    'get_order_payments': 'Zahlungen prüfen',
  };

  private getToolLabel(toolName: string): string {
    return this.toolLabels[toolName] || toolName;
  }

  private formatToolResult(toolName: string, result: any): string | undefined {
    if (!result) return undefined;
    try {
      switch (toolName) {
        case 'get_customer_notes': {
          const notes = Array.isArray(result) ? result : [result];
          if (notes.length === 0) return 'Keine Notizen vorhanden';
          return notes.slice(0, 5).map((n: any) =>
            `→ [${n.NotizTyp}] ${n.dErstellt}: ${(n.cNotiz || '').substring(0, 100)}`
          ).join('\n');
        }
        case 'get_product_variants': {
          if (!result || result.message) return result?.message || 'Keine Varianten';
          const v = result;
          return `→ ${v.eigenschaften?.length || 0} Eigenschaften (${v.eigenschaften?.map((e: any) => e.EigenschaftName).join(', ')})\n→ ${v.varianten?.length || 0} Varianten verfügbar`;
        }
        case 'get_customer_returns': {
          const returns = Array.isArray(result) ? result : [result];
          if (returns.length === 0) return 'Keine Retouren';
          return returns.slice(0, 3).map((r: any) =>
            `→ ${r.cRetoureNr} (${r.dErstellt})${r.cGutschriftNr ? ' – Gutschrift: ' + r.cGutschriftNr : ''}`
          ).join('\n');
        }
        case 'get_order_payments': {
          const payments = Array.isArray(result) ? result : [result];
          if (payments.length === 0) return 'Keine Zahlungen gefunden';
          const total = payments.reduce((sum: number, p: any) => sum + (p.fBetrag || 0), 0);
          return payments.map((p: any) =>
            `→ ${p.dDatum}: ${p.fBetrag}€ (${p.Zahlungsart})`
          ).join('\n') + `\n→ Gesamt bezahlt: ${total.toFixed(2)}€, Offen: ${payments[0]?.fOffenerWert || 0}€`;
        }
        default:
          return undefined;
      }
    } catch {
      return undefined;
    }
  }

  private pushLog(type: TerminalLogEntry['type'], message: string, detail?: string): void {
    this.terminalLogs.push({ timestamp: new Date(), type, message, detail });
    // Track counts
    if (type === 'step') this.terminalStepCount++;
    if (type === 'error') this.terminalErrorCount++;
    // Keep max 500 entries
    if (this.terminalLogs.length > 500) {
      this.terminalLogs = this.terminalLogs.slice(-400);
    }
    if (this.isTerminalAtBottom) {
      this.shouldScrollTerminal = true;
    }
  }

  scrollTerminalToBottom(): void {
    if (this.terminalBody?.nativeElement) {
      const el = this.terminalBody.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }

  private updateEta(): void {
    if (!this.processingStartTime || !this.aiStatus || this.aiStatus.processed === 0) {
      this.terminalEta = null;
      return;
    }
    const elapsed = Date.now() - this.processingStartTime;
    const avgPerItem = elapsed / this.aiStatus.processed;
    const remaining = this.aiStatus.total - this.aiStatus.processed;
    const etaMs = remaining * avgPerItem;

    if (etaMs < 1000) {
      this.terminalEta = '< 1s';
    } else if (etaMs < 60000) {
      this.terminalEta = `~${Math.ceil(etaMs / 1000)}s`;
    } else {
      const mins = Math.floor(etaMs / 60000);
      const secs = Math.ceil((etaMs % 60000) / 1000);
      this.terminalEta = `~${mins}m ${secs}s`;
    }
  }

  private startEtaTimer(): void {
    this.stopEtaTimer();
    this.etaInterval = setInterval(() => {
      if (this.processingStartTime) {
        const elapsed = Date.now() - this.processingStartTime;
        this.terminalElapsed = this.formatMs(elapsed);
        this.updateEta();
      }
    }, 1000);
  }

  private stopEtaTimer(): void {
    if (this.etaInterval) {
      clearInterval(this.etaInterval);
      this.etaInterval = undefined;
    }
  }

  private formatMs(ms: number): string {
    const s = Math.floor(ms / 1000) % 60;
    const m = Math.floor(ms / 60000);
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

  toggleTerminal(): void {
    this.terminalOpen = !this.terminalOpen;
    if (this.terminalOpen) {
      this.shouldScrollTerminal = true;
    }
  }

  clearTerminal(): void {
    this.terminalLogs = [];
    this.terminalEta = null;
    this.terminalStepCount = 0;
    this.terminalErrorCount = 0;
    this.currentProcessingSubject = null;
    this.currentProcessingStep = null;
  }

  get filteredTerminalLogs(): TerminalLogEntry[] {
    switch (this.terminalFilter) {
      case 'steps':
        return this.terminalLogs.filter(l => l.type === 'step' || l.type === 'system');
      case 'progress':
        return this.terminalLogs.filter(l => l.type === 'progress' || l.type === 'success' || l.type === 'system');
      case 'errors':
        return this.terminalLogs.filter(l => l.type === 'error' || l.type === 'warn');
      default:
        return this.terminalLogs;
    }
  }

  onTerminalScroll(): void {
    if (this.terminalBody?.nativeElement) {
      const el = this.terminalBody.nativeElement;
      this.isTerminalAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    }
  }

  ngOnDestroy(): void {
    // Unlock any selected email when leaving — but NOT when navigating to reply
    if (this.selectedEmail && !this.navigatingToReply) {
      this.api.unlockEmail(this.selectedEmail.id).subscribe();
    }
    this.sub?.unsubscribe();
    this.mailboxSub?.unsubscribe();
    this.closeEventSource();
    this.closeGlobalEventSource();
    this.stopPolling();
    this.stopEtaTimer();
    if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
  }

  @HostListener('window:beforeunload')
  onBeforeUnload(): void {
    // Use fetch+keepalive so the unlock survives page reload
    if (this.selectedEmail) {
      this.api.unlockEmailSync(this.selectedEmail.id);
    }
  }

  private closeEventSource(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = undefined;
    }
  }

  private closeGlobalEventSource(): void {
    if (this.globalEventSource) {
      this.globalEventSource.close();
      this.globalEventSource = undefined;
    }
  }

  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }
  }

  /**
   * On page load: check if backend is currently processing.
   * If yes, reconnect SSE and show progress. If no, load status normally.
   */
  private checkProcessingAndConnect(): void {
    this.api.getProcessingStatus().subscribe({
      next: (status) => {
        if (status.isProcessing) {
          // Backend is already processing — reconnect SSE for live updates
          this.aiProcessing = true;
          this.terminalOpen = false; // Don't open terminal automatically on page load, only if user clicks "Process with AI"
          this.processingStartTime = status.startedAt ? new Date(status.startedAt).getTime() : Date.now();
          this.aiStatus = { 
            total: status.total, 
            processed: status.processed, 
            processing: 1, 
            pending: status.total - status.processed 
          };
          this.pushLog('system', `Reconnect — Backend verarbeitet ${status.mode === 'recalculate' ? 'Neuberechnung' : 'Analyse'}`);
          this.pushLog('info', `${status.processed}/${status.total} bereits verarbeitet, ${status.failed || 0} fehlgeschlagen`);
          this.startEtaTimer();
          this.connectToProcessingStream();
        } else {
          // Not processing — load AI status normally
          this.loadAiStatus();
        }
      },
      error: () => this.loadAiStatus()
    });
  }

  loadAiStatus(): void {
    this.api.getAiStatus().subscribe({
      next: (status) => {
        this.aiStatus = status;
        if (status.isProcessing && !this.aiProcessing) {
          // Server is processing but we're not connected — reconnect
          this.aiProcessing = true;
          this.connectToProcessingStream();
        } else if (status.pending > 0 && !this.aiProcessing) {
          this.processWithAi();
        }
      },
      error: (err) => console.error('AI Status error:', err)
    });
  }

  processWithAi(): void {
    if (this.aiProcessing) return;
    this.aiProcessing = true;
    this.terminalOpen = false; // Don't open terminal automatically, only if user clicks "Process with AI"
    this.terminalLogs = [];
    this.processingStartTime = Date.now();
    this.sseReconnectAttempts = 0;
    this.pushLog('system', 'KI-Analyse gestartet');
    this.pushLog('info', 'Prüfe ausstehende E-Mails...');
    this.startEtaTimer();
    
    // POST to start background processing, then connect SSE
    this.api.processAllEmailsWithAi().subscribe({
      next: (status) => {
        if (!status.isProcessing && status.total === 0) {
          this.aiProcessing = false;
          this.stopEtaTimer();
          this.pushLog('info', 'Keine E-Mails zur Verarbeitung gefunden');
          this.toasts.info('Keine E-Mails zur Verarbeitung');
          return;
        }
        this.aiStatus = { total: status.total, processed: status.processed || 0, processing: 1, pending: status.total };
        this.pushLog('info', `${status.total} E-Mails in der Warteschlange`);
        this.pushLog('system', 'SSE-Stream wird verbunden...');
        this.connectToProcessingStream();
      },
      error: (err) => {
        console.error('Start processing error:', err);
        this.aiProcessing = false;
        this.stopEtaTimer();
        this.pushLog('error', `Fehler beim Starten: ${err?.message || 'Unbekannt'}`);
        this.toasts.error('Konnte Verarbeitung nicht starten');
      }
    });
  }

  async recalculateAi(): Promise<void> {
    if (this.aiProcessing || !this.isAdmin) return;

    const confirmed = await this.confirmationService.confirm({
      title: 'Alle E-Mails neu analysieren',
      message: 'Alle vorhandenen KI-Daten werden zurückgesetzt und sämtliche E-Mails im Posteingang werden erneut analysiert. Dieser Vorgang kann einige Minuten dauern.',
      confirmText: 'Neu analysieren',
      cancelText: 'Abbrechen',
      type: 'danger',
      icon: 'auto_awesome'
    });

    if (!confirmed) return;
    
    // Clear AI data from all emails immediately for better UX
    this.clearAiDataFromEmails();
    this.selectedEmail = null; // Close detail while recalculating
    this.aiProcessing = true;
    this.terminalOpen = false; // Don't open terminal automatically, only if user clicks "Recalculate with AI"
    this.terminalLogs = [];
    this.processingStartTime = Date.now();
    this.sseReconnectAttempts = 0;
    this.aiStatus = { total: this.emails.length, processed: 0, processing: 1, pending: this.emails.length };
    this.pushLog('system', 'Neuberechnung gestartet');
    this.pushLog('warn', 'Alle KI-Daten werden zurückgesetzt');
    this.pushLog('info', `${this.emails.length} E-Mails werden neu analysiert`);
    this.startEtaTimer();
    
    // POST to start background recalculation, then connect SSE
    this.api.recalculateAllEmailsWithAi().subscribe({
      next: (status) => {
        if (!status.isProcessing && status.total === 0) {
          this.aiProcessing = false;
          this.stopEtaTimer();
          this.pushLog('info', 'Keine E-Mails vorhanden');
          this.loadEmails();
          return;
        }
        this.aiStatus = { total: status.total, processed: 0, processing: 1, pending: status.total };
        this.pushLog('info', `Backend bestätigt: ${status.total} E-Mails`);
        this.pushLog('system', 'SSE-Stream wird verbunden...');
        this.connectToProcessingStream();
      },
      error: (err) => {
        console.error('Start recalculation error:', err);
        this.aiProcessing = false;
        this.stopEtaTimer();
        this.pushLog('error', `Fehler beim Starten: ${err?.message || 'Unbekannt'}`);
        this.toasts.error('Konnte Neuberechnung nicht starten');
        this.loadEmails();
      }
    });
  }

  private clearAiDataFromEmails(): void {
    this.emails = this.emails.map(email => ({
      ...email,
      aiSummary: null,
      aiTags: null,
      aiProcessedAt: null,
      cleanedBody: null,
      agentAnalysis: null,
      agentKeyFacts: null,
      suggestedReply: null,
      customerPhone: null,
    }));
  }

  /**
   * Connect to the server SSE stream for live processing updates.
   * Processing runs server-side — if we disconnect, it keeps going.
   * We can reconnect later and pick up the current state.
   */
  private connectToProcessingStream(): void {
    this.closeEventSource();
    
    const token = this.authService.getToken();
    const apiUrl = this.configService.apiUrl;
    const url = `${apiUrl}/emails/ai/process-stream?token=${token}`;
    
    this.ngZone.runOutsideAngular(() => {
      this.eventSource = new EventSource(url);
      
      this.eventSource.onmessage = (event) => {
        this.ngZone.run(() => {
          try {
            const data = JSON.parse(event.data);
            this.sseReconnectAttempts = 0; // Reset on successful message
            
            switch (data.type) {
              case 'reconnect':
                this.aiStatus = { total: data.total, processed: data.processed || 0, processing: 1, pending: data.total - (data.processed || 0) };
                this.pushLog('system', `Stream reconnected — ${data.processed || 0}/${data.total} verarbeitet`);
                break;
              case 'start':
                this.aiStatus = { total: data.total, processed: data.processed || 0, processing: 1, pending: data.total - (data.processed || 0) };
                this.pushLog('system', `Stream verbunden — ${data.total} E-Mails`);
                break;

              case 'step': {
                // Agent step events (tool_call, tool_result, reply, complete)
                const step = data.step;
                if (!step) break;
                if (step.type === 'tool_call') {
                  const toolLabel = this.getToolLabel(step.tool);
                  this.currentProcessingStep = toolLabel;
                  this.pushLog('step', `→ ${toolLabel}`, step.summary);
                } else if (step.type === 'tool_result') {
                  const toolLabel = this.getToolLabel(step.tool);
                  const formatted = this.formatToolResult(step.tool, step.result);
                  this.pushLog('step', `← ${toolLabel} fertig`, formatted || step.summary);
                } else if (step.type === 'reply') {
                  this.currentProcessingStep = 'Antwort wird generiert…';
                  this.pushLog('step', '✎ Antwort wird generiert...');
                } else if (step.type === 'complete') {
                  this.currentProcessingStep = null;
                  this.pushLog('step', '✓ Agent-Analyse abgeschlossen');
                } else if (step.type === 'error') {
                  this.currentProcessingStep = null;
                  this.pushLog('error', `Agent-Fehler: ${step.summary || 'Unbekannt'}`);
                }
                break;
              }
                
              case 'progress': {
                this.aiStatus = { 
                  total: data.total, 
                  processed: data.processed, 
                  processing: data.processed < data.total ? 1 : 0, 
                  pending: data.total - data.processed 
                };
                if (data.email) {
                  this.updateEmailInList(data.email);
                  const subject = data.email.subject?.substring(0, 60) || `#${data.email.id}`;
                  const tags = data.email.aiTags?.length ? ` [${data.email.aiTags.join(', ')}]` : '';
                  this.pushLog('progress', `[${data.processed}/${data.total}] ✓ ${subject}${tags}`);
                  // Track next email subject (the one AFTER the just-finished one)
                  this.currentProcessingSubject = null;
                  this.currentProcessingStep = null;
                } else {
                  this.pushLog('progress', `[${data.processed}/${data.total}] verarbeitet`);
                }
                // Pre-set current email subject if available
                if (data.currentSubject) {
                  this.currentProcessingSubject = data.currentSubject;
                }
                if (data.failed > 0) {
                  this.pushLog('warn', `${data.failed} fehlgeschlagen bisher`);
                }
                this.updateEta();
                break;
              }
                
              case 'complete': {
                const failed = data.failed || 0;
                const elapsed = this.terminalElapsed || '?';
                this.aiStatus = { total: data.total, processed: data.processed, processing: 0, pending: 0 };
                this.aiProcessing = false;
                this.processingStartTime = null;
                this.terminalEta = null;
                this.currentProcessingSubject = null;
                this.currentProcessingStep = null;
                this.stopEtaTimer();
                this.closeEventSource();
                this.loadEmails();
                
                this.pushLog('system', '━'.repeat(40));
                if (failed > 0) {
                  this.pushLog('warn', `Fertig in ${elapsed}: ${data.processed - failed}/${data.total} erfolgreich, ${failed} fehlgeschlagen`);
                  this.toasts.warning(`${data.processed - failed} von ${data.total} analysiert (${failed} fehlgeschlagen)`);
                } else {
                  this.pushLog('success', `Alle ${data.processed} E-Mails erfolgreich analysiert in ${elapsed}`);
                  this.toasts.success(`${data.processed} E-Mails vollständig analysiert`);
                }
                break;
              }
                
              case 'error':
                this.pushLog('error', `Fehler E-Mail #${data.emailId}: ${data.error || 'Unbekannt'}`);
                console.error(`AI error for email ${data.emailId}:`, data.error);
                break;
                
              case 'fatal-error':
                this.aiProcessing = false;
                this.processingStartTime = null;
                this.terminalEta = null;
                this.stopEtaTimer();
                this.closeEventSource();
                this.pushLog('error', `FATAL: ${data.error || 'Unbekannter Fehler'}`);
                this.toasts.error(`AI-Verarbeitung fehlgeschlagen: ${data.error || 'Unbekannter Fehler'}`);
                this.loadEmails();
                this.loadAiStatus();
                break;
            }
          } catch (e) {
            console.error('Error parsing SSE data:', e);
          }
        });
      };
      
      this.eventSource.onerror = () => {
        this.ngZone.run(() => {
          this.closeEventSource();
          this.sseReconnectAttempts++;
          if (this.sseReconnectAttempts <= this.maxReconnectAttempts) {
            this.pushLog('warn', `Stream unterbrochen — Reconnect ${this.sseReconnectAttempts}/${this.maxReconnectAttempts}...`);
            // Exponential backoff: 1s, 2s, 4s, 8s... capped at 15s
            const delay = Math.min(1000 * Math.pow(2, this.sseReconnectAttempts - 1), 15000);
            setTimeout(() => {
              if (this.aiProcessing) {
                this.connectToProcessingStream();
              }
            }, delay);
          } else {
            this.pushLog('warn', 'Max Reconnect-Versuche erreicht — wechsle zu Polling');
            this.startPolling();
          }
        });
      };
    });
  }

  /**
   * If SSE disconnects, poll the processing status to know when it's done
   */
  private startPolling(): void {
    this.stopPolling();
    this.pollInterval = setInterval(() => {
      this.api.getProcessingStatus().subscribe({
        next: (status) => {
          if (status.isProcessing) {
            this.aiStatus = { 
              total: status.total, 
              processed: status.processed, 
              processing: 1, 
              pending: status.total - status.processed 
            };
            // Try reconnecting SSE
            this.connectToProcessingStream();
            this.stopPolling();
          } else {
            // Processing finished while we were disconnected
            this.aiProcessing = false;
            this.processingStartTime = null;
            this.terminalEta = null;
            this.stopEtaTimer();
            this.stopPolling();
            this.loadEmails();
            this.loadAiStatus();
            this.pushLog('success', 'Verarbeitung im Hintergrund abgeschlossen');
            this.toasts.success('Verarbeitung im Hintergrund abgeschlossen');
          }
        }
      });
    }, 3000);
  }

  private updateEmailInList(emailData: any): void {
    const idx = this.emails.findIndex(e => e.id === emailData.id);
    if (idx !== -1) {
      this.emails[idx] = { 
        ...this.emails[idx], 
        aiSummary: emailData.aiSummary ?? null,
        aiTags: emailData.aiTags ?? null,
        cleanedBody: emailData.cleanedBody ?? null,
        agentAnalysis: emailData.agentAnalysis ?? this.emails[idx].agentAnalysis,
        agentKeyFacts: emailData.agentKeyFacts ?? this.emails[idx].agentKeyFacts,
        suggestedReply: emailData.suggestedReply ?? this.emails[idx].suggestedReply,
        customerPhone: emailData.customerPhone ?? this.emails[idx].customerPhone,
        aiProcessedAt: new Date()
      };
      if (this.selectedEmail?.id === emailData.id) {
        this.selectedEmail = this.emails[idx];
      }
    }
  }
  
  // Silent reload (no loading spinner)
  loadEmailsSilent(): void {
    this.api.getEmails(this.limit, this.offset, this.searchQuery, this.filterTag, this.filterRead).subscribe({
      next: (res) => {
        this.emails = res.emails;
        this.totalEmails = res.total;
        // Update selected email if it was reloaded
        if (this.selectedEmail) {
          const updated = this.emails.find(e => e.id === this.selectedEmail!.id);
          if (updated) this.selectedEmail = updated;
        }
      }
    });
  }

  loadEmails(): void {
    this.loading = true;
    this.offset = 0;
    this.sub = this.api.getEmails(this.limit, this.offset, this.searchQuery, this.filterTag, this.filterRead).subscribe({
      next: (res) => {
        this.emails = res.emails;
        this.totalEmails = res.total;
        this.loading = false;
      },
      error: (err) => {
        console.error('Fehler beim Laden der E-Mails:', err);
        this.toasts.error('E-Mails konnten nicht geladen werden');
        this.loading = false;
      }
    });
  }

  refreshEmails(): void {
    this.refreshing = true;
    this.api.refreshEmails().subscribe({
      next: (res) => {
        this.toasts.success(`${res.stored} neue E-Mails abgerufen`);
        this.refreshing = false;
        this.loadEmails();
        // Trigger AI processing for new emails
        this.loadAiStatus();
      },
      error: (err) => {
        console.error('Fehler beim Aktualisieren:', err);
        this.toasts.error('E-Mails konnten nicht aktualisiert werden');
        this.refreshing = false;
      }
    });
  }

  selectEmail(email: Email): void {
    // Block selection if this specific email is being AI processed
    if (email.aiProcessing) return;

    // Block if locked by another user
    const currentUser = this.authService.getCurrentUser();
    if (email.lockedBy && currentUser && email.lockedBy !== currentUser.id) {
      this.toasts.info(`Wird bearbeitet von ${email.lockedByName || 'anderem Benutzer'}`);
      return;
    }

    // Unlock previously selected email
    if (this.selectedEmail && this.selectedEmail.id !== email.id) {
      this.api.unlockEmail(this.selectedEmail.id).subscribe();
    }
    
    // Sofort anzeigen (Liste-Daten), dann vollständige E-Mail nachladen
    this.selectedEmail = email;
    this.activeDetailTab = 'email';
    this.threadEmails = [];
    this.customerHistory = [];

    // Lock this email for current user
    this.api.lockEmail(email.id).subscribe({
      next: (res) => {
        if (!res.locked) {
          this.toasts.info(`Wird bearbeitet von ${res.lockedByName || 'anderem Benutzer'}`);
          this.selectedEmail = null;
          return;
        }
      },
      error: () => {} // Best-effort locking
    });
    
    // Mark as read if not already
    if (!email.isRead) {
      this.api.markEmailAsRead(email.id).subscribe({
        next: (updated) => {
          const idx = this.emails.findIndex(e => e.id === email.id);
          if (idx !== -1) {
            this.emails[idx] = updated;
          }
          this.selectedEmail = updated;
        },
        error: (err) => console.error('Fehler beim Markieren:', err)
      });
    } else {
      // Vollständige E-Mail laden (mit htmlBody, textBody, etc.)
      this.api.getEmailById(email.id).subscribe({
        next: (full) => {
          const idx = this.emails.findIndex(e => e.id === email.id);
          if (idx !== -1) {
            this.emails[idx] = full;
          }
          // Nur updaten wenn noch dieselbe Mail selektiert ist
          if (this.selectedEmail?.id === email.id) {
            this.selectedEmail = full;
          }
        },
        error: (err) => console.error('Fehler beim Laden der vollständigen E-Mail:', err)
      });
    }
  }

  closeDetail(): void {
    // Unlock the email when closing detail
    if (this.selectedEmail) {
      this.api.unlockEmail(this.selectedEmail.id).subscribe();
    }
    this.selectedEmail = null;
  }

  // Navigate to reply page
  navigatingToReply = false;
  openReplyPage(): void {
    if (!this.selectedEmail) return;
    this.navigatingToReply = true; // Keep lock alive across navigation
    this.router.navigate(['/emails', this.selectedEmail.id, 'reply']);
  }

  // Recalculate AI for a single email (admin only) — with sidebar & SSE like batch
  async recalculateSingleEmail(email: Email): Promise<void> {
    if (!this.isAdmin || this.aiProcessing) return;

    const confirmed = await this.confirmationService.confirm({
      title: 'E-Mail neu analysieren',
      message: `Möchtest du die KI-Analyse für "${email.subject?.substring(0, 60) || 'Kein Betreff'}" zurücksetzen und erneut durchführen?`,
      confirmText: 'Neu analysieren',
      cancelText: 'Abbrechen',
      type: 'info',
      icon: 'refresh'
    });

    if (!confirmed) return;

    // Clear AI data for this email
    const idx = this.emails.findIndex(e => e.id === email.id);
    if (idx !== -1) {
      this.emails[idx] = {
        ...this.emails[idx],
        aiSummary: null,
        aiTags: null,
        aiProcessedAt: null,
        cleanedBody: null,
        agentAnalysis: null,
        agentKeyFacts: null,
        suggestedReply: null,
        customerPhone: null,
      };
      if (this.selectedEmail?.id === email.id) {
        this.selectedEmail = this.emails[idx];
      }
    }

    // Open sidebar & set loading state — same as batch
    this.aiProcessing = true;
    this.terminalOpen = false; // Don't open terminal automatically, only if user clicks "Recalculate"
    this.terminalLogs = [];
    this.processingStartTime = Date.now();
    this.sseReconnectAttempts = 0;
    this.aiStatus = { total: 1, processed: 0, processing: 1, pending: 1 };
    this.pushLog('system', `Einzelne E-Mail wird neu analysiert`);
    this.pushLog('info', `"${email.subject?.substring(0, 60) || 'Kein Betreff'}"`);
    this.startEtaTimer();

    // POST to start background reprocessing, then connect SSE
    this.api.reprocessEmailWithAi(email.id).subscribe({
      next: (status) => {
        if (!status.isProcessing && status.total === 0) {
          this.aiProcessing = false;
          this.stopEtaTimer();
          this.pushLog('error', 'E-Mail nicht gefunden');
          this.loadEmails();
          return;
        }
        this.pushLog('system', 'SSE-Stream wird verbunden...');
        this.connectToProcessingStream();
      },
      error: (err) => {
        console.error('Reprocess single email error:', err);
        this.aiProcessing = false;
        this.stopEtaTimer();
        this.pushLog('error', `Fehler: ${err?.message || 'Unbekannt'}`);
        this.toasts.error('Neuberechnung fehlgeschlagen');
        this.loadEmails();
      }
    });
  }

  // Move to trash (no reply needed)
  moveToTrash(): void {
    if (!this.selectedEmail) return;
    const emailId = this.selectedEmail.id;

    this.api.moveEmailToTrash(emailId).subscribe({
      next: () => {
        this.api.unlockEmail(emailId).subscribe();
        this.toasts.success('E-Mail in Papierkorb verschoben');
        this.emails = this.emails.filter(e => e.id !== emailId);
        this.totalEmails--;
        this.selectedEmail = null;
      },
      error: (err) => {
        console.error('Fehler:', err);
        this.toasts.error('Fehler beim Verschieben');
      }
    });
  }

  formatDate(date: Date | string): string {
    const d = new Date(date);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    
    if (isToday) {
      return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    }
    
    return d.toLocaleDateString('de-DE', { 
      day: '2-digit', 
      month: '2-digit',
      year: '2-digit'
    });
  }

  getSenderName(email: Email): string {
    return email.fromName || email.fromAddress;
  }

  getSenderInitials(email: Email): string {
    const name = email.fromName || email.fromAddress || '?';
    const parts = name.split(/[\s.@]+/).filter(p => p.length > 0);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  loadMore(): void {
    this.offset += this.limit;
    this.api.getEmails(this.limit, this.offset, this.searchQuery, this.filterTag, this.filterRead).subscribe({
      next: (res) => {
        this.emails = [...this.emails, ...res.emails];
      },
      error: (err) => {
        console.error('Fehler beim Laden:', err);
      }
    });
  }

  get hasMore(): boolean {
    return this.emails.length < this.totalEmails;
  }

  // ==================== ATTACHMENT PREVIEW ====================

  openAttachmentPreview(attachment: { filename: string; contentType: string; size: number }, index: number): void {
    if (!this.selectedEmail) return;

    this.currentAttachments = this.getAttachmentInfos(this.selectedEmail);
    this.selectedAttachment = this.currentAttachments[index];
    this.attachmentPreviewOpen = true;
  }

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

  // ==================== SEARCH & FILTER ====================

  onSearchInput(): void {
    if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
    this.searchDebounceTimer = setTimeout(() => {
      this.loadEmails();
    }, 350);
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.loadEmails();
  }

  onFilterTagChange(): void {
    this.loadEmails();
  }

  onFilterReadChange(value: string): void {
    this.filterRead = value === '' ? undefined : value === 'true';
    this.loadEmails();
  }

  clearFilters(): void {
    this.searchQuery = '';
    this.filterTag = '';
    this.filterRead = undefined;
    this.loadEmails();
  }

  get hasActiveFilters(): boolean {
    return !!(this.searchQuery || this.filterTag || this.filterRead !== undefined);
  }

  private loadAvailableTags(): void {
    this.api.getAvailableTags().subscribe({
      next: (res) => this.availableTags = res.tags,
      error: () => this.availableTags = [],
    });
  }

  // ==================== GLOBAL SSE (Real-time IMAP IDLE events) ====================

  private connectGlobalEvents(): void {
    this.closeGlobalEventSource();
    
    const token = this.authService.getToken();
    const apiUrl = this.configService.apiUrl;
    const url = `${apiUrl}/emails/events?token=${token}`;
    
    this.ngZone.runOutsideAngular(() => {
      this.globalEventSource = new EventSource(url);
      
      this.globalEventSource.onmessage = (event) => {
        this.ngZone.run(() => {
          try {
            const data = JSON.parse(event.data);
            
            switch (data.type) {
              case 'idle-status':
                this.idleConnected = data.connected;
                break;

              case 'new-emails':
                // IMAP IDLE detected new emails — auto-refresh the list
                this.loadEmailsSilent();
                this.loadAvailableTags();
                if (data.stored > 0) {
                  this.toasts.info(`${data.stored} neue E-Mail${data.stored > 1 ? 's' : ''} eingegangen`);
                  // Browser push notification
                  this.sendBrowserNotification(
                    'Neue E-Mails',
                    `${data.stored} neue E-Mail${data.stored > 1 ? 's' : ''} im Posteingang`
                  );
                }
                break;

              case 'processing-started':
                // AI processing auto-started by IMAP IDLE
                if (!this.aiProcessing) {
                  this.aiProcessing = true;
                  this.terminalOpen = false; // Don't open terminal automatically, only if user clicks "Process with AI"
                  this.processingStartTime = Date.now();
                  this.sseReconnectAttempts = 0;
                  this.pushLog('system', data.message || 'KI-Analyse automatisch gestartet');
                  this.startEtaTimer();
                  this.connectToProcessingStream();
                }
                break;

              case 'processing-progress':
                // Update email in list when individual processing completes
                if (data.email) {
                  this.updateEmailInList(data.email);
                }
                if (data.processed && data.total) {
                  this.aiStatus = {
                    total: data.total,
                    processed: data.processed,
                    processing: data.processed < data.total ? 1 : 0,
                    pending: data.total - data.processed,
                  };
                }
                break;

              case 'processing-complete':
                this.loadEmailsSilent();
                this.loadAvailableTags();
                break;

              case 'email-locked': {
                // Another user locked an email — update in list
                const lockedIdx = this.emails.findIndex(e => e.id === data.emailId);
                if (lockedIdx !== -1) {
                  this.emails[lockedIdx] = {
                    ...this.emails[lockedIdx],
                    lockedBy: data.lockedBy,
                    lockedByName: data.lockedByName,
                    lockedAt: new Date(),
                  };
                }
                break;
              }

              case 'email-unlocked': {
                // Email was unlocked
                if (data.emailId) {
                  const unlockedIdx = this.emails.findIndex(e => e.id === data.emailId);
                  if (unlockedIdx !== -1) {
                    this.emails[unlockedIdx] = {
                      ...this.emails[unlockedIdx],
                      lockedBy: null,
                      lockedByName: null,
                      lockedAt: null,
                    };
                  }
                } else if (data.all) {
                  // User disconnected — unlock all their emails
                  this.emails = this.emails.map(e =>
                    e.lockedBy === data.userId
                      ? { ...e, lockedBy: null, lockedByName: null, lockedAt: null }
                      : e
                  );
                }
                break;
              }

              case 'email-status-changed': {
                // Another user moved email to trash/sent/restored — update our list
                const changedId = data.emailId;
                const newStatus = data.status;
                const idx = this.emails.findIndex(e => e.id === changedId);

                if (idx !== -1) {
                  // Email is in our list but status changed — remove if it no longer belongs
                  // email-list shows 'inbox' status only
                  if (newStatus !== 'inbox') {
                    // Close detail if we have this email selected
                    if (this.selectedEmail?.id === changedId) {
                      this.selectedEmail = null;
                    }
                    this.emails.splice(idx, 1);
                    this.toasts.info(
                      newStatus === 'sent'
                        ? 'E-Mail wurde von einem anderen Benutzer beantwortet'
                        : 'E-Mail wurde von einem anderen Benutzer gelöscht'
                    );
                  }
                } else if (newStatus === 'inbox') {
                  // Email restored to inbox — reload list to pick it up
                  this.loadEmailsSilent();
                }
                break;
              }

              case 'keepalive':
                // Just a keepalive, ignore
                break;
            }
          } catch (e) {
            console.error('Error parsing global SSE:', e);
          }
        });
      };

      this.globalEventSource.onerror = () => {
        this.ngZone.run(() => {
          this.idleConnected = false;
          // Auto-reconnect in 5s
          setTimeout(() => {
            if (!this.globalEventSource || this.globalEventSource.readyState === EventSource.CLOSED) {
              this.connectGlobalEvents();
            }
          }, 5000);
        });
      };
    });
  }

  // ==================== BROWSER NOTIFICATIONS ====================

  private sendBrowserNotification(title: string, body: string): void {
    if (!('Notification' in window)) return;
    
    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/assets/icons/icon-128x128.png' });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          new Notification(title, { body, icon: '/assets/icons/icon-128x128.png' });
        }
      });
    }
  }

  requestNotificationPermission(): void {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  // ==================== CONVERSATION THREADING ====================

  switchDetailTab(tab: 'email' | 'attachments'): void {
    this.activeDetailTab = tab;
  }

  /**
   * Select an email from thread/history tabs without clearing the tab data.
   * Switches to the email tab to show content but preserves thread/history.
   */
  selectThreadEmail(email: Email): void {
    if (email.aiProcessing) return;
    if (email.id === this.selectedEmail?.id) {
      // Already viewing this email — just switch to email tab
      this.activeDetailTab = 'email';
      return;
    }

    // Unlock previously selected email
    if (this.selectedEmail && this.selectedEmail.id !== email.id) {
      this.api.unlockEmail(this.selectedEmail.id).subscribe();
    }

    this.selectedEmail = email;
    this.activeDetailTab = 'email';
    // Do NOT clear threadEmails / customerHistory

    // Lock this email
    this.api.lockEmail(email.id).subscribe({
      next: (res) => {
        if (!res.locked) {
          this.toasts.info(`Wird bearbeitet von ${res.lockedByName || 'anderem Benutzer'}`);
        }
      },
      error: () => {}
    });

    // Mark as read if needed, and load full email
    if (!email.isRead) {
      this.api.markEmailAsRead(email.id).subscribe({
        next: (updated) => {
          if (this.selectedEmail?.id === email.id) {
            this.selectedEmail = updated;
          }
        },
        error: (err) => console.error('Fehler beim Markieren:', err)
      });
    } else {
      this.api.getEmailById(email.id).subscribe({
        next: (full) => {
          if (this.selectedEmail?.id === email.id) {
            this.selectedEmail = full;
          }
        },
        error: (err) => console.error('Fehler beim Laden:', err)
      });
    }
  }

  loadThread(): void {
    if (!this.selectedEmail) return;
    this.threadLoading = true;
    this.api.getEmailThread(this.selectedEmail.id).subscribe({
      next: (res) => {
        this.threadEmails = res.thread;
        this.threadOpen = true;
        this.threadLoading = false;
      },
      error: (err) => {
        console.error('Thread load error:', err);
        this.threadLoading = false;
      },
    });
  }

  loadCustomerHistory(): void {
    if (!this.selectedEmail) return;
    this.historyLoading = true;
    this.api.getCustomerHistory(this.selectedEmail.fromAddress).subscribe({
      next: (res) => {
        this.customerHistory = res.history;
        this.customerHistoryOpen = true;
        this.historyLoading = false;
      },
      error: (err) => {
        console.error('Customer history error:', err);
        this.historyLoading = false;
      },
    });
  }

  closeThreadPanel(): void {
    this.threadOpen = false;
    this.customerHistoryOpen = false;
  }

  getThreadCount(): number {
    return this.threadEmails.length;
  }

  // Mailbox helpers
  private loadMailboxes(): void {
    this.api.getMyMailboxes().subscribe({
      next: (userMailboxes) => {
        this.mailboxMap.clear();
        userMailboxes.forEach(um => {
          if (um.mailbox) {
            this.mailboxMap.set(um.mailbox.id, um.mailbox as any);
          }
        });
      },
      error: (err) => console.error('Failed to load mailboxes:', err)
    });
  }

  getMailboxName(mailboxId: string): string {
    return this.mailboxMap.get(mailboxId)?.name || '';
  }

  getMailboxColor(mailboxId: string): string {
    return this.mailboxMap.get(mailboxId)?.color || '#1565c0';
  }
}
