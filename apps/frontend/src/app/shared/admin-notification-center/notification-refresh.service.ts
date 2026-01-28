import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class NotificationRefreshService {
  private refreshTrigger$ = new Subject<void>();

  // Observable für Komponenten, die auf Änderungen reagieren wollen
  onRefreshNeeded$ = this.refreshTrigger$.asObservable();

  // Löst eine Aktualisierung aus
  triggerRefresh(): void {
    this.refreshTrigger$.next();
  }
}
