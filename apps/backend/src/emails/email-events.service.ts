import { Injectable, Logger } from '@nestjs/common';

/**
 * Global event bus for real-time email events.
 * SSE subscribers (frontend clients) listen here for live updates:
 * - new-emails: new mails fetched from IMAP (user should refresh list)
 * - processing-started: AI pipeline kicked off automatically
 * - processing-progress: single email done in pipeline  
 * - processing-complete: batch done
 * - idle-status: IMAP IDLE connection status changes
 */
export type EmailEventType =
  | 'new-emails'
  | 'processing-started'
  | 'processing-progress'
  | 'processing-complete'
  | 'idle-status'
  | 'email-updated'
  | 'email-locked'
  | 'email-unlocked'
  | 'email-status-changed';

export interface EmailEvent {
  type: EmailEventType;
  data: any;
  timestamp: Date;
}

@Injectable()
export class EmailEventsService {
  private readonly logger = new Logger(EmailEventsService.name);
  private subscribers: ((event: EmailEvent) => void)[] = [];

  /**
   * Subscribe to all email events (used by SSE endpoint)
   * Returns unsubscribe function.
   */
  subscribe(callback: (event: EmailEvent) => void): () => void {
    this.subscribers.push(callback);
    this.logger.debug(`SSE subscriber added (total: ${this.subscribers.length})`);
    return () => {
      this.subscribers = this.subscribers.filter(s => s !== callback);
      this.logger.debug(`SSE subscriber removed (total: ${this.subscribers.length})`);
    };
  }

  /**
   * Emit an event to all connected SSE clients
   */
  emit(type: EmailEventType, data: any): void {
    const event: EmailEvent = { type, data, timestamp: new Date() };
    for (const sub of this.subscribers) {
      try {
        sub(event);
      } catch (e) {
        // subscriber disconnected — remove it
        this.subscribers = this.subscribers.filter(s => s !== sub);
      }
    }
  }

  get subscriberCount(): number {
    return this.subscribers.length;
  }
}
