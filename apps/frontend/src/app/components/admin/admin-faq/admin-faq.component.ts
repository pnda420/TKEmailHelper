import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminLayoutComponent } from '../admin-layout/admin-layout.component';
import { ToastService } from '../../../shared/toasts/toast.service';
import { ConfirmationService } from '../../../shared/confirmation/confirmation.service';
import { 
  ApiService, 
  Faq, 
  CreateFaqDto, 
  UpdateFaqDto, 
  ImportFaqResultDto 
} from '../../../api/api.service';

interface FaqFormModel {
  slug: string;
  question: string;
  answers: string[];
  listItems: string[];
  sortOrder: number;
  isPublished: boolean;
  category: string;
}

@Component({
  selector: 'app-admin-faq',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AdminLayoutComponent
  ],
  templateUrl: './admin-faq.component.html',
  styleUrl: './admin-faq.component.scss'
})
export class AdminFaqComponent implements OnInit {
  faqs: Faq[] = [];
  isLoading = true;
  isSaving = false;
  
  // Editor State
  showEditor = false;
  editingFaq: Faq | null = null;
  
  // Form Model
  formModel: FaqFormModel = this.getEmptyForm();
  
  // Temp fields for adding answers/list items
  newAnswer = '';
  newListItem = '';
  
  // Import/Export
  showImportModal = false;
  importJson = '';
  importOverwrite = false;

  constructor(
    private api: ApiService,
    private toasts: ToastService,
    private confirmationService: ConfirmationService
  ) {}

  // Getter für die Anzahl veröffentlichter FAQs
  get publishedCount(): number {
    return this.faqs.filter(f => f.isPublished).length;
  }

  ngOnInit(): void {
    this.loadFaqs();
  }

  // ===== DATA LOADING =====

  loadFaqs(): void {
    this.isLoading = true;
    this.api.getAllFaqs().subscribe({
      next: (data) => {
        this.faqs = data;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Fehler beim Laden der FAQs:', err);
        this.toasts.error('Fehler beim Laden der FAQs');
        this.isLoading = false;
      }
    });
  }

  // ===== EDITOR =====

  openCreateEditor(): void {
    this.editingFaq = null;
    this.formModel = this.getEmptyForm();
    this.showEditor = true;
  }

  openEditEditor(faq: Faq): void {
    this.editingFaq = faq;
    this.formModel = {
      slug: faq.slug,
      question: faq.question,
      answers: [...faq.answers],
      listItems: faq.listItems ? [...faq.listItems] : [],
      sortOrder: faq.sortOrder,
      isPublished: faq.isPublished,
      category: faq.category || ''
    };
    this.showEditor = true;
  }

  closeEditor(): void {
    this.showEditor = false;
    this.editingFaq = null;
    this.formModel = this.getEmptyForm();
    this.newAnswer = '';
    this.newListItem = '';
  }

  // ===== FORM HELPERS =====

  private getEmptyForm(): FaqFormModel {
    return {
      slug: '',
      question: '',
      answers: [],
      listItems: [],
      sortOrder: 0,
      isPublished: true,
      category: ''
    };
  }

