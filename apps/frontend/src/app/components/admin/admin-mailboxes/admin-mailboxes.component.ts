import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ApiService, Mailbox, CreateMailboxDto, UpdateMailboxDto } from '../../../api/api.service';
import { User } from '../../../services/auth.service';
import { AdminLayoutComponent } from '../admin-layout/admin-layout.component';
import { ConfirmationService } from '../../../shared/confirmation/confirmation.service';
import { ToastService } from '../../../shared/toasts/toast.service';

type FormTab = 'basic' | 'imap' | 'smtp' | 'company' | 'signature';

@Component({
  selector: 'app-admin-mailboxes',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminLayoutComponent],
  templateUrl: './admin-mailboxes.component.html',
  styleUrl: './admin-mailboxes.component.scss'
})
export class AdminMailboxesComponent implements OnInit {
  mailboxes: Mailbox[] = [];
  loading = true;
  error = '';

  // Modal state
  showModal = false;
  editingMailbox: Mailbox | null = null;
  saving = false;
  activeFormTab: FormTab = 'basic';

  // Form fields
  form: CreateMailboxDto & { isActive?: boolean } = this.getEmptyForm();

  // User assignment
  showAssignModal = false;
  assignMailbox: Mailbox | null = null;
  allUsers: User[] = [];
  assignedUserIds: string[] = [];
  loadingUsers = false;

  // User counts per mailbox (for display on cards)
  mailboxUserCounts: Record<string, number> = {};

  // Signature preview
  showSignaturePreview = false;

  // Password visibility
  showPassword = false;

  // Connection test
  testing = false;
  testResult: {
    imap: { success: boolean; message: string; durationMs: number };
    smtp: { success: boolean; message: string; durationMs: number };
  } | null = null;

  // Color presets for quick selection
  colorPresets = [
    '#1565c0', '#3b82f6', '#06b6d4', '#8b5cf6',
    '#ec4899', '#ef4444', '#f97316', '#22c55e',
  ];

  // Tab navigation order
  private tabOrder: FormTab[] = ['basic', 'imap', 'smtp', 'company', 'signature'];

  // Placeholder info for signature tab
  placeholders = [
    { key: '{{userName}}', label: 'Name' },
    { key: '{{userPosition}}', label: 'Position' },
    { key: '{{companyName}}', label: 'Firma' },
    { key: '{{companyPhone}}', label: 'Telefon' },
    { key: '{{companyWebsite}}', label: 'Website' },
    { key: '{{companyAddress}}', label: 'Adresse' },
  ];

  constructor(
    private api: ApiService,
    private toasts: ToastService,
    private confirmationService: ConfirmationService,
    private sanitizer: DomSanitizer,
  ) {}

  ngOnInit(): void {
    this.loadMailboxes();
  }

  // ════════════════════════════════════════════
  // COMPUTED PROPERTIES
  // ════════════════════════════════════════════

  get activeCount(): number {
    return this.mailboxes.filter(m => m.isActive).length;
  }

  get inactiveCount(): number {
    return this.mailboxes.filter(m => !m.isActive).length;
  }

  get canGoNext(): boolean {
    const idx = this.tabOrder.indexOf(this.activeFormTab);
    return idx < this.tabOrder.length - 1;
  }

  get canGoPrev(): boolean {
    return this.tabOrder.indexOf(this.activeFormTab) > 0;
  }

  get formValid(): boolean {
    return !!(
      this.form.name?.trim() &&
      this.form.email?.trim() &&
      this.form.imapHost?.trim() &&
      this.form.smtpHost?.trim() &&
      (this.editingMailbox || this.form.password?.trim())
    );
  }

