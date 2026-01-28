import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateContactRequestDto, UpdateContactRequestDto } from './contact-requests.dto';
import { ContactRequest } from './contact-requests.entity';
import { EmailService } from 'src/email/email.service';

@Injectable()
export class ContactRequestsService {
  constructor(
    @InjectRepository(ContactRequest)
    private readonly contactRepo: Repository<ContactRequest>,
    private readonly emailService: EmailService
  ) { }

  async create(dto: CreateContactRequestDto): Promise<ContactRequest> {
    const request = this.contactRepo.create(dto);
    const saved = await this.contactRepo.save(request);

    // Danke-Email an den User schicken
    await this.emailService.sendContactRequestConfirmation({
      userEmail: dto.email,
      userName: dto.name,
      serviceType: dto.serviceType,
    });

    // Admin-Email an den Admin schicken
    await this.emailService.sendContactRequestConfirmationAdmin({
      userEmail: dto.email,
      userName: dto.name,
      serviceType: dto.serviceType,
      message: dto.message,
      phoneNumber: dto.phoneNumber,
      prefersCallback: dto.prefersCallback,
    });

    return saved;
  }

  async findAll(): Promise<ContactRequest[]> {
    return this.contactRepo.find({
      order: { createdAt: 'DESC' },
      relations: ['user'],
    });
  }

  async findUnprocessed(): Promise<ContactRequest[]> {
    return this.contactRepo.find({
      where: { isProcessed: false },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<ContactRequest> {
    const request = await this.contactRepo.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!request) {
      throw new NotFoundException(`Contact request with ID ${id} not found`);
    }

    return request;
  }

  async update(id: string, dto: UpdateContactRequestDto): Promise<ContactRequest> {
    const request = await this.findOne(id);
    Object.assign(request, dto);
    return this.contactRepo.save(request);
  }

  async markAsProcessed(id: string): Promise<ContactRequest> {
    return this.update(id, { isProcessed: true });
  }

  async delete(id: string): Promise<void> {
    const result = await this.contactRepo.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Contact request with ID ${id} not found`);
    }
  }
}