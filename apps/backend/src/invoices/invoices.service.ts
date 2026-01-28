import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from './invoices.entity';
import { CreateInvoiceDto, UpdateInvoiceDto } from './invoices.dto';

@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(Invoice)
    private invoicesRepository: Repository<Invoice>,
  ) {}

  async findAll(): Promise<Invoice[]> {
    return this.invoicesRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Invoice> {
    const invoice = await this.invoicesRepository.findOne({ where: { id } });
    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${id} not found`);
    }
    return invoice;
  }

  async create(createDto: CreateInvoiceDto): Promise<Invoice> {
    const { totalNet, totalGross } = this.calculateTotals(createDto.items, createDto.taxRate || 19);
    
    const invoice = this.invoicesRepository.create({
      ...createDto,
      status: createDto.status || 'draft',
      taxRate: createDto.taxRate || 19,
      totalNet,
      totalGross,
    });
    
    return this.invoicesRepository.save(invoice);
  }

  async update(id: string, updateDto: UpdateInvoiceDto): Promise<Invoice> {
    const invoice = await this.findOne(id);
    
    // Recalculate totals if items or taxRate changed
    const items = updateDto.items || invoice.items;
    const taxRate = updateDto.taxRate !== undefined ? updateDto.taxRate : invoice.taxRate;
    const { totalNet, totalGross } = this.calculateTotals(items, taxRate);
    
    Object.assign(invoice, {
      ...updateDto,
      totalNet,
      totalGross,
    });
    
    return this.invoicesRepository.save(invoice);
  }

  async updateStatus(id: string, status: Invoice['status']): Promise<Invoice> {
    const invoice = await this.findOne(id);
    invoice.status = status;
    return this.invoicesRepository.save(invoice);
  }

  async remove(id: string): Promise<void> {
    const invoice = await this.findOne(id);
    await this.invoicesRepository.remove(invoice);
  }

  async duplicate(id: string): Promise<Invoice> {
    const original = await this.findOne(id);
    
    // Generate new invoice number
    const newNumber = await this.generateInvoiceNumber();
    
    const duplicate = this.invoicesRepository.create({
      ...original,
      id: undefined,
      invoiceNumber: newNumber,
      status: 'draft',
      date: new Date().toISOString().split('T')[0],
      dueDate: this.getDefaultDueDate(),
      createdAt: undefined,
      updatedAt: undefined,
    });
    
    return this.invoicesRepository.save(duplicate);
  }

  async generateInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `RE-${year}-`;
    
    const lastInvoice = await this.invoicesRepository
      .createQueryBuilder('invoice')
      .where('invoice.invoiceNumber LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('invoice.invoiceNumber', 'DESC')
      .getOne();
    
    let nextNumber = 1;
    if (lastInvoice) {
      const lastNum = parseInt(lastInvoice.invoiceNumber.replace(prefix, ''), 10);
      nextNumber = lastNum + 1;
    }
    
    return `${prefix}${nextNumber.toString().padStart(4, '0')}`;
  }

  async getStats() {
    const invoices = await this.findAll();
    
    return {
      total: invoices.length,
      draft: invoices.filter(i => i.status === 'draft').length,
      sent: invoices.filter(i => i.status === 'sent').length,
      paid: invoices.filter(i => i.status === 'paid').length,
      overdue: invoices.filter(i => i.status === 'overdue').length,
      totalRevenue: invoices
        .filter(i => i.status === 'paid')
        .reduce((sum, i) => sum + Number(i.totalGross), 0),
    };
  }

  private calculateTotals(items: any[], taxRate: number) {
    const totalNet = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    const totalGross = totalNet * (1 + taxRate / 100);
    return { totalNet, totalGross };
  }

  private getDefaultDueDate(): string {
    const date = new Date();
    date.setDate(date.getDate() + 14);
    return date.toISOString().split('T')[0];
  }
}
