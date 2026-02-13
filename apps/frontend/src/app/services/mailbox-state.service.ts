import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/**
 * Shared service to broadcast mailbox selection changes.
 * The header emits when the user toggles active mailboxes,
 * and the email-list (or any other consumer) subscribes to re-fetch.
 */
@Injectable({ providedIn: 'root' })
export class MailboxStateService {
  private mailboxChanged = new Subject<void>();

  /** Observable that emits whenever active mailboxes change */
  mailboxChanged$ = this.mailboxChanged.asObservable();

  /** Call this after successfully updating active mailbox selection */
  notifyMailboxChanged(): void {
    this.mailboxChanged.next();
  }
}
