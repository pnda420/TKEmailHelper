import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/users.entity';
import { MailboxesService } from './mailboxes.service';
import { CreateMailboxDto, UpdateMailboxDto, AssignMailboxDto, SetActiveMailboxesDto } from './mailboxes.dto';

@Controller('mailboxes')
@UseGuards(JwtAuthGuard)
export class MailboxesController {
  constructor(private readonly mailboxesService: MailboxesService) {}

  // ==================== ADMIN: MAILBOX CRUD ====================

  @UseGuards(AdminGuard)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateMailboxDto) {
    return this.mailboxesService.create(dto);
  }

  @UseGuards(AdminGuard)
  @Get('admin/all')
  async findAll() {
    return this.mailboxesService.findAll();
  }

  @UseGuards(AdminGuard)
  @Get('admin/:id')
  async findOne(@Param('id') id: string) {
    return this.mailboxesService.findOne(id);
  }

  @UseGuards(AdminGuard)
  @Patch('admin/:id')
  async update(@Param('id') id: string, @Body() dto: UpdateMailboxDto) {
    return this.mailboxesService.update(id, dto);
  }

  @UseGuards(AdminGuard)
  @Delete('admin/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    return this.mailboxesService.delete(id);
  }

  // ==================== ADMIN: USER ASSIGNMENT ====================

  @UseGuards(AdminGuard)
  @Post('admin/:id/assign')
  async assignUsers(@Param('id') id: string, @Body() dto: AssignMailboxDto) {
    return this.mailboxesService.assignUsers(id, dto.userIds);
  }

  @UseGuards(AdminGuard)
  @Delete('admin/:id/users/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeUser(@Param('id') id: string, @Param('userId') userId: string) {
    return this.mailboxesService.removeUser(id, userId);
  }

  @UseGuards(AdminGuard)
  @Get('admin/:id/users')
  async getUsersForMailbox(@Param('id') id: string) {
    return this.mailboxesService.getUsersForMailbox(id);
  }

  // ==================== ADMIN: DEFAULT SIGNATURE TEMPLATE ====================

  @UseGuards(AdminGuard)
  @Get('admin/default-signature')
  getDefaultSignatureTemplate() {
    return { template: this.mailboxesService.generateDefaultSignatureTemplate() };
  }

  // ==================== ADMIN: CONNECTION TEST ====================

  @UseGuards(AdminGuard)
  @Post('admin/test-connection')
  @HttpCode(HttpStatus.OK)
  async testConnection(@Body() body: any) {
    return this.mailboxesService.testConnection(body);
  }

  // ==================== USER: OWN MAILBOXES ====================

  /**
   * Get all mailboxes assigned to the current user
   */
  @Get('my')
  async getMyMailboxes(@CurrentUser() user: User) {
    const userMailboxes = await this.mailboxesService.getMailboxesForUser(user.id);
    return userMailboxes.map((um) => ({
      id: um.id,
      userId: um.userId,
      mailboxId: um.mailboxId,
      isActive: um.isActive,
      assignedAt: um.assignedAt,
      mailbox: {
        id: um.mailbox.id,
        name: um.mailbox.name,
        email: um.mailbox.email,
        companyName: um.mailbox.companyName,
        color: um.mailbox.color,
        isActive: um.mailbox.isActive,
      },
    }));
  }

  /**
   * Set which mailboxes are currently active (selected) for the user
   */
  @Post('my/active')
  @HttpCode(HttpStatus.OK)
  async setActiveMailboxes(@CurrentUser() user: User, @Body() dto: SetActiveMailboxesDto) {
    await this.mailboxesService.setActiveMailboxes(user.id, dto.mailboxIds);
    return { success: true };
  }

  /**
   * Get active mailbox IDs for the current user
   */
  @Get('my/active')
  async getActiveMailboxes(@CurrentUser() user: User) {
    const ids = await this.mailboxesService.getActiveMailboxIdsForUser(user.id);
    return { mailboxIds: ids };
  }

  // ==================== USER: SINGLE MAILBOX (public info) ====================

  /**
   * Get a single mailbox by ID (any authenticated user, returns public info + signature template)
   * Placed last to avoid catching 'my', 'admin/*' routes
   */
  @Get(':id')
  async getMailboxById(@Param('id') id: string) {
    const mailbox = await this.mailboxesService.findOne(id);
    return {
      id: mailbox.id,
      name: mailbox.name,
      email: mailbox.email,
      companyName: mailbox.companyName,
      companyPhone: mailbox.companyPhone,
      companyWebsite: mailbox.companyWebsite,
      companyAddress: mailbox.companyAddress,
      signatureTemplate: mailbox.signatureTemplate,
      color: mailbox.color,
    };
  }
}
