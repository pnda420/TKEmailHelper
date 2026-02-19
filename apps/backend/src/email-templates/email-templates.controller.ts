import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { EmailTemplatesService, CreateTemplateDto, UpdateTemplateDto, GenerateEmailDto, ReviseEmailDto, SendReplyDto } from './email-templates.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/users.entity';

@Controller('email-templates')
@UseGuards(JwtAuthGuard)
export class EmailTemplatesController {
  constructor(private readonly templatesService: EmailTemplatesService) {}

  // ==================== TEMPLATE CRUD ====================

  @Post()
  async createTemplate(@Body() dto: CreateTemplateDto) {
    return this.templatesService.createTemplate(dto);
  }

  @Get()
  async getAllTemplates() {
    return this.templatesService.getAllTemplates();
  }

  @Get(':id')
  async getTemplateById(@Param('id') id: string) {
    return this.templatesService.getTemplateById(id);
  }

  @Put(':id')
  async updateTemplate(@Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return this.templatesService.updateTemplate(id, dto);
  }

  @Delete(':id')
  async deleteTemplate(@Param('id') id: string) {
    await this.templatesService.deleteTemplate(id);
    return { success: true, message: 'Template gelöscht' };
  }

  // ==================== GPT GENERATION ====================

  @Post('generate')
  async generateEmail(@Body() dto: GenerateEmailDto, @CurrentUser() user: User) {
    return this.templatesService.generateEmailWithGPT(dto, user);
  }

  // ==================== GPT EMAIL REVISION ====================

  @Post('revise')
  async reviseEmail(@Body() dto: ReviseEmailDto, @CurrentUser() user: User) {
    return this.templatesService.reviseEmailWithGPT(dto, user);
  }

  // ==================== AI EMAIL SUMMARY ====================

  @Post('summarize')
  async summarizeEmail(@Body() body: { subject: string; body: string }) {
    return this.templatesService.summarizeEmail(body.subject, body.body);
  }

  // ==================== AI TEMPLATE RECOMMENDATION ====================

  @Post('recommend')
  async recommendTemplate(@Body() body: { subject: string; body: string }) {
    return this.templatesService.recommendTemplate(body.subject, body.body);
  }

  // ==================== SEND EMAIL ====================

  @Post('send')
  @UseInterceptors(FilesInterceptor('attachments', 20, {
    limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB per file
  }))
  async sendReply(
    @Body() dto: SendReplyDto,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: User,
  ) {
    return this.templatesService.sendReply(dto, user, files);
  }
}
