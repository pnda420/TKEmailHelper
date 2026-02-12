import { 
    Controller, 
    Get, 
    Post, 
    Body, 
    Param, 
    Patch, 
    Delete, 
    HttpCode, 
    HttpStatus,
    UseGuards,
    ForbiddenException
  } from '@nestjs/common';
  import { Throttle } from '@nestjs/throttler';
  import { UsersService } from './users.service';
import { CreateUserDto, LoginDto, UpdateUserDto, AdminResetPasswordDto } from './users.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { AdminGuard } from 'src/auth/guards/admin.guard';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { Public } from 'src/auth/decorators/public.decorator';
import { User } from './users.entity';
  
  @Controller('users')
  @Throttle({ default: { limit: 30, ttl: 60000 } }) // 🛡️ Basis: 30 Requests/Minute
  export class UsersController {
    constructor(private readonly usersService: UsersService) {}
  
    // 🛡️ STRENG: 3 Registrierungen pro Stunde
    @Public()
    @Throttle({ default: { limit: 3, ttl: 3600000 } })
    @Post('register')
    @HttpCode(HttpStatus.CREATED)
    async register(@Body() dto: CreateUserDto) {
      return this.usersService.create(dto);
    }
  
    // 🛡️ STRENG: 5 Login-Versuche pro Minute
    @Public()
    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @Post('login')
    @HttpCode(HttpStatus.OK)
    async login(@Body() dto: LoginDto) {
      const user = await this.usersService.login(dto);
      return {
        message: 'Login successful',
        user,
      };
    }
  
    // Admin Routen
    @UseGuards(JwtAuthGuard, AdminGuard)
    @Get('stats')
    async getStats() {
      const totalUsers = await this.usersService.count();
      
      return {
        totalUsers,
      };
    }
  
    // User Management Routen
    // Später: nur Admin oder der User selbst darf zugreifen
    @UseGuards(JwtAuthGuard, AdminGuard)
    @Get()
    async findAll() {
      return this.usersService.findAll();
    }

    // ==================== EIGENES PROFIL (OHNE ADMIN) ====================
    // NOTE: These routes MUST be defined BEFORE the generic /:id routes!

    /**
     * PATCH /users/me - Update own profile (no admin required)
     * Users can update their own: name, signature fields, emailSignature
     * Users CANNOT update: role, email, password (separate endpoints needed)
     */
    @UseGuards(JwtAuthGuard)
    @Patch('me')
    async updateOwnProfile(
      @CurrentUser() user: User,
      @Body() dto: UpdateUserDto
    ) {
      // Security: Remove fields that users should not change themselves
      delete dto.role; // Only admins can change roles
      
      return this.usersService.update(user.id, dto);
    }

    /**
     * GET /users/me - Get own profile
     */
    @UseGuards(JwtAuthGuard)
    @Get('me')
    async getOwnProfile(@CurrentUser() user: User) {
      return this.usersService.findOne(user.id);
    }

    // ==================== ADMIN ROUTES FOR USER BY ID ====================

    @UseGuards(JwtAuthGuard, AdminGuard)
    @Get(':id')
    async findOne(@Param('id') id: string) {
      return this.usersService.findOne(id);
    }

    @UseGuards(JwtAuthGuard, AdminGuard)
    @Patch(':id')
    async update(
      @Param('id') id: string, 
      @Body() dto: UpdateUserDto
    ) {
      return this.usersService.update(id, dto);
    }

    @UseGuards(JwtAuthGuard, AdminGuard)
    @Post(':id/reset-password')
    @HttpCode(HttpStatus.OK)
    async resetPassword(
      @Param('id') id: string,
      @Body() dto: AdminResetPasswordDto
    ) {
      return this.usersService.adminResetPassword(id, dto.newPassword);
    }

    @UseGuards(JwtAuthGuard, AdminGuard)
    @Post('admin/create')
    @HttpCode(HttpStatus.CREATED)
    async adminCreateUser(@Body() dto: CreateUserDto) {
      return this.usersService.create(dto);
    }

    @UseGuards(JwtAuthGuard, AdminGuard)
    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    async delete(@Param('id') id: string) {
      return this.usersService.delete(id);
    }
  }