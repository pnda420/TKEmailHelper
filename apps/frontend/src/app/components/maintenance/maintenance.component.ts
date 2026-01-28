import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../api/api.service';

@Component({
  selector: 'app-maintenance',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './maintenance.component.html',
  styleUrl: './maintenance.component.scss'
})
export class MaintenanceComponent {
  @Input() message?: string;
  
  email: string = '';
  password: string = '';
  submitted: boolean = false;
  isLoading: boolean = false;
  errorMessage: string = '';
  showPasswordForm: boolean = false;
  isCheckingPassword: boolean = false;

  // Verschlüsselte E-Mail-Adresse (Base64)
  private encryptedEmail = 'dG9tQGxlb25hcmRzbWVkaWEuZGU='; // tom@Leonards & Brandenburger IT.de
  contactEmail: string = '';


  constructor(
    private apiService: ApiService,
    private router: Router
  ) {
    // E-Mail erst beim Laden der Component entschlüsseln
    this.contactEmail = this.decryptEmail(this.encryptedEmail);
  }

  private decryptEmail(encrypted: string): string {
    try {
      return atob(encrypted);
    } catch (e) {
      return 'tom@leonardsmedia.de';
    }
  }

  getMailtoLink(): string {
    return `mailto:${this.contactEmail}`;
  }

  togglePasswordForm(): void {
    this.showPasswordForm = !this.showPasswordForm;
    this.password = '';
    this.errorMessage = '';
  }

  onSubmitPassword(): void {
    if (!this.password) {
      return;
    }

    this.isCheckingPassword = true;
    this.errorMessage = '';

    this.apiService.checkMaintenancePassword(this.password).subscribe({
      next: (response) => {
        if (response.valid) {
          sessionStorage.setItem('maintenanceBypass', 'true');
          // Seite neu laden für vollen Zugriff
          window.location.reload();
        } else {
          this.errorMessage = 'Ungültiges Passwort';
          this.password = '';
          this.isCheckingPassword = false;
          setTimeout(() => this.errorMessage = '', 3000);
        }
      },
      error: (error) => {
        console.error('Fehler bei Passwort-Prüfung:', error);
        this.errorMessage = 'Fehler bei der Überprüfung';
        this.isCheckingPassword = false;
        setTimeout(() => this.errorMessage = '', 3000);
      }
    });
  }

  onSubmitNewsletter(): void {
    if (!this.email) {
      return;
    }

    // Einfache E-Mail-Validierung
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.email)) {
      this.errorMessage = 'Bitte gib eine gültige E-Mail-Adresse ein';
      setTimeout(() => this.errorMessage = '', 3000);
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    // Öffentliche Newsletter-Anmeldung (erstellt Eintrag in newsletter_subscribers Tabelle)
    this.apiService.subscribeNewsletter(this.email).subscribe({
      next: (response) => {
        this.submitted = true;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Newsletter subscription failed:', error);
        this.isLoading = false;

        if (error.status === 409) {
          this.errorMessage = 'Diese E-Mail ist bereits angemeldet';
        } else {
          this.errorMessage = 'Etwas ist schiefgelaufen. Bitte versuche es später nochmal.';
        }

        setTimeout(() => this.errorMessage = '', 5000);
      }
    });
  }
}