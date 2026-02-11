import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../shared/toasts/toast.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss'
})
export class RegisterComponent {
  // Master Password Gate
  masterPassword = '';
  masterPasswordVerified = false;
  masterPasswordError = '';
  masterPasswordLoading = false;

  // Registration form
  firstName = '';
  lastName = '';
  email = '';
  password = '';
  loading = false;
  error = '';
  showPassword = false;
  registerSuccess = false;
  registerError = false;

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private toasts: ToastService
  ) { }

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`.trim();
  }

  verifyMasterPassword() {
    if (!this.masterPassword) {
      this.masterPasswordError = 'Bitte Master-Passwort eingeben';
      return;
    }

    this.masterPasswordLoading = true;
    this.masterPasswordError = '';

    this.authService.verifyMasterPassword(this.masterPassword).subscribe({
      next: (res) => {
        this.masterPasswordLoading = false;
        if (res.valid) {
          this.masterPasswordVerified = true;
          this.toasts.success('Master-Passwort korrekt! Du kannst dich jetzt registrieren.');
        } else {
          this.masterPasswordError = res.message || 'Ungültiges Master-Passwort';
        }
      },
      error: (err) => {
        this.masterPasswordLoading = false;
        if (err.status === 429) {
          this.masterPasswordError = 'Zu viele Versuche. Bitte warte kurz.';
        } else {
          this.masterPasswordError = 'Ungültiges Master-Passwort';
        }
      }
    });
  }

  register() {
    if (!this.firstName || !this.lastName || !this.email || !this.password) {
      this.error = 'Bitte fülle alle Felder aus';
      this.triggerErrorAnimation();
      return;
    }

    if (this.password.length < 8) {
      this.error = 'Passwort muss mindestens 8 Zeichen lang sein';
      this.triggerErrorAnimation();
      return;
    }

    this.loading = true;
    this.error = '';

    this.authService.register(this.email, this.fullName, this.password, this.masterPassword).subscribe({
      next: (response) => {
        console.log('✅ Registrierung erfolgreich:', response);
        this.toasts.success('Erfolgreich registriert! Bitte richte dein Profil ein.');
        this.loading = false;
        this.registerSuccess = true;

        // Navigate to setup wizard
        setTimeout(() => {
          this.router.navigate(['/setup']);
        }, 700);
      },
      error: (err) => {
        console.error('❌ Registrierung fehlgeschlagen:', err);
        this.error = err?.error?.message || 'Registrierung fehlgeschlagen. Email bereits vergeben?';
        this.loading = false;
        this.triggerErrorAnimation();
      }
    });
  }

  private triggerErrorAnimation(): void {
    this.registerError = true;
    setTimeout(() => {
      this.registerError = false;
    }, 600);
  }
}