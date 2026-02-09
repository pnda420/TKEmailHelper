import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, EmailTemplate, CreateTemplateDto } from '../../api/api.service';
import { ToastService } from '../../shared/toasts/toast.service';
import { PageTitleComponent } from '../../shared/page-title/page-title.component';
import { ConfirmationService } from '../../shared/confirmation/confirmation.service';

@Component({
  selector: 'app-email-templates',
  standalone: true,
  imports: [CommonModule, FormsModule, PageTitleComponent],
  templateUrl: './email-templates.component.html',
  styleUrl: './email-templates.component.scss'
})
export class EmailTemplatesComponent implements OnInit {
  templates: EmailTemplate[] = [];
  loading = false;
  
  // Form State
  showForm = false;
  editingTemplate: EmailTemplate | null = null;
  formData: CreateTemplateDto = {
    name: '',
    subject: '',
    body: '',
    category: ''
  };

  categories = ['Support', 'Vertrieb', 'Allgemein', 'Technik', 'Buchhaltung'];

  constructor(
    private api: ApiService,
    private toasts: ToastService,
    private confirmationService: ConfirmationService
  ) {}

  ngOnInit(): void {
    this.loadTemplates();
  }

  loadTemplates(): void {
    this.loading = true;
    this.api.getEmailTemplates().subscribe({
      next: (templates) => {
        this.templates = templates;
        this.loading = false;
      },
      error: (err) => {
        console.error('Fehler beim Laden:', err);
        this.toasts.error('Templates konnten nicht geladen werden');
        this.loading = false;
      }
    });
  }

  openNewForm(): void {
    this.editingTemplate = null;
    this.formData = { name: '', subject: '', body: '', category: '' };
    this.showForm = true;
  }

  openEditForm(template: EmailTemplate): void {
    this.editingTemplate = template;
    this.formData = {
      name: template.name,
      subject: template.subject || '',
      body: template.body,
      category: template.category || ''
    };
    this.showForm = true;
  }

  closeForm(): void {
    this.showForm = false;
    this.editingTemplate = null;
  }

  saveTemplate(): void {
    if (!this.formData.name || !this.formData.body) {
      this.toasts.error('Name und Text sind erforderlich');
      return;
    }

    if (this.editingTemplate) {
      // Update
      this.api.updateEmailTemplate(this.editingTemplate.id, this.formData).subscribe({
        next: () => {
          this.toasts.success('Template aktualisiert');
          this.closeForm();
          this.loadTemplates();
        },
        error: (err) => {
          console.error('Fehler:', err);
          this.toasts.error('Fehler beim Speichern');
        }
      });
    } else {
      // Create
      this.api.createEmailTemplate(this.formData).subscribe({
        next: () => {
          this.toasts.success('Template erstellt');
          this.closeForm();
          this.loadTemplates();
        },
        error: (err) => {
          console.error('Fehler:', err);
          this.toasts.error('Fehler beim Erstellen');
        }
      });
    }
  }

  async deleteTemplate(template: EmailTemplate): Promise<void> {
    const confirmed = await this.confirmationService.confirm({
      title: 'Template löschen',
      message: `Möchtest du das Template "${template.name}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`,
      confirmText: 'Löschen',
      cancelText: 'Abbrechen',
      type: 'danger',
      icon: 'delete'
    });

    if (!confirmed) return;

    this.api.deleteEmailTemplate(template.id).subscribe({
      next: () => {
        this.toasts.success('Template gelöscht');
        this.loadTemplates();
      },
      error: (err) => {
        console.error('Fehler:', err);
        this.toasts.error('Fehler beim Löschen');
      }
    });
  }

  getPreview(body: string): string {
    return body.length > 100 ? body.substring(0, 100) + '...' : body;
  }
}
