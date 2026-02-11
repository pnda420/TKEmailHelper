import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isLoggedIn()) {
    // Not logged in → redirect to welcome page
    router.navigate(['/welcome']);
    return false;
  }

  // Logged in but profile not complete → redirect to setup wizard
  if (authService.needsSetup() && state.url !== '/setup') {
    router.navigate(['/setup']);
    return false;
  }

  return true;
};