import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  NgZone,
  AfterViewChecked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService, User } from '../../services/auth.service';
import { ConfigService } from '../../services/config.service';
import { PageTitleComponent } from '../../shared/page-title/page-title.component';
import { Subscription } from 'rxjs';

// ── Types ──

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCallInfo[];
  isStreaming?: boolean;
  isError?: boolean;
}

interface ToolCallInfo {
  tool: string;
  args: Record<string, any>;
  result?: any;
  status: 'running' | 'done' | 'error';
  expanded?: boolean;
}

interface ChatStep {
  type: 'tool_call' | 'tool_result' | 'thinking' | 'chunk' | 'complete' | 'error' | 'title_update';
  tool?: string;
  args?: Record<string, any>;
  result?: any;
  content?: string;
  status: 'running' | 'done' | 'error';
}

interface Conversation {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

interface QuickAction {
  icon: string;
  label: string;
  prompt: string;
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, PageTitleComponent],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss',
})
export class ChatComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messagesContainer') messagesContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('messageInput') messageInput!: ElementRef<HTMLTextAreaElement>;

  user: User | null = null;
  messages: ChatMessage[] = [];
  conversations: Conversation[] = [];
  activeConversationId: string | null = null;
  inputText = '';
  isLoading = false;
  isLoadingConversations = false;
  editingTitleId: string | null = null;
  editingTitleText = '';
  private eventSource: EventSource | null = null;
  private userSub?: Subscription;
  private shouldScrollToBottom = false;

  // Quick actions for empty state
  quickActions: QuickAction[] = [
    {
      icon: 'person_search',
      label: 'Kunde suchen',
      prompt: 'Suche den Kunden mit der E-Mail ',
    },
    {
      icon: 'local_shipping',
      label: 'Versandstatus',
      prompt: 'Was ist der Versandstatus der Bestellung ',
    },
    {
      icon: 'inventory_2',
      label: 'Lagerbestand',
      prompt: 'Wie viel haben wir noch vom Artikel ',
    },
    {
      icon: 'shopping_cart',
      label: 'Bestellungen',
      prompt: 'Zeige mir die letzten Bestellungen von Kunde ',
    },
    {
      icon: 'receipt_long',
      label: 'Rechnung prüfen',
      prompt: 'Ist die Rechnung für Auftrag AU- bezahlt?',
    },
    {
      icon: 'help_outline',
      label: 'Allgemeine Frage',
      prompt: '',
    },
  ];

  constructor(
    private authService: AuthService,
    private config: ConfigService,
    private http: HttpClient,
    private ngZone: NgZone,
  ) {}

  ngOnInit(): void {
    this.userSub = this.authService.currentUser$.subscribe((u) => (this.user = u));
    this.loadConversations();
  }

  ngOnDestroy(): void {
    this.userSub?.unsubscribe();
    this.closeEventSource();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  // ── Conversation Management ──

  loadConversations(): void {
    this.isLoadingConversations = true;
    this.http.get<Conversation[]>(`${this.config.apiUrl}/chat/conversations`).subscribe({
      next: (convs) => {
        this.conversations = convs.map((c) => ({
          ...c,
          createdAt: new Date(c.createdAt),
          updatedAt: new Date(c.updatedAt),
        }));
        this.isLoadingConversations = false;
      },
      error: () => {
        this.isLoadingConversations = false;
      },
    });
  }

  async newChat(): Promise<void> {
    this.closeEventSource();
    this.isLoading = false;
    this.messages = [];
    this.activeConversationId = null;
  }

  selectConversation(conv: Conversation): void {
    if (this.activeConversationId === conv.id) return;
    this.closeEventSource();
    this.isLoading = false;
    this.activeConversationId = conv.id;
    this.messages = [];
    this.loadMessages(conv.id);
  }

  private loadMessages(conversationId: string): void {
    this.http
      .get<any[]>(`${this.config.apiUrl}/chat/conversations/${conversationId}/messages`)
      .subscribe({
        next: (msgs) => {
          this.messages = msgs.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: new Date(m.createdAt),
            toolCalls: m.toolCalls || undefined,
          }));
          this.shouldScrollToBottom = true;
        },
      });
  }

  deleteConversation(conv: Conversation, event: Event): void {
    event.stopPropagation();
    this.http.delete(`${this.config.apiUrl}/chat/conversations/${conv.id}`).subscribe({
      next: () => {
        this.conversations = this.conversations.filter((c) => c.id !== conv.id);
        if (this.activeConversationId === conv.id) {
          this.activeConversationId = null;
          this.messages = [];
        }
      },
    });
  }

  startEditTitle(conv: Conversation, event: Event): void {
    event.stopPropagation();
    this.editingTitleId = conv.id;
    this.editingTitleText = conv.title;
  }

  saveTitle(conv: Conversation): void {
    const newTitle = this.editingTitleText.trim();
    if (!newTitle) {
      this.editingTitleId = null;
      return;
    }
    this.http
      .patch(`${this.config.apiUrl}/chat/conversations/${conv.id}`, { title: newTitle })
      .subscribe({
        next: () => {
          conv.title = newTitle;
          this.editingTitleId = null;
        },
        error: () => {
          this.editingTitleId = null;
        },
      });
  }

  cancelEditTitle(): void {
    this.editingTitleId = null;
  }

  onTitleKeyDown(event: KeyboardEvent, conv: Conversation): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.saveTitle(conv);
    }
    if (event.key === 'Escape') {
      this.cancelEditTitle();
    }
  }

  // ── Send Message ──

  sendMessage(): void {
    const text = this.inputText.trim();
    if (!text || this.isLoading) return;

    this.inputText = '';

    // Reset textarea height
    if (this.messageInput?.nativeElement) {
      this.messageInput.nativeElement.style.height = 'auto';
    }

    if (!this.activeConversationId) {
      // Create a new conversation first, then send
      this.http
        .post<Conversation>(`${this.config.apiUrl}/chat/conversations`, {})
        .subscribe({
          next: (conv) => {
            this.activeConversationId = conv.id;
            this.conversations.unshift({
              ...conv,
              createdAt: new Date(conv.createdAt),
              updatedAt: new Date(conv.updatedAt),
            });
            this.addUserMessageAndStream(text);
          },
        });
    } else {
      this.addUserMessageAndStream(text);
    }
  }

  private addUserMessageAndStream(text: string): void {
    // Add user message to UI
    const userMsg: ChatMessage = {
      id: this.generateId(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };
    this.messages.push(userMsg);
    this.shouldScrollToBottom = true;

    // Stream AI response
    this.streamResponse(text);
  }

  private streamResponse(userMessage: string): void {
    this.isLoading = true;
    this.closeEventSource();

    const token = this.authService.getToken();
    if (!token || !this.activeConversationId) return;

    const url =
      `${this.config.apiUrl}/chat/stream` +
      `?message=${encodeURIComponent(userMessage)}` +
      `&conversationId=${encodeURIComponent(this.activeConversationId)}` +
      `&token=${encodeURIComponent(token)}`;

    // Create assistant placeholder
    const assistantMsg: ChatMessage = {
      id: this.generateId(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      toolCalls: [],
      isStreaming: true,
    };
    this.messages.push(assistantMsg);
    this.shouldScrollToBottom = true;

    this.ngZone.runOutsideAngular(() => {
      this.eventSource = new EventSource(url);

      this.eventSource.onmessage = (event) => {
        this.ngZone.run(() => {
          try {
            const step: ChatStep = JSON.parse(event.data);
            this.handleChatStep(step, assistantMsg);
            this.shouldScrollToBottom = true;
          } catch {}
        });
      };

      this.eventSource.onerror = () => {
        this.ngZone.run(() => {
          if (assistantMsg.isStreaming && !assistantMsg.content) {
            assistantMsg.content = 'Verbindung unterbrochen. Bitte versuche es erneut.';
            assistantMsg.isError = true;
          }
          assistantMsg.isStreaming = false;
          this.isLoading = false;
          this.closeEventSource();
        });
      };
    });
  }

  private handleChatStep(step: ChatStep, msg: ChatMessage): void {
    switch (step.type) {
      case 'tool_call':
        msg.toolCalls = msg.toolCalls || [];
        msg.toolCalls.push({
          tool: step.tool || 'unknown',
          args: step.args || {},
          status: 'running',
        });
        break;

      case 'tool_result':
        if (msg.toolCalls) {
          const tc = msg.toolCalls.find(
            (t) => t.tool === step.tool && t.status === 'running',
          );
          if (tc) {
            tc.result = step.result;
            tc.status = step.status === 'error' ? 'error' : 'done';
          }
        }
        break;

      case 'complete':
        msg.content = step.content || '';
        msg.isStreaming = false;
        this.isLoading = false;
        // Don't close EventSource here — let server-side complete close it
        // so that subsequent events (like title_update) can still arrive.
        break;

      case 'error':
        msg.content = step.content || 'Ein Fehler ist aufgetreten.';
        msg.isStreaming = false;
        msg.isError = true;
        this.isLoading = false;
        break;

      case 'title_update':
        // Backend auto-generated a title for this conversation
        if (step.content && this.activeConversationId) {
          const conv = this.conversations.find(
            (c) => c.id === this.activeConversationId,
          );
          if (conv) {
            conv.title = step.content;
          }
        }
        break;
    }
  }

  // ── Quick Actions ──

  onQuickAction(action: QuickAction): void {
    this.inputText = action.prompt;
    setTimeout(() => {
      this.messageInput?.nativeElement?.focus();
      // Set cursor to end
      const el = this.messageInput?.nativeElement;
      if (el) {
        el.selectionStart = el.selectionEnd = el.value.length;
      }
    });
  }

  // ── Input Handling ──

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  autoGrow(event: Event): void {
    const el = event.target as HTMLTextAreaElement;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }

  // ── Tool Call Display ──

  toggleToolExpand(tc: ToolCallInfo): void {
    tc.expanded = !tc.expanded;
  }

  getToolLabel(toolName: string): string {
    const labels: Record<string, string> = {
      find_customer: 'Kunde suchen',
      find_customer_by_email: 'Kunde per E-Mail suchen',
      get_customer_orders: 'Bestellungen laden',
      get_order_details: 'Bestelldetails laden',
      get_order_shipping: 'Versandstatus laden',
      get_order_invoice: 'Rechnung laden',
      get_customer_tickets: 'Tickets laden',
      get_customer_full_context: 'Kundenkontext laden',
      search_product: 'Produkt suchen',
      get_product_details: 'Produktdetails laden',
      get_product_stock: 'Lagerbestand prüfen',
      get_customer_bought_products: 'Gekaufte Artikel laden',
      get_customer_notes: 'Kundennotizen laden',
      get_product_variants: 'Varianten laden',
      get_customer_returns: 'Retouren laden',
      get_order_payments: 'Zahlungen laden',
    };
    return labels[toolName] || toolName;
  }

  getToolIcon(toolName: string): string {
    const icons: Record<string, string> = {
      find_customer: 'person_search',
      find_customer_by_email: 'alternate_email',
      get_customer_orders: 'shopping_cart',
      get_order_details: 'receipt_long',
      get_order_shipping: 'local_shipping',
      get_order_invoice: 'description',
      get_customer_tickets: 'confirmation_number',
      get_customer_full_context: 'account_box',
      search_product: 'search',
      get_product_details: 'inventory_2',
      get_product_stock: 'warehouse',
      get_customer_bought_products: 'shopping_bag',
      get_customer_notes: 'sticky_note_2',
      get_product_variants: 'style',
      get_customer_returns: 'assignment_return',
      get_order_payments: 'payments',
    };
    return icons[toolName] || 'build';
  }

  formatToolResult(result: any): string {
    if (!result) return 'Keine Daten';
    if (result.error) return `Fehler: ${result.error}`;
    try {
      return JSON.stringify(result, null, 2);
    } catch {
      return String(result);
    }
  }

  // ── Markdown-lite rendering ──

  renderMarkdown(text: string): string {
    if (!text) return '';
    let html = this.escapeHtml(text);

    // Bold: **text**
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Italic: *text*
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Inline code: `text`
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Unordered lists: - item
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

    // Numbered lists: 1. item
    html = html.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');

    // Headers: ### text
    html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');

    // Line breaks
    html = html.replace(/\n/g, '<br>');

    return html;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ── Utilities ──

  private scrollToBottom(): void {
    const el = this.messagesContainer?.nativeElement;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }

  private closeEventSource(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  trackByMessageId(_: number, msg: ChatMessage): string {
    return msg.id;
  }

  trackByToolIndex(i: number): number {
    return i;
  }

  trackByConversationId(_: number, conv: Conversation): string {
    return conv.id;
  }

  get hasMessages(): boolean {
    return this.messages.length > 0;
  }

  formatTime(date: Date): string {
    return new Date(date).toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  formatDate(date: Date): string {
    const d = new Date(date);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return 'Heute';
    if (d.toDateString() === yesterday.toDateString()) return 'Gestern';

    return d.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
    });
  }
}
