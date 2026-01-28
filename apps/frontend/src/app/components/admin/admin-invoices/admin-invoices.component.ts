import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminLayoutComponent } from '../admin-layout/admin-layout.component';
import { IconComponent } from '../../../shared/icon/icon.component';
import { ToastService } from '../../../shared/toasts/toast.service';
import { ConfirmationService } from '../../../shared/confirmation/confirmation.service';
import { InvoicesApiService, Invoice, InvoiceItem, InvoiceStats } from '../../../api/invoices-api.service';

@Component({
  selector: 'app-admin-invoices',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminLayoutComponent, IconComponent],
  templateUrl: './admin-invoices.component.html',
  styleUrls: ['./admin-invoices.component.scss']
})
export class AdminInvoicesComponent implements OnInit {
  invoices: Invoice[] = [];
  loading = false;
  
  // Modal State
  showEditor = false;
  editingInvoice: Invoice | null = null;
  
  // Form Model
  form: Partial<Invoice> = this.getEmptyInvoice();
  
  // PDF Preview
  showPreview = false;
  
  // Sorting
  sortField: keyof Invoice = 'createdAt';
  sortDirection: 'asc' | 'desc' = 'desc';
  
  // Expanded rows
  expandedIds = new Set<string>();
  
  // Stats
  stats: InvoiceStats = {
    total: 0,
    draft: 0,
    sent: 0,
    paid: 0,
    overdue: 0,
    totalRevenue: 0
  };

  constructor(
    private toasts: ToastService,
    private invoicesApi: InvoicesApiService,
    private confirmationService: ConfirmationService
  ) {}

  ngOnInit(): void {
    this.loadInvoices();
  }

  loadInvoices(): void {
    this.loading = true;
    this.invoicesApi.getAll().subscribe({
      next: (invoices) => {
        this.invoices = invoices;
        this.sortInvoices();
        this.loading = false;
        this.loadStats();
      },
      error: (err) => {
        console.error('Error loading invoices', err);
        this.toasts.error('Fehler beim Laden der Rechnungen');
        this.loading = false;
      }
    });
  }

  loadStats(): void {
    this.invoicesApi.getStats().subscribe({
      next: (stats) => this.stats = stats,
      error: () => {
        this.stats = {
          total: this.invoices.length,
          draft: this.invoices.filter(i => i.status === 'draft').length,
          sent: this.invoices.filter(i => i.status === 'sent').length,
          paid: this.invoices.filter(i => i.status === 'paid').length,
          overdue: this.invoices.filter(i => i.status === 'overdue').length,
          totalRevenue: this.invoices
            .filter(i => i.status === 'paid')
            .reduce((sum, i) => sum + Number(i.totalGross || 0), 0)
        };
      }
    });
  }

  // ===== SORTING =====