  get signaturePreviewHtml(): SafeHtml {
    if (!this.form.signatureTemplate) return '';
    const html = this.form.signatureTemplate
      .replace(/\{\{userName\}\}/g, 'Max Mustermann')
      .replace(/\{\{userPosition\}\}/g, 'Geschäftsführer')
      .replace(/\{\{companyName\}\}/g, this.form.companyName || 'Firma GmbH')
      .replace(/\{\{companyPhone\}\}/g, this.form.companyPhone || '+49 123 456789')
      .replace(/\{\{companyWebsite\}\}/g, this.form.companyWebsite || 'www.example.com')
      .replace(/\{\{companyAddress\}\}/g, this.form.companyAddress || 'Musterstr. 1, 12345 Musterstadt');
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  // ════════════════════════════════════════════
  // DATA LOADING
  // ════════════════════════════════════════════

  private getEmptyForm(): CreateMailboxDto & { isActive?: boolean } {
    return {
      name: '',
      email: '',
      password: '',
      imapHost: '',
      smtpHost: '',
      imapPort: 993,
      smtpPort: 587,
      imapTls: true,
      smtpSecure: false,
      imapSourceFolder: 'INBOX',
      imapSentFolder: 'Sent',
      companyName: '',
      companyPhone: '',
      companyWebsite: '',
      companyAddress: '',
      signatureTemplate: '',
      color: '#1565c0',
      isActive: true,
    };
  }

  loadMailboxes(): void {
    this.loading = true;
    this.error = '';
    this.api.getAllMailboxes().subscribe({
      next: (mailboxes) => {
        this.mailboxes = mailboxes;
        this.loading = false;
        this.loadAllUserCounts();
      },
      error: (err) => {
        this.error = err.error?.message || 'Fehler beim Laden der Postfächer';
        this.loading = false;
      }
    });
  }

  /** Load user counts for all mailboxes (for card display) */
  private loadAllUserCounts(): void {
    for (const mb of this.mailboxes) {
      this.api.getMailboxUsers(mb.id).subscribe({
        next: (users) => {
          this.mailboxUserCounts[mb.id] = users.length;
        },
        error: () => {
          // Silently ignore
        }
      });
    }
  }

  // ════════════════════════════════════════════
  // TAB NAVIGATION
  // ════════════════════════════════════════════

  nextTab(): void {
    const idx = this.tabOrder.indexOf(this.activeFormTab);
    if (idx < this.tabOrder.length - 1) {
      this.activeFormTab = this.tabOrder[idx + 1];
    }
  }

  prevTab(): void {
    const idx = this.tabOrder.indexOf(this.activeFormTab);
    if (idx > 0) {
      this.activeFormTab = this.tabOrder[idx - 1];
    }
  }

  // ════════════════════════════════════════════
  // CRUD MODAL
  // ════════════════════════════════════════════

  openCreateModal(): void {
    this.editingMailbox = null;
    this.form = this.getEmptyForm();
    this.activeFormTab = 'basic';
    this.showSignaturePreview = false;
    this.showPassword = false;
    this.showModal = true;
  }

  openEditModal(mailbox: Mailbox): void {
    this.editingMailbox = mailbox;
    this.form = {
      name: mailbox.name,
      email: mailbox.email,
      password: '',
      imapHost: mailbox.imapHost,
      smtpHost: mailbox.smtpHost,
      imapPort: mailbox.imapPort,
      smtpPort: mailbox.smtpPort,
      imapTls: mailbox.imapTls,
      smtpSecure: mailbox.smtpSecure,
      imapSourceFolder: mailbox.imapSourceFolder,
      imapSentFolder: mailbox.imapSentFolder,
      companyName: mailbox.companyName || '',
      companyPhone: mailbox.companyPhone || '',
      companyWebsite: mailbox.companyWebsite || '',
      companyAddress: mailbox.companyAddress || '',
      signatureTemplate: mailbox.signatureTemplate || '',
      color: mailbox.color,
      isActive: mailbox.isActive,
    };
    this.activeFormTab = 'basic';
    this.showSignaturePreview = false;
    this.showPassword = false;
    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
    this.editingMailbox = null;
    this.showSignaturePreview = false;
    this.showPassword = false;
    this.testResult = null;
    this.testing = false;
  }

  saveMailbox(): void {
    this.saving = true;

    if (this.editingMailbox) {
      const dto: UpdateMailboxDto = { ...this.form };
      if (!dto.password) delete dto.password;
      this.api.updateMailbox(this.editingMailbox.id, dto).subscribe({
        next: () => {
          this.toasts.success('Postfach aktualisiert');
          this.saving = false;
          this.closeModal();
          this.loadMailboxes();
        },
        error: (err) => {
          this.toasts.error(err.error?.message || 'Fehler beim Speichern');
          this.saving = false;
        }
      });
    } else {
      const { isActive, ...createDto } = this.form;
      this.api.createMailbox(createDto).subscribe({
        next: () => {
          this.toasts.success('Postfach erstellt');
          this.saving = false;
          this.closeModal();
          this.loadMailboxes();
        },
        error: (err) => {
          this.toasts.error(err.error?.message || 'Fehler beim Erstellen');
          this.saving = false;
        }
      });
    }
  }

  async deleteMailbox(mailbox: Mailbox): Promise<void> {
    const confirmed = await this.confirmationService.confirm({
      title: 'Postfach löschen',
      message: `Möchtest du „${mailbox.name}" (${mailbox.email}) wirklich löschen? Alle Benutzerzuweisungen werden ebenfalls entfernt.`,
      confirmText: 'Ja, löschen',
      cancelText: 'Abbrechen',
      type: 'danger',
      icon: 'delete'
    });

    if (confirmed) {
      this.api.deleteMailbox(mailbox.id).subscribe({
        next: () => {
          this.toasts.success('Postfach gelöscht');
          this.loadMailboxes();
        },
        error: (err) => this.toasts.error(err.error?.message || 'Fehler beim Löschen')
      });
    }
  }

  toggleActive(mailbox: Mailbox): void {
    this.api.updateMailbox(mailbox.id, { isActive: !mailbox.isActive }).subscribe({
      next: () => {
        mailbox.isActive = !mailbox.isActive;
        this.toasts.success(mailbox.isActive ? 'Postfach aktiviert' : 'Postfach deaktiviert');
      },
      error: (err) => this.toasts.error(err.error?.message || 'Fehler')
    });
  }

  // ════════════════════════════════════════════
  // USER ASSIGNMENT
  // ════════════════════════════════════════════

  openAssignModal(mailbox: Mailbox): void {
    this.assignMailbox = mailbox;
    this.loadingUsers = true;
    this.showAssignModal = true;

    this.api.getAllUsers().subscribe({
      next: (users) => {
        this.allUsers = users;
        this.api.getMailboxUsers(mailbox.id).subscribe({
          next: (assigned) => {
            this.assignedUserIds = assigned.map((u: any) => u.userId);
            this.loadingUsers = false;
          },
          error: () => {
            this.assignedUserIds = [];
            this.loadingUsers = false;
          }
        });
      },
      error: () => {
        this.loadingUsers = false;
      }
    });
  }

  closeAssignModal(): void {
    this.showAssignModal = false;
    this.assignMailbox = null;
  }

  toggleUserAssignment(userId: string): void {
    const idx = this.assignedUserIds.indexOf(userId);
    if (idx >= 0) {
      this.assignedUserIds.splice(idx, 1);
    } else {
      this.assignedUserIds.push(userId);
    }
  }

  isUserAssigned(userId: string): boolean {
    return this.assignedUserIds.includes(userId);
  }

  saveAssignments(): void {
    if (!this.assignMailbox) return;
    this.saving = true;
    this.api.assignUsersToMailbox(this.assignMailbox.id, this.assignedUserIds).subscribe({
      next: () => {
        this.toasts.success('Benutzerzuweisungen gespeichert');
        this.saving = false;
        // Update user count on card
        if (this.assignMailbox) {
          this.mailboxUserCounts[this.assignMailbox.id] = this.assignedUserIds.length;
        }
        this.closeAssignModal();
      },
      error: (err) => {
        this.toasts.error(err.error?.message || 'Fehler beim Zuweisen');
        this.saving = false;
      }
    });
  }

  // ════════════════════════════════════════════
  // SIGNATURE HELPERS
  // ════════════════════════════════════════════

  generateDefaultSignature(): void {
    const color = this.form.color || '#1565c0';
    this.form.signatureTemplate = `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
<p style="margin: 0;">Mit freundlichen Grüßen</p>
<br>
<p style="margin: 0; font-weight: bold; font-size: 16px; color: #1a1a1a;">{{userName}}</p>
<p style="margin: 0; color: #555;">{{userPosition}}</p>
<p style="margin: 4px 0 0; font-weight: 600; color: ${color};">{{companyName}}</p>
<hr style="border: none; border-top: 2px solid ${color}; margin: 12px 0; width: 60px;">
<p style="margin: 0; font-size: 13px; color: #666;">
  Tel: {{companyPhone}} &nbsp;|&nbsp; <a href="https://{{companyWebsite}}" style="color: ${color}; text-decoration: none;">{{companyWebsite}}</a>
</p>
<p style="margin: 4px 0 0; font-size: 12px; color: #999;">{{companyAddress}}</p>
</div>`;
  }

  /** Insert a placeholder at the end of the signature textarea */
  insertPlaceholder(key: string): void {
    this.form.signatureTemplate = (this.form.signatureTemplate || '') + key;
    this.showSignaturePreview = false;
  }

  // ════════════════════════════════════════════
  // CONNECTION TEST
  // ════════════════════════════════════════════

  /** Test connection using current modal form values */
  testConnectionFromForm(): void {
    this.testing = true;
    this.testResult = null;

    const params: any = {
      email: this.form.email,
      password: this.form.password || undefined,
      imapHost: this.form.imapHost,
      imapPort: this.form.imapPort,
      imapTls: this.form.imapTls,
      smtpHost: this.form.smtpHost,
      smtpPort: this.form.smtpPort,
      smtpSecure: this.form.smtpSecure,
    };

    // If editing and no new password, use saved credentials via mailboxId
    if (this.editingMailbox && !this.form.password) {
      params.mailboxId = this.editingMailbox.id;
      delete params.password;
    }

    this.api.testMailboxConnection(params).subscribe({
      next: (result) => {
        this.testResult = result;
        this.testing = false;
      },
      error: (err) => {
        this.testResult = {
          imap: { success: false, message: err.error?.message || 'Request fehlgeschlagen', durationMs: 0 },
          smtp: { success: false, message: err.error?.message || 'Request fehlgeschlagen', durationMs: 0 },
        };
        this.testing = false;
      },
    });
  }

  /** Test connection for an existing mailbox card */
  testConnectionForMailbox(mailbox: Mailbox): void {
    this.testing = true;
    this.testResult = null;
    // Open a mini test by using mailboxId
    this.api.testMailboxConnection({ mailboxId: mailbox.id }).subscribe({
      next: (result) => {
        this.testing = false;
        const imapIcon = result.imap.success ? '✅' : '❌';
        const smtpIcon = result.smtp.success ? '✅' : '❌';
        if (result.imap.success && result.smtp.success) {
          this.toasts.success(`${imapIcon} IMAP: ${result.imap.message}\n${smtpIcon} SMTP: ${result.smtp.message}`);
        } else {
          this.toasts.error(`${imapIcon} IMAP: ${result.imap.message}\n${smtpIcon} SMTP: ${result.smtp.message}`);
        }
      },
      error: (err) => {
        this.testing = false;
        this.toasts.error(err.error?.message || 'Test fehlgeschlagen');
      },
    });
  }
}
