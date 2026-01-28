import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService, UserRole } from '../services/auth.service';
import { ConfirmationService } from '../shared/confirmation/confirmation.service';
import { catchError, map, of } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';

export const adminGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const confirmationService = inject(ConfirmationService);

  // 1. SCHNELLER CHECK: Ist überhaupt ein Token vorhanden?
  if (!authService.isLoggedIn()) {
    router.navigate(['/login'], {
      queryParams: { returnUrl: state.url }
    });
    return false;
  }

  // 2. BACKEND-VALIDIERUNG: Ist User wirklich Admin?
  // Bei 429 verwendet verifyAdminStatus() die gecachten User-Daten
  return authService.verifyAdminStatus().pipe(
    map(isAdmin => {
      if (isAdmin) {
        return true;
      }

      // User ist KEIN Admin → Fehlermeldung + Redirect
      confirmationService.confirm({
        title: 'Keine Berechtigung',
        message: 'Diese Seite ist nur für Administratoren zugänglich. Du hast keine Berechtigung, auf diesen Bereich zuzugreifen.',
        confirmText: 'Zurück zur Startseite',
        type: 'danger',
        icon: 'block'
      });

      router.navigate(['/']);
      return false;
    }),
    catchError((error: HttpErrorResponse) => {
      console.error('Admin-Validierung fehlgeschlagen:', error);
      
      // Bei 429: Verwende gecachte User-Daten FALLS Admin-Status bereits vom Server bestätigt wurde
      // HINWEIS: Das Backend prüft bei JEDEM API-Call nochmals - das hier ist nur UX
      if (error.status === 429) {
        const cachedUser = authService.getCurrentUser();
        if (cachedUser?.role === UserRole.ADMIN) {
          console.warn('Rate-Limited: Verwende gecachten Admin-Status (Backend validiert trotzdem jeden Request)');
          return of(true);
        }
        // Kein gecachter Admin → kein Zugriff
        return of(false);
      }
      
      // Bei 401/403: Token ungültig → ausloggen
      if (error.status === 401 || error.status === 403) {
        authService.logout();
      }
      
      return of(false);
    })
  );
};