import { Injectable, Logger } from '@nestjs/common';

/**
 * Global event bus for spam-killer real-time updates.
 * SSE subscribers (all connected frontend clients) listen here for live updates.
 *
 * Events:
 *  - counts-updated:  per-mailbox spam counts changed (after scan, delete, or stale cleanup)
 *  - emails-removed:  specific emails removed from a mailbox (deleted externally or via cleanup)
 */
export type SpamKillerEventType = 'counts-updated' | 'emails-removed';

export interface SpamKillerEvent {
  type: SpamKillerEventType;
  data: any;
  timestamp: Date;
}

@Injectable()
export class SpamKillerEventsService {
  private readonly logger = new Logger(SpamKillerEventsService.name);
  private subscribers: ((event: SpamKillerEvent) => void)[] = [];

  /**
   * Subscribe to all spam-killer events (used by SSE endpoint).
   * Returns an unsubscribe function.
   */
  subscribe(callback: (event: SpamKillerEvent) => void): () => void {
    this.subscribers.push(callback);
    this.logger.debug(`Spam-killer SSE subscriber added (total: ${this.subscribers.length})`);
    return () => {
      this.subscribers = this.subscribers.filter(s => s !== callback);
      this.logger.debug(`Spam-killer SSE subscriber removed (total: ${this.subscribers.length})`);
    };
  }

  /**
   * Emit an event to all connected SSE clients.
   */
  emit(type: SpamKillerEventType, data: any): void {
    const event: SpamKillerEvent = { type, data, timestamp: new Date() };
    for (const sub of this.subscribers) {
      try {
        sub(event);
      } catch (e) {
        // subscriber disconnected — remove it
        this.subscribers = this.subscribers.filter(s => s !== sub);
      }
    }
  }

  /** Number of currently connected SSE subscribers */
  get subscriberCount(): number {
    return this.subscribers.length;
  }
}
