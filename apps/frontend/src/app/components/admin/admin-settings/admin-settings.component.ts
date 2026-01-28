import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminLayoutComponent } from '../admin-layout/admin-layout.component';
import { ToastService } from '../../../shared/toasts/toast.service';
import { Router } from '@angular/router';
import { ApiService, Settings, UpdateSettingsDto } from '../../../api/api.service';

@Component({
  selector: 'app-admin-settings',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AdminLayoutComponent
  ],
  templateUrl: './admin-settings.component.html',
  styleUrl: './admin-settings.component.scss'
})
export class AdminSettingsComponent implements OnInit {
  settings: Settings | null = null;
  isLoading = true;
  isSaving = false;

  // Form Model
  formData: UpdateSettingsDto = {
    isUnderConstruction: false,
    maintenanceMessage: '',
    maintenancePassword: '',
    allowRegistration: true,
    allowNewsletter: true,
    siteTitle: '',
    siteDescription: '',
    contactEmail: '',
    contactPhone: ''
  };

  constructor(
    private api: ApiService,
    private toasts: ToastService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadSettings();
  }

  async loadSettings(): Promise<void> {
    try {
      this.isLoading = true;
      this.api.getSettings().subscribe({
        next: (settings) => {
          this.settings = settings;
          // Populate form
          this.formData = {
            isUnderConstruction: settings.isUnderConstruction,
            maintenanceMessage: settings.maintenanceMessage || '',
            maintenancePassword: settings.maintenancePassword || '',
            allowRegistration: settings.allowRegistration,
            allowNewsletter: settings.allowNewsletter,
            siteTitle: settings.siteTitle || '',
            siteDescription: settings.siteDescription || '',
            contactEmail: settings.contactEmail || '',
            contactPhone: settings.contactPhone || ''
          };
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Fehler beim Laden der Einstellungen:', error);
          this.toasts.error('Fehler beim Laden der Einstellungen');
          this.isLoading = false;
        }
      });
    } catch (error) {
      console.error('Fehler beim Laden der Einstellungen:', error);
      this.toasts.error('Fehler beim Laden der Einstellungen');
      this.isLoading = false;
    }
  }

  async saveSettings(): Promise<void> {
    try {
      this.isSaving = true;
      
      this.api.updateSettings(this.formData).subscribe({
        next: (updatedSettings) => {
          this.settings = updatedSettings;
          this.toasts.success('Einstellungen wurden erfolgreich gespeichert');
          this.isSaving = false;
        },
        error: (error) => {
          console.error('Fehler beim Speichern:', error);
          this.toasts.error('Fehler beim Speichern der Einstellungen');
          this.isSaving = false;
        }
      });
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
      this.toasts.error('Fehler beim Speichern der Einstellungen');
      this.isSaving = false;
    }
  }

  resetForm(): void {
    if (this.settings) {
      this.formData = {
        isUnderConstruction: this.settings.isUnderConstruction,
        maintenanceMessage: this.settings.maintenanceMessage || '',
        maintenancePassword: this.settings.maintenancePassword || '',
        allowRegistration: this.settings.allowRegistration,
        allowNewsletter: this.settings.allowNewsletter,
        siteTitle: this.settings.siteTitle || '',
        siteDescription: this.settings.siteDescription || '',
        contactEmail: this.settings.contactEmail || '',
        contactPhone: this.settings.contactPhone || ''
      };
      this.toasts.info('Formular wurde zurückgesetzt');
    }
  }
}