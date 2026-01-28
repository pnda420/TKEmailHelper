import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { ToastOptions } from './toast.model';

@Injectable({ providedIn: 'root' })
export class ToastService {
    private _stream = new Subject<ToastOptions | { id: string; close: true }>();
    stream$ = this._stream.asObservable();

    show(opts: ToastOptions) {
        const id = opts.id ?? (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));
        this._stream.next({
            ...opts,
            id,
            duration: opts.duration ?? 3500,
            dismissible: opts.dismissible ?? true,
        });
        return id;
    }

    success(message: string, opts: Partial<ToastOptions> = {}) { return this.show({ message, type: 'success', ...opts }); }
    error(message: string, opts: Partial<ToastOptions> = {}) { return this.show({ message, type: 'error', ...opts }); }
    warning(message: string, opts: Partial<ToastOptions> = {}) { return this.show({ message, type: 'warning', ...opts }); }
    info(message: string, opts: Partial<ToastOptions> = {}) { return this.show({ message, type: 'info', ...opts }); }

    close(id: string) {
        this._stream.next({ id, close: true } as any);
    }
}