  sortBy(field: keyof Invoice): void {
    if (this.sortField === field) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDirection = 'desc';
    }
    this.sortInvoices();
  }

  sortInvoices(): void {
    this.invoices.sort((a, b) => {
      let aVal = a[this.sortField];
      let bVal = b[this.sortField];
      
      if (aVal == null) aVal = '' as any;
      if (bVal == null) bVal = '' as any;
      
      let comparison = 0;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        comparison = aVal.localeCompare(bVal);
      } else if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }
      
      return this.sortDirection === 'asc' ? comparison : -comparison;
    });
  }

  getSortIcon(field: keyof Invoice): string {
    if (this.sortField !== field) return 'unfold_more';
    return this.sortDirection === 'asc' ? 'expand_less' : 'expand_more';
  }

  // ===== EXPAND/COLLAPSE =====

  toggleExpand(id: string): void {
    if (this.expandedIds.has(id)) {
      this.expandedIds.delete(id);
    } else {
      this.expandedIds.add(id);
    }
  }

  isExpanded(id: string): boolean {
    return this.expandedIds.has(id);
  }

  // ===== CRUD =====

  openCreateModal(): void {
    this.editingInvoice = null;
    this.form = this.getEmptyInvoice();
    
    this.invoicesApi.generateNumber().subscribe({
      next: (num) => this.form.invoiceNumber = num,
      error: () => this.form.invoiceNumber = this.generateLocalInvoiceNumber()
    });
    
    this.showEditor = true;
  }

  openEditModal(invoice: Invoice, event: Event): void {
    event.stopPropagation();
    this.editingInvoice = invoice;
    this.form = JSON.parse(JSON.stringify(invoice));
    this.showEditor = true;
  }

  closeEditor(): void {
    this.showEditor = false;
    this.editingInvoice = null;
  }

  saveInvoice(): void {
    if (!this.validateForm()) {
      this.toasts.error('Bitte fülle alle Pflichtfelder aus');
      return;
    }

    if (this.editingInvoice) {
      this.invoicesApi.update(this.editingInvoice.id, this.form).subscribe({
        next: () => {
          this.toasts.success('Rechnung aktualisiert');
          this.loadInvoices();
          this.closeEditor();
        },
        error: () => this.toasts.error('Fehler beim Speichern')
      });
    } else {
      this.invoicesApi.create(this.form).subscribe({
        next: () => {
          this.toasts.success('Rechnung erstellt');
          this.loadInvoices();
          this.closeEditor();
        },
        error: () => this.toasts.error('Fehler beim Erstellen')
      });
    }
  }

  async deleteInvoice(invoice: Invoice, event: Event): Promise<void> {
    event.stopPropagation();
    
    const confirmed = await this.confirmationService.confirm({
      title: 'Rechnung löschen',
      message: 'Möchtest du diese Rechnung wirklich löschen?',
      type: 'danger',
      confirmText: 'Löschen',
      cancelText: 'Abbrechen'
    });
    
    if (!confirmed) return;
    
    this.invoicesApi.delete(invoice.id).subscribe({
      next: () => {
        this.toasts.success('Rechnung gelöscht');
        this.loadInvoices();
      },
      error: () => this.toasts.error('Fehler beim Löschen')
    });
  }

  duplicateInvoice(invoice: Invoice, event: Event): void {
    event.stopPropagation();
    this.invoicesApi.duplicate(invoice.id).subscribe({
      next: () => {
        this.toasts.success('Rechnung dupliziert');
        this.loadInvoices();
      },
      error: () => this.toasts.error('Fehler beim Duplizieren')
    });
  }

  // ===== ITEMS =====

  addItem(): void {
    if (!this.form.items) this.form.items = [];
    this.form.items.push({
      id: crypto.randomUUID(),
      description: '',
      quantity: 1,
      unit: 'Stk.',
      unitPrice: 0
    });
  }

  removeItem(index: number): void {
    this.form.items?.splice(index, 1);
  }

  // ===== CALCULATIONS =====

  calculateTotal(items: InvoiceItem[], taxRate: number) {
    const net = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    const tax = net * (taxRate / 100);
    const gross = net + tax;
    return { net, tax, gross };
  }

  get formTotals() {
    return this.calculateTotal(this.form.items || [], this.form.taxRate || 19);
  }

  // ===== PDF EXPORT =====

  async exportPdf(invoice: Invoice | Partial<Invoice>, event?: Event): Promise<void> {
    event?.stopPropagation();
    this.toasts.info('PDF wird erstellt...');
    
    const jspdfModule = await import('jspdf');
    const jsPDF = jspdfModule.default;
    
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    let y = 20;

    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, pageWidth, 45, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('RECHNUNG', margin, 28);
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`Nr. ${invoice.invoiceNumber}`, pageWidth - margin, 20, { align: 'right' });
    doc.text(`Datum: ${this.formatDate(invoice.date || '')}`, pageWidth - margin, 27, { align: 'right' });
    doc.text(`Fällig: ${this.formatDate(invoice.dueDate || '')}`, pageWidth - margin, 34, { align: 'right' });

    y = 60;
    doc.setTextColor(30, 41, 59);

    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('Leonards & Brandenburger IT · Musterstraße 1 · 12345 Musterstadt', margin, y);
    
    y += 12;

    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.text(invoice.customerName || '', margin, y);
    doc.setFont('helvetica', 'normal');
    y += 6;
    doc.text(invoice.customerAddress || '', margin, y);
    y += 5;
    doc.text(`${invoice.customerZip || ''} ${invoice.customerCity || ''}`, margin, y);
    if (invoice.customerEmail) {
      y += 5;
      doc.setTextColor(100, 116, 139);
      doc.text(invoice.customerEmail, margin, y);
    }

    y += 20;

    doc.setFillColor(248, 250, 252);
    doc.rect(margin, y - 5, pageWidth - 2 * margin, 10, 'F');
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text('Beschreibung', margin + 3, y + 1);
    doc.text('Menge', margin + 95, y + 1);
    doc.text('Einheit', margin + 115, y + 1);
    doc.text('Preis', margin + 135, y + 1);
    doc.text('Gesamt', pageWidth - margin - 3, y + 1, { align: 'right' });

    y += 10;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 41, 59);

    for (const item of (invoice.items || [])) {
      doc.setFontSize(10);
      doc.text(item.description || '-', margin + 3, y + 1);
      doc.text(item.quantity.toString(), margin + 95, y + 1);
      doc.text(item.unit, margin + 115, y + 1);
      doc.text(this.formatCurrency(item.unitPrice), margin + 135, y + 1);
      doc.text(this.formatCurrency(item.quantity * item.unitPrice), pageWidth - margin - 3, y + 1, { align: 'right' });
      
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, y + 4, pageWidth - margin, y + 4);
      
      y += 10;
    }

    y += 10;

    const totals = this.calculateTotal(invoice.items || [], invoice.taxRate || 19);
    const sumX = pageWidth - margin - 60;
    
    doc.setFontSize(10);
    doc.text('Netto:', sumX, y);
    doc.text(this.formatCurrency(totals.net), pageWidth - margin, y, { align: 'right' });
    
    y += 7;
    doc.text(`MwSt. (${invoice.taxRate || 19}%):`, sumX, y);
    doc.text(this.formatCurrency(totals.tax), pageWidth - margin, y, { align: 'right' });
    
    y += 3;
    doc.setDrawColor(37, 99, 235);
    doc.setLineWidth(0.5);
    doc.line(sumX, y, pageWidth - margin, y);
    
    y += 8;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Gesamt:', sumX, y);
    doc.setTextColor(37, 99, 235);
    doc.text(this.formatCurrency(totals.gross), pageWidth - margin, y, { align: 'right' });

    if (invoice.notes) {
      y += 20;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text('Hinweise:', margin, y);
      y += 5;
      doc.setTextColor(71, 85, 105);
      const splitNotes = doc.splitTextToSize(invoice.notes, pageWidth - 2 * margin);
      doc.text(splitNotes, margin, y);
    }

    const footerY = doc.internal.pageSize.getHeight() - 20;
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text('Leonards & Brandenburger IT', margin, footerY);
    doc.text('IBAN: DE12 3456 7890 1234 5678 90 · BIC: DEUTDEDB', pageWidth / 2, footerY, { align: 'center' });
    doc.text(`Seite 1 von 1`, pageWidth - margin, footerY, { align: 'right' });

    doc.save(`Rechnung_${invoice.invoiceNumber}.pdf`);
    this.toasts.success('PDF wurde heruntergeladen');
  }

  // ===== PREVIEW =====

  openPreview(invoice: Invoice, event: Event): void {
    event.stopPropagation();
    this.form = JSON.parse(JSON.stringify(invoice));
    this.showPreview = true;
  }

  closePreview(): void {
    this.showPreview = false;
  }

  // ===== STATUS =====

  setStatus(invoice: Invoice, status: Invoice['status'], event: Event): void {
    event.stopPropagation();
    this.invoicesApi.updateStatus(invoice.id, status).subscribe({
      next: () => {
        this.toasts.success(`Status auf "${this.getStatusLabel(status)}" geändert`);
        this.loadInvoices();
      },
      error: () => this.toasts.error('Fehler beim Ändern des Status')
    });
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      draft: 'Entwurf',
      sent: 'Gesendet',
      paid: 'Bezahlt',
      overdue: 'Überfällig'
    };
    return labels[status] || status;
  }

  getStatusIcon(status: string): string {
    const icons: Record<string, string> = {
      draft: 'edit_note',
      sent: 'send',
      paid: 'check_circle',
      overdue: 'warning'
    };
    return icons[status] || 'help';
  }

  // ===== HELPERS =====

  private getEmptyInvoice(): Partial<Invoice> {
    return {
      invoiceNumber: '',
      date: new Date().toISOString().split('T')[0],
      dueDate: this.getDefaultDueDate(),
      status: 'draft',
      customerName: '',
      customerEmail: '',
      customerAddress: '',
      customerCity: '',
      customerZip: '',
      items: [
        {
          id: crypto.randomUUID(),
          description: '',
          quantity: 1,
          unit: 'Stk.',
          unitPrice: 0
        }
      ],
      taxRate: 19,
      notes: 'Zahlbar innerhalb von 14 Tagen ohne Abzug.'
    };
  }

  private generateLocalInvoiceNumber(): string {
    const year = new Date().getFullYear();
    const count = this.invoices.filter(i => 
      i.invoiceNumber.startsWith(`RE-${year}`)
    ).length + 1;
    return `RE-${year}-${count.toString().padStart(4, '0')}`;
  }

  private getDefaultDueDate(): string {
    const date = new Date();
    date.setDate(date.getDate() + 14);
    return date.toISOString().split('T')[0];
  }

  private validateForm(): boolean {
    return !!(
      this.form.customerName &&
      this.form.invoiceNumber &&
      this.form.items &&
      this.form.items.length > 0 &&
      this.form.items.every(i => i.description && i.quantity > 0)
    );
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('de-DE');
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  }

  trackByItemId(_: number, item: InvoiceItem): string {
    return item.id;
  }

  trackByInvoiceId(_: number, invoice: Invoice): string {
    return invoice.id;
  }
}