  generateSlug(): void {
    if (this.formModel.question && !this.editingFaq) {
      this.formModel.slug = this.formModel.question
        .toLowerCase()
        .replace(/[äÄ]/g, 'ae')
        .replace(/[öÖ]/g, 'oe')
        .replace(/[üÜ]/g, 'ue')
        .replace(/ß/g, 'ss')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 50);
    }
  }

  // Answers Management
  addAnswer(): void {
    if (this.newAnswer.trim()) {
      this.formModel.answers.push(this.newAnswer.trim());
      this.newAnswer = '';
    }
  }

  removeAnswer(index: number): void {
    this.formModel.answers.splice(index, 1);
  }

  moveAnswerUp(index: number): void {
    if (index > 0) {
      [this.formModel.answers[index - 1], this.formModel.answers[index]] = 
      [this.formModel.answers[index], this.formModel.answers[index - 1]];
    }
  }

  moveAnswerDown(index: number): void {
    if (index < this.formModel.answers.length - 1) {
      [this.formModel.answers[index], this.formModel.answers[index + 1]] = 
      [this.formModel.answers[index + 1], this.formModel.answers[index]];
    }
  }

  // List Items Management
  addListItem(): void {
    if (this.newListItem.trim()) {
      this.formModel.listItems.push(this.newListItem.trim());
      this.newListItem = '';
    }
  }

  removeListItem(index: number): void {
    this.formModel.listItems.splice(index, 1);
  }

  // ===== CRUD OPERATIONS =====

  saveFaq(): void {
    if (!this.formModel.slug || !this.formModel.question || this.formModel.answers.length === 0) {
      this.toasts.error('Bitte fülle alle Pflichtfelder aus (Slug, Frage, mind. 1 Antwort)');
      return;
    }

    this.isSaving = true;

    const dto: CreateFaqDto | UpdateFaqDto = {
      slug: this.formModel.slug,
      question: this.formModel.question,
      answers: this.formModel.answers,
      listItems: this.formModel.listItems.length > 0 ? this.formModel.listItems : undefined,
      sortOrder: this.formModel.sortOrder,
      isPublished: this.formModel.isPublished,
      category: this.formModel.category || undefined
    };

    if (this.editingFaq) {
      // Update
      this.api.updateFaq(this.editingFaq.id, dto).subscribe({
        next: () => {
          this.toasts.success('FAQ erfolgreich aktualisiert');
          this.closeEditor();
          this.loadFaqs();
          this.isSaving = false;
        },
        error: (err) => {
          console.error('Fehler beim Aktualisieren:', err);
          this.toasts.error(err.error?.message || 'Fehler beim Aktualisieren');
          this.isSaving = false;
        }
      });
    } else {
      // Create
      this.api.createFaq(dto as CreateFaqDto).subscribe({
        next: () => {
          this.toasts.success('FAQ erfolgreich erstellt');
          this.closeEditor();
          this.loadFaqs();
          this.isSaving = false;
        },
        error: (err) => {
          console.error('Fehler beim Erstellen:', err);
          this.toasts.error(err.error?.message || 'Fehler beim Erstellen');
          this.isSaving = false;
        }
      });
    }
  }

  async deleteFaq(faq: Faq): Promise<void> {
    const confirmed = await this.confirmationService.confirm({
      title: 'FAQ löschen',
      message: `Möchtest du "${faq.question}" wirklich löschen?`,
      type: 'danger',
      confirmText: 'Löschen',
      cancelText: 'Abbrechen'
    });
    
    if (confirmed) {
      this.api.deleteFaq(faq.id).subscribe({
        next: () => {
          this.toasts.success('FAQ gelöscht');
          this.loadFaqs();
        },
        error: (err) => {
          console.error('Fehler beim Löschen:', err);
          this.toasts.error('Fehler beim Löschen');
        }
      });
    }
  }

  togglePublish(faq: Faq): void {
    this.api.toggleFaqPublish(faq.id).subscribe({
      next: (updated) => {
        const index = this.faqs.findIndex(f => f.id === faq.id);
        if (index !== -1) {
          this.faqs[index] = updated;
        }
        this.toasts.success(updated.isPublished ? 'FAQ veröffentlicht' : 'FAQ versteckt');
      },
      error: (err) => {
        console.error('Fehler:', err);
        this.toasts.error('Fehler beim Ändern des Status');
      }
    });
  }

  // ===== IMPORT / EXPORT =====

  openImportModal(): void {
    this.importJson = '';
    this.importOverwrite = false;
    this.showImportModal = true;
  }

  closeImportModal(): void {
    this.showImportModal = false;
    this.importJson = '';
  }

  importFaqs(): void {
    if (!this.importJson.trim()) {
      this.toasts.error('Bitte JSON eingeben');
      return;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(this.importJson);
    } catch (e) {
      this.toasts.error('Ungültiges JSON-Format');
      return;
    }

    // Support both array and object with faqs property
    const faqsArray = Array.isArray(parsed) ? parsed : parsed.faqs;
    
    if (!Array.isArray(faqsArray)) {
      this.toasts.error('JSON muss ein Array von FAQs sein oder ein Objekt mit "faqs" Property');
      return;
    }

    // Transform to match backend format if needed
    const transformedFaqs = faqsArray.map((f: any) => ({
      slug: f.slug || f.id,
      question: f.question || f.q,
      answers: f.answers || f.a,
      listItems: f.listItems || f.list,
      sortOrder: f.sortOrder ?? 0,
      isPublished: f.isPublished ?? true,
      category: f.category
    }));

    this.isSaving = true;
    this.api.importFaqs({ 
      faqs: transformedFaqs, 
      overwriteExisting: this.importOverwrite 
    }).subscribe({
      next: (result: ImportFaqResultDto) => {
        this.toasts.success(
          `Import abgeschlossen: ${result.imported} neu, ${result.updated} aktualisiert, ${result.skipped} übersprungen`
        );
        if (result.errors.length > 0) {
          console.warn('Import Fehler:', result.errors);
        }
        this.closeImportModal();
        this.loadFaqs();
        this.isSaving = false;
      },
      error: (err) => {
        console.error('Import Fehler:', err);
        this.toasts.error('Fehler beim Import');
        this.isSaving = false;
      }
    });
  }

  exportFaqs(): void {
    this.api.exportFaqs().subscribe({
      next: (data) => {
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `faqs-export-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.toasts.success('Export erfolgreich');
      },
      error: (err) => {
        console.error('Export Fehler:', err);
        this.toasts.error('Fehler beim Export');
      }
    });
  }

  // ===== HELPERS =====

  trackById(_: number, faq: Faq): string {
    return faq.id;
  }
}
