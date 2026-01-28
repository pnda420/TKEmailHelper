import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ConfirmationConfig } from './confirmation.component';

interface ConfirmationState {
  isOpen: boolean;
  config: ConfirmationConfig;
  resolve?: (value: boolean) => void;
}

@Injectable({
  providedIn: 'root'
})
export class ConfirmationService {
  private stateSubject = new BehaviorSubject<ConfirmationState>({
    isOpen: false,
    config: {
      title: 'Bestätigung',
      message: 'Möchtest du fortfahren?',
      type: 'info'
    }
  });

  state$ = this.stateSubject.asObservable();

  confirm(config: ConfirmationConfig): Promise<boolean> {
    return new Promise((resolve) => {
      this.stateSubject.next({
        isOpen: true,
        config,
        resolve
      });
    });
  }

  handleConfirm(): void {
    const state = this.stateSubject.value;
    if (state.resolve) {
      state.resolve(true);
    }
    this.close();
  }

  handleCancel(): void {
    const state = this.stateSubject.value;
    if (state.resolve) {
      state.resolve(false);
    }
    this.close();
  }

  private close(): void {
    this.stateSubject.next({
      ...this.stateSubject.value,
      isOpen: false
    });
  }
}