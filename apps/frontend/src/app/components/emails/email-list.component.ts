import { Component, OnInit, OnDestroy, NgZone, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
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
import { ApiService, Email } from '../../api/api.service';
import { ToastService } from '../../shared/toasts/toast.service';
import { PageTitleComponent } from '../../shared/page-title/page-title.component';
import { AttachmentPreviewComponent, AttachmentInfo } from '../../shared/attachment-preview/attachment-preview.component';
import { ConfigService } from '../../services/config.service';
import { AuthService } from '../../services/auth.service';
import { ConfirmationService } from '../../shared/confirmation/confirmation.service';

@Component({
  selector: 'app-email-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, PageTitleComponent, AttachmentPreviewComponent],
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
  
  // AI Processing status
  aiProcessing = false;
  aiStatus: { total: number; processed: number; processing: number; pending: number } | null = null;
  
  // Email detail view toggle
  showAiView = true; // Toggle between AI summary and full email
  
  // Attachment Preview
  attachmentPreviewOpen = false;
  selectedAttachment: AttachmentInfo | null = null;
  currentAttachments: AttachmentInfo[] = [];

  // Terminal log panel
  terminalOpen = false;
  terminalLogs: TerminalLogEntry[] = [];
  terminalEta: string | null = null;
  terminalElapsed: string | null = null;
  private processingStartTime: number | null = null;
  private shouldScrollTerminal = false;
  private etaInterval?: any;
  private sseReconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  @ViewChild('terminalBody') terminalBody?: ElementRef<HTMLDivElement>;
  
  private limit = 50;
  private offset = 0;
  private sub?: Subscription;
  private eventSource?: EventSource;
  private pollInterval?: any;
  
  // Admin status
  isAdmin = false;

  constructor(
    private api: ApiService,
    private toasts: ToastService,
    private router: Router,
    private configService: ConfigService,
    private http: HttpClient,
    private authService: AuthService,
    private ngZone: NgZone,
    private confirmationService: ConfirmationService
  ) {}

  ngOnInit(): void {
    this.isAdmin = this.authService.isAdmin();
    // Load emails AND check processing status in parallel
    this.loadEmails();
    this.checkProcessingAndConnect();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollTerminal) {
      this.scrollTerminalToBottom();
      this.shouldScrollTerminal = false;
    }
  }

  // ==================== TERMINAL LOG ====================

  private pushLog(type: TerminalLogEntry['type'], message: string, detail?: string): void {
    this.terminalLogs.push({ timestamp: new Date(), type, message, detail });
    // Keep max 500 entries
    if (this.terminalLogs.length > 500) {
      this.terminalLogs = this.terminalLogs.slice(-400);
    }
    this.shouldScrollTerminal = true;
  }

  private scrollTerminalToBottom(): void {
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
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.closeEventSource();
    this.stopPolling();
    this.stopEtaTimer();
  }

  private closeEventSource(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = undefined;
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
          this.terminalOpen = true;
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
    this.terminalOpen = true;
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
    this.terminalOpen = true;
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
                  this.pushLog('step', `→ Tool: ${step.tool}`, step.summary);
                } else if (step.type === 'tool_result') {
                  this.pushLog('step', `← ${step.tool} fertig`, step.summary);
                } else if (step.type === 'reply') {
                  this.pushLog('step', '✎ Antwort wird generiert...');
                } else if (step.type === 'complete') {
                  this.pushLog('step', '✓ Agent-Analyse abgeschlossen');
                } else if (step.type === 'error') {
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
                } else {
                  this.pushLog('progress', `[${data.processed}/${data.total}] verarbeitet`);
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
    this.api.getEmails(this.limit, this.offset).subscribe({
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
    this.sub = this.api.getEmails(this.limit, this.offset).subscribe({
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
    // Block selection while AI processing is running
    if (this.aiProcessing) return;
    
    this.selectedEmail = email;
    
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
    }
  }

  closeDetail(): void {
    this.selectedEmail = null;
  }

  // Navigate to reply page
  openReplyPage(): void {
    if (!this.selectedEmail) return;
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
    this.terminalOpen = true;
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

    this.api.moveEmailToTrash(this.selectedEmail.id).subscribe({
      next: () => {
        this.toasts.success('E-Mail in Papierkorb verschoben');
        this.emails = this.emails.filter(e => e.id !== this.selectedEmail?.id);
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
    this.api.getEmails(this.limit, this.offset).subscribe({
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
}
