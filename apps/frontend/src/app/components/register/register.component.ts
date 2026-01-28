import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { PageTitleComponent } from '../../shared/page-title/page-title.component';
import { ToastService } from '../../shared/toasts/toast.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PageTitleComponent],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss'
})
export class RegisterComponent {
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


    this.authService.register(this.email, this.fullName, this.password).subscribe({
      next: (response) => {
        console.log('✅ Registrierung erfolgreich:', response);
        this.toasts.success('Erfolgreich registriert und eingeloggt.');
        this.loading = false;
        this.registerSuccess = true;

        // Navigate nach Exit-Animation
        setTimeout(() => {
          const returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/';
          this.router.navigate([returnUrl]);
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