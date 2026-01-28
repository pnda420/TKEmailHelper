import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface ConfirmationConfig {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'warning' | 'danger' | 'info' | 'success';
  icon?: string;
}

@Component({
  selector: 'app-confirmation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './confirmation.component.html',
  styleUrl: './confirmation.component.scss'
})
export class ConfirmationComponent {
  @Input() isOpen = false;
  @Input() config: ConfirmationConfig = {
    title: 'Bestätigung',
    message: 'Möchtest du fortfahren?',
    type: 'info'
  };
  @Input() loading = false;

  @Output() confirmed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  getDefaultIcon(): string {
    switch (this.config.type) {
      case 'warning': return 'warning';
      case 'danger': return 'delete';
      case 'success': return 'check_circle';
      default: return 'help';
    }
  }

  onConfirm(): void {
    if (!this.loading) {
      this.confirmed.emit();
    }
  }

  onCancel(): void {
    if (!this.loading) {
      this.isOpen = false;
      this.cancelled.emit();
    }
  }

  onBackdropClick(): void {
    if (!this.loading) {
      this.isOpen = false;
      this.cancelled.emit();
    }
  }

  close(): void {
    this.isOpen = false;
    this.closed.emit();
  }
}
