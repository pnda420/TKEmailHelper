import { Component, OnInit, OnDestroy, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { trigger, transition, style, animate, query, stagger } from '@angular/animations';
import { ApiService, UserMailbox } from '../../api/api.service';
import { ToastService } from '../../shared/toasts/toast.service';
import { ConfirmationService } from '../../shared/confirmation/confirmation.service';
import { ConfigService } from '../../services/config.service';
import { AuthService } from '../../services/auth.service';

interface SpamEmail {
  uid: number;
  messageId: string;
  subject: string;
  from: string;
  fromName: string;
  to: string;
  date: string;
  preview: string;
  isSpam: boolean;
  spamScore: number;
  spamReason: string;
  category: string;
  selected: boolean;
}

type CategoryFilter = '' | 'spam' | 'scam' | 'phishing' | 'newsletter' | 'marketing' | 'legitimate';

@Component({
  selector: 'app-spam-killer',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './spam-killer.component.html',
  styleUrls: ['./spam-killer.component.scss'],
  animations: [
    trigger('fadeSlide', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('200ms ease-out', style({ opacity: 1 }))
      ]),
      transition(':leave', [
        animate('150ms ease-in', style({ opacity: 0 }))
      ])
    ]),
    trigger('scaleIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.97)' }),
        animate('250ms cubic-bezier(0.22, 1, 0.36, 1)', style({ opacity: 1, transform: 'scale(1)' }))
      ])
    ]),
    trigger('listAnim', [
      transition('* => *', [
        query(':enter', [
          style({ opacity: 0, transform: 'translateY(6px)' }),
          stagger(20, [
            animate('180ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
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
export class SpamKillerComponent implements OnInit, OnDestroy {
  // -- Mailbox selection --
  mailboxes: UserMailbox[] = [];
  mailboxSpamCounts: Record<string, number> = {};
  loadingMailboxes = true;

  // -- Active view --
  activeMailbox: UserMailbox | null = null;
  emails: SpamEmail[] = [];
  selectedEmail: SpamEmail | null = null;

  // -- Scan state --
  scanning = false;
  scanProgress = 0;
  scanTotal = 0;
  scanStatus = '';
  loaded = false;
  error = false;
  isDeleting = false;

  // -- Scan stats --
  scanDurationMs = 0;
  totalInbox = 0;
  spamCount = 0;
  newsletterCount = 0;
  legitimateCount = 0;

  // -- Search & Filter --
  searchQuery = '';
  filterCategory: CategoryFilter = '';

  // -- SSE --
  private scanES: EventSource | null = null;
  private liveES: EventSource | null = null;

  get totalFlaggedCount(): number {
    return Object.values(this.mailboxSpamCounts).reduce((s, c) => s + c, 0);
  }

  get filteredEmails(): SpamEmail[] {
    let result = this.emails;
    if (this.filterCategory) {
      result = result.filter(e => e.category === this.filterCategory);
    }
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      result = result.filter(e =>
        e.subject.toLowerCase().includes(q) ||
        e.from.toLowerCase().includes(q) ||
        e.fromName.toLowerCase().includes(q) ||
        (e.preview && e.preview.toLowerCase().includes(q))
      );
    }
    return result;
  }

  get selectedCount(): number {
    return this.filteredEmails.filter(e => e.selected).length;
  }

  get allSelected(): boolean {
    const f = this.filteredEmails;
    return f.length > 0 && f.every(e => e.selected);
  }

  get hasActiveFilters(): boolean {
    return !!(this.searchQuery || this.filterCategory);
  }

  get categoryCountMap(): Record<string, number> {
    const map: Record<string, number> = {};
    for (const e of this.emails) {
      map[e.category] = (map[e.category] || 0) + 1;
    }
    return map;
  }

  constructor(
    private api: ApiService,
    private toasts: ToastService,
    private confirm: ConfirmationService,
    private config: ConfigService,
    private auth: AuthService,
    private ngZone: NgZone,
  ) {}

  ngOnInit() {
    this.loadMailboxes();
    this.connectLiveSSE();
  }

  ngOnDestroy() {
    this.closeScanES();
    this.closeLiveSSE();
  }

  // =============================================
  // MAILBOX SELECTION
  // =============================================

  loadMailboxes() {
    this.loadingMailboxes = true;
    this.api.getMyMailboxes().subscribe({
      next: (mailboxes) => {
        this.mailboxes = mailboxes;
        this.loadingMailboxes = false;
        this.loadSpamCounts();
      },
      error: () => {
        this.loadingMailboxes = false;
        this.toasts.error('Postfächer konnten nicht geladen werden.');
      },
    });
  }

  private loadSpamCounts() {
    this.api.spamKillerGetCounts().subscribe({
      next: (counts) => { this.mailboxSpamCounts = counts; },
    });
  }

  selectMailbox(mb: UserMailbox) {
    if (this.activeMailbox?.mailboxId === mb.mailboxId) return;
    this.closeScanES();
    this.activeMailbox = mb;
    this.emails = [];
    this.selectedEmail = null;
    this.loaded = false;
    this.error = false;
    this.scanning = false;
    this.searchQuery = '';
    this.filterCategory = '';
    this.scanDurationMs = 0;
    this.totalInbox = 0;
    this.spamCount = 0;
    this.newsletterCount = 0;
    this.legitimateCount = 0;

    // Load cached results first, then auto-scan
    this.loadCachedThenScan(mb.mailboxId);
  }

  backToMailboxes() {
    this.closeScanES();
    this.activeMailbox = null;
    this.emails = [];
    this.selectedEmail = null;
    this.loaded = false;
    this.error = false;
    this.scanning = false;
    this.searchQuery = '';
    this.filterCategory = '';
    this.loadSpamCounts();
  }

  // =============================================
  // DATA LOADING
  // =============================================

  private loadCachedThenScan(mailboxId: string) {
    this.api.spamKillerGetCached(mailboxId).subscribe({
      next: (result) => {
        if (result && result.emails && result.emails.length > 0) {
          this.applyResults(result);
          this.loaded = true;
        }
        this.startScan();
      },
      error: () => {
        this.startScan();
      },
    });
  }

  private applyResults(r: any) {
    this.emails = (r.emails || []).map((e: any) => ({ ...e, selected: true }));
    this.totalInbox = r.totalInbox || 0;
    this.spamCount = r.spamCount || 0;
    this.newsletterCount = r.newsletterCount || 0;
    this.legitimateCount = r.legitimateCount || 0;
    this.scanDurationMs = r.scanDurationMs || 0;
  }

  // =============================================
  // SCAN (SSE)
  // =============================================

  startScan() {
    if (!this.activeMailbox || this.scanning) return;
    const id = this.activeMailbox.mailboxId;

    this.closeScanES();
    this.scanning = true;
    this.error = false;
    this.scanProgress = 0;
    this.scanTotal = 0;
    this.scanStatus = 'Verbinde...';

    const token = localStorage.getItem('access_token') || '';
    const url = `${this.config.apiUrl}/spam-killer/scan-live/${id}?token=${encodeURIComponent(token)}`;

    const es = new EventSource(url);
    this.scanES = es;

    es.onmessage = (evt) => {
      this.ngZone.run(() => {
        try {
          const data = JSON.parse(evt.data);
          if (data.type === 'started') {
            this.scanStatus = 'Lade E-Mails...';
          } else if (data.type === 'progress') {
            this.scanProgress = data.scanned;
            this.scanTotal = data.total;
            this.scanStatus = 'KI analysiert...';
          } else if (data.type === 'complete') {
            es.close();
            this.scanES = null;
            this.applyResults(data.result);
            this.scanProgress = this.totalInbox;
            this.scanTotal = this.totalInbox;
            this.scanning = false;
            this.loaded = true;
            if (this.emails.length > 0) {
              this.toasts.warning(`${this.emails.length} verdächtige E-Mails gefunden!`);
            } else {
              this.toasts.success('Inbox ist sauber!');
            }
            this.loadSpamCounts();
          } else if (data.type === 'error') {
            es.close();
            this.scanES = null;
            this.scanning = false;
            this.error = true;
            this.loaded = true;
            this.toasts.error(data.message || 'Scan fehlgeschlagen');
          }
        } catch {}
      });
    };

    es.onerror = () => {
      this.ngZone.run(() => {
        es.close();
        this.scanES = null;
        if (this.scanning) {
          this.scanning = false;
          this.error = true;
          this.loaded = true;
          this.toasts.error('Verbindung verloren.');
        }
      });
    };
  }

  private closeScanES() {
    if (this.scanES) {
      this.scanES.close();
      this.scanES = null;
    }
  }

  // =============================================
  // LIVE SSE (cross-user sync)
  // =============================================

  private connectLiveSSE(): void {
    this.closeLiveSSE();
    const token = this.auth.getToken();
    if (!token) return;
    const url = `${this.config.apiUrl}/spam-killer/live?token=${encodeURIComponent(token)}`;

    this.ngZone.runOutsideAngular(() => {
      this.liveES = new EventSource(url);
      this.liveES.onmessage = (event) => {
        this.ngZone.run(() => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'counts-updated' && data.counts) {
              const myIds = new Set(this.mailboxes.map(m => m.mailboxId));
              for (const [id, count] of Object.entries(data.counts)) {
                if (myIds.has(id)) this.mailboxSpamCounts[id] = count as number;
              }
              for (const id of myIds) {
                if (!(id in data.counts)) this.mailboxSpamCounts[id] = 0;
              }
            }
            if (data.type === 'emails-removed' && data.uids && data.mailboxId) {
              if (this.activeMailbox?.mailboxId === data.mailboxId) {
                const removedSet = new Set<number>(data.uids);
                this.emails = this.emails.filter(e => !removedSet.has(e.uid));
                if (this.selectedEmail && removedSet.has(this.selectedEmail.uid)) {
                  this.selectedEmail = null;
                }
              }
            }
          } catch {}
        });
      };
      this.liveES.onerror = () => {};
    });
  }

  private closeLiveSSE(): void {
    if (this.liveES) { this.liveES.close(); this.liveES = null; }
  }

  // =============================================
  // SEARCH & FILTER
  // =============================================

  clearSearch() {
    this.searchQuery = '';
  }

  setFilterCategory(cat: CategoryFilter) {
    this.filterCategory = this.filterCategory === cat ? '' : cat;
  }

  clearFilters() {
    this.searchQuery = '';
    this.filterCategory = '';
  }

  // =============================================
  // SELECTION
  // =============================================

  toggleAll() {
    const val = !this.allSelected;
    this.filteredEmails.forEach(e => e.selected = val);
  }

  toggle(email: SpamEmail, event?: Event) {
    if (event) event.stopPropagation();
    email.selected = !email.selected;
  }

  // =============================================
  // DELETE
  // =============================================

  async deleteSelected() {
    if (!this.activeMailbox) return;
    const sel = this.filteredEmails.filter(e => e.selected);
    if (sel.length === 0) return;

    const ok = await this.confirm.confirm({
      title: 'E-Mails löschen',
      message: `${sel.length} E-Mail${sel.length > 1 ? 's' : ''} endgültig aus der Inbox entfernen?`,
      confirmText: `${sel.length} löschen`,
      cancelText: 'Abbrechen',
      type: 'danger',
      icon: 'delete_forever',
    });
    if (!ok) return;

    this.isDeleting = true;
    const uids = sel.map(e => e.uid);

    this.api.spamKillerDelete(this.activeMailbox.mailboxId, uids).subscribe({
      next: (res) => {
        this.isDeleting = false;
        const set = new Set(uids);
        this.emails = this.emails.filter(e => !set.has(e.uid));
        this.toasts.success(`${res.deleted} E-Mail${res.deleted > 1 ? 's' : ''} gelöscht!`);
        if (res.failed > 0) this.toasts.warning(`${res.failed} konnten nicht gelöscht werden.`);
        if (this.selectedEmail && set.has(this.selectedEmail.uid)) this.selectedEmail = null;
        this.loadSpamCounts();
      },
      error: () => {
        this.isDeleting = false;
        this.toasts.error('Löschen fehlgeschlagen.');
      },
    });
  }

  // =============================================
  // DETAIL
  // =============================================

  showDetail(email: SpamEmail) {
    this.selectedEmail = this.selectedEmail?.uid === email.uid ? null : email;
  }

  closeDetail() {
    this.selectedEmail = null;
  }

  // =============================================
  // HELPERS
  // =============================================

  getCategoryIcon(cat: string): string {
    const m: Record<string, string> = {
      spam: 'report', scam: 'gpp_bad', phishing: 'phishing',
      newsletter: 'newspaper', marketing: 'campaign', legitimate: 'verified',
    };
    return m[cat] || 'help_outline';
  }

  getCategoryLabel(cat: string): string {
    const m: Record<string, string> = {
      spam: 'Spam', scam: 'Betrug', phishing: 'Phishing',
      newsletter: 'Newsletter', marketing: 'Marketing', legitimate: 'Sicher',
    };
    return m[cat] || 'Unbekannt';
  }

  getCategoryClass(cat: string): string {
    const m: Record<string, string> = {
      spam: 'cat-spam', scam: 'cat-scam', phishing: 'cat-phishing',
      newsletter: 'cat-newsletter', marketing: 'cat-marketing', legitimate: 'cat-safe',
    };
    return m[cat] || 'cat-unknown';
  }

  getScoreClass(score: number): string {
    if (score >= 80) return 'score-critical';
    if (score >= 60) return 'score-high';
    if (score >= 40) return 'score-medium';
    if (score >= 20) return 'score-low';
    return 'score-safe';
  }

  formatDate(d: string): string {
    try {
      const date = new Date(d);
      const h = (Date.now() - date.getTime()) / 3600000;
      if (h < 1) return 'Gerade eben';
      if (h < 24) return `Vor ${Math.floor(h)}h`;
      if (h < 48) return 'Gestern';
      return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
    } catch { return d; }
  }

  formatDuration(ms: number): string {
    return ms < 1000 ? `${ms}ms` : `${(Math.round(ms / 100) / 10)}s`;
  }

  trackByMailbox(_: number, mb: UserMailbox): string { return mb.mailboxId; }
  trackByUid(_: number, e: SpamEmail): number { return e.uid; }
}
