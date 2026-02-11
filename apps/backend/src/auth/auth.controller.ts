import { Controller, Post, Body, Get, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Public } from './decorators/public.decorator';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  masterPassword: string;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

export class VerifyMasterPasswordDto {
  @IsString()
  masterPassword: string;
}

@Controller('auth')
@Throttle({ default: { limit: 20, ttl: 60000 } }) // 🛡️ Basis: 20 Requests/Minute
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  // 🛡️ Master-Passwort prüfen (bevor Register-Seite angezeigt wird)
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('verify-master-password')
  async verifyMasterPassword(@Body() dto: VerifyMasterPasswordDto) {
    const masterPw = this.configService.get<string>('REGISTER_MASTER_PW', '');
    if (!masterPw) {
      return { valid: false, message: 'Registration is currently disabled.' };
    }
    const valid = dto.masterPassword === masterPw;
    return { valid };
  }

  // 🛡️ STRENG: 3 Versuche pro Minute (Spam-Schutz)
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    // Verify master password before allowing registration
    const masterPw = this.configService.get<string>('REGISTER_MASTER_PW', '');
    if (!masterPw || dto.masterPassword !== masterPw) {
      throw new ForbiddenException('Ungültiges Master-Passwort');
    }
    return this.authService.register(dto.email, dto.name, dto.password);
  }

  // 🛡️ STRENG: 5 Versuche pro Minute (Brute-Force Schutz)
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Request() req) {
    return req.user;
  }
}