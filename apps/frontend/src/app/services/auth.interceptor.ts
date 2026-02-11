import { Injectable, inject } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { ToastService } from '../shared/toasts/toast.service';
import { Router } from '@angular/router';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
    private toasts = inject(ToastService);
    private router = inject(Router);
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
                // 🛡️ 401 Unauthorized → Token abgelaufen/ungültig → Auto-Logout
                if (error.status === 401) {
                    // Nur ausloggen wenn wir einen Token hatten (nicht bei Login-Versuchen)
                    const hadToken = localStorage.getItem('access_token');
                    if (hadToken) {
                        localStorage.removeItem('access_token');
                        localStorage.removeItem('current_user');
                        
                        // Nur Toast zeigen wenn wir nicht bereits auf der Login-Seite sind
                        if (!this.router.url.startsWith('/login')) {
                            this.toasts.error(
                                'Sitzung abgelaufen. Bitte melde dich erneut an.',
                                { duration: 5000 }
                            );
                            this.router.navigate(['/login'], {
                                queryParams: { returnUrl: this.router.url }
                            });
                        }
                    }
                }

                // 🛡️ 403 Forbidden → Keine Berechtigung
                if (error.status === 403) {
                    this.toasts.error(
                        'Keine Berechtigung für diese Aktion.',
                        { duration: 5000 }
                    );
                }

                if (error.status === 429) {
                    // Rate Limit erreicht - zeige Toast nur wenn nicht schon einer angezeigt wird
                    if (!this.rateLimitToastShown) {
                        this.rateLimitToastShown = true;
                        
                        let seconds = 10;
                        
                        const retryAfterHeader = error.headers?.get('Retry-After');
                        if (retryAfterHeader) {
                            seconds = parseInt(retryAfterHeader, 10);
                        } else if (error.error?.retryAfter) {
                            seconds = error.error.retryAfter;
                        }
                        
                        this.toasts.error(
                            `Zu viele Anfragen. Bitte warte ${seconds} Sekunden.`,
                            { duration: Math.min(seconds * 1000, 10000) }
                        );
                        
                        setTimeout(() => this.rateLimitToastShown = false, seconds * 1000);
                    }
                }
                return throwError(() => error);
            })
        );
    }
}