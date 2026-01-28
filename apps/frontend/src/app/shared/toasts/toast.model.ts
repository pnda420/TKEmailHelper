// src/app/toasts/toast.model.ts
export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  id?: string;
  message: string;
  type?: ToastType;
  duration?: number;       // ms, default 3500
  dismissible?: boolean;   // default true
  actionLabel?: string;    // optional Button
  onAction?: () => void;   // callback für Action
}
