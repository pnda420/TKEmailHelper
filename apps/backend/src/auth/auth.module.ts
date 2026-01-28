import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { User } from 'src/users/users.entity';


@Module({
    imports: [
        TypeOrmModule.forFeature([User]),
        PassportModule,
        // 🛡️ JWT Secret aus Umgebungsvariable laden (KEIN Fallback!)
        JwtModule.registerAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => {
                const secret = configService.get<string>('JWT_SECRET');
                if (!secret) {
                    throw new Error('❌ JWT_SECRET Umgebungsvariable ist nicht gesetzt! Die Anwendung kann nicht sicher starten.');
                }
                return {
                    secret,
                    signOptions: { expiresIn: '7d' },
                };
            },
        }),
    ],
    controllers: [AuthController],
    providers: [AuthService, JwtStrategy],
    exports: [AuthService],
})
export class AuthModule { }