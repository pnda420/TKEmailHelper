import { Controller, Get, Post, Body, Param, Patch, Delete, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ContactRequestsService } from './contact-requests.service';
import { CreateContactRequestDto, UpdateContactRequestDto } from './contact-requests.dto';
import { AdminGuard } from 'src/auth/guards/admin.guard';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@Controller('contact-requests')
@Throttle({ default: { limit: 30, ttl: 60000 } }) // 🛡️ Basis: 30 Requests/Minute für alle Endpoints
export class ContactRequestsController {
  constructor(private readonly contactService: ContactRequestsService) {}

  // 🛡️ Öffentlich - STRENG: 5 Anfragen pro Stunde pro IP (Spam-Schutz)
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateContactRequestDto) {
    return this.contactService.create(dto);
  }

  // NUR ADMIN
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get()
  async findAll() {
    return this.contactService.findAll();
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('unprocessed')
  async findUnprocessed() {
    return this.contactService.findUnprocessed();
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.contactService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateContactRequestDto) {
    return this.contactService.update(id, dto);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch(':id/process')
  async markAsProcessed(@Param('id') id: string) {
    return this.contactService.markAsProcessed(id);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    return this.contactService.delete(id);
  }
}