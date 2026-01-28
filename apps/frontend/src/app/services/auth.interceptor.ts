import { Injectable, inject } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { ToastService } from '../shared/toasts/toast.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
    private toasts = inject(ToastService);
    private rateLimitWarningShown = false;
    private rateLimitToastShown = false;

    intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
        // Token direkt aus localStorage holen (kein AuthService!)
        const token = localStorage.getItem('access_token');

        let request = req;
        if (token) {
            request = req.clone({
                setHeaders: {
                    Authorization: `Bearer ${token}`
                }
            });
        }

        return next.handle(request).pipe(
            tap((event: any) => {
                // Rate-Limit-Headers auswerten (wenn vorhanden)
                if (event.headers) {
                    const remaining = event.headers.get('X-RateLimit-Remaining');
                    const limit = event.headers.get('X-RateLimit-Limit');
                    
                    // Warnung bei weniger als 20% verbleibenden Requests
                    if (remaining && limit) {
                        const remainingNum = parseInt(remaining, 10);
                        const limitNum = parseInt(limit, 10);
                        
                        if (remainingNum < limitNum * 0.2 && remainingNum > 0 && !this.rateLimitWarningShown) {
                            this.rateLimitWarningShown = true;
                            this.toasts.warning(
                                `Noch ${remainingNum} Anfragen übrig. Bitte warte kurz.`,
                                { duration: 5000 }
                            );
                            // Reset nach 30 Sekunden
                            setTimeout(() => this.rateLimitWarningShown = false, 30000);
                        }
                    }
                }
            }),
            catchError((error: HttpErrorResponse) => {
                if (error.status === 429) {
                    // Rate Limit erreicht - zeige Toast nur wenn nicht schon einer angezeigt wird
                    // (verhindert Spam bei mehreren gleichzeitigen Requests)
                    if (!this.rateLimitToastShown) {
                        this.rateLimitToastShown = true;
                        
                        // Versuche Retry-After aus verschiedenen Quellen zu lesen
                        let seconds = 10; // Default
                        
                        // 1. Aus Header (bevorzugt)
                        const retryAfterHeader = error.headers?.get('Retry-After');
                        if (retryAfterHeader) {
                            seconds = parseInt(retryAfterHeader, 10);
                        }
                        // 2. Aus Response Body (Fallback)
                        else if (error.error?.retryAfter) {
                            seconds = error.error.retryAfter;
                        }
                        
                        this.toasts.error(
                            `Zu viele Anfragen. Bitte warte ${seconds} Sekunden.`,
                            { duration: Math.min(seconds * 1000, 10000) } // Max 10 Sekunden Toast
                        );
                        
                        // Reset nach der Wartezeit
                        setTimeout(() => this.rateLimitToastShown = false, seconds * 1000);
                    }
                }
                return throwError(() => error);
            })
        );
    }
}