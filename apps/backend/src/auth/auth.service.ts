import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UserRole, User } from 'src/users/users.entity';


export interface JwtPayload {
    sub: string;
    email: string;
    role: UserRole;
    createdAt: Date;
}

export interface LoginResponse {
    access_token: string;
    user: {
        id: string;
        email: string;
        name: string;
        role: UserRole;
        createdAt: Date;
        wantsNewsletter?: boolean;
        isVerified?: boolean;
        signatureName?: string | null;
        signaturePosition?: string | null;
        signatureCompany?: string | null;
        signaturePhone?: string | null;
        signatureWebsite?: string | null;
        emailSignature?: string | null;
    };
}

@Injectable()
export class AuthService {
    constructor(
        @InjectRepository(User)
        private userRepo: Repository<User>,
        private jwtService: JwtService,
    ) { }

    async register(email: string, name: string, password: string): Promise<LoginResponse> {
        // 1) Eingaben prüfen
        if (!email || !password) {
            throw new UnauthorizedException('Email and password are required');
        }
        email = email.trim().toLowerCase();

        // 2) Existenz prüfen (bei CITEXT ist das case-insensitive)
        const existing = await this.userRepo.findOne({ where: { email } });
        if (existing) {
            throw new ConflictException('Email already exists');
        }

        // 3) Passwort hashen
        const hashedPassword = await bcrypt.hash(password, 10);

        // 4) User speichern
        const user = this.userRepo.create({
            email,
            name,
            password: hashedPassword,
            role: UserRole.USER,
        });
        const savedUser = await this.userRepo.save(user);

        // 5) Token zurückgeben
        return this.generateToken(savedUser);
    }

    async login(email: string, password: string): Promise<LoginResponse> {
        // 1) Eingaben prüfen
        if (!email || !password) {
            throw new UnauthorizedException('Invalid credentials');
        }
        email = email.trim().toLowerCase();

        // 2) User inkl. Passwort laden (wichtig!)
        // Funktioniert egal ob @Column({ select: false }) gesetzt ist oder nicht
        const user = await this.userRepo
            .createQueryBuilder('user')
            .addSelect('user.password')
            .where('LOWER(user.email) = :email', { email }) // falls Spalte kein CITEXT ist
            .getOne();

        if (!user || !user.password) {
            throw new UnauthorizedException('Invalid credentials');
        }

        // 3) Passwort prüfen
        const ok = await bcrypt.compare(password, user.password);
        if (!ok) {
            throw new UnauthorizedException('Invalid credentials');
        }

        // 4) Token
        return this.generateToken(user);
    }

    async validateUser(userId: string): Promise<User | null> {
        return this.userRepo.findOne({
            where: { id: userId },
            select: ['id', 'email', 'name', 'role', 'wantsNewsletter', 'isVerified', 'createdAt', 'signatureName', 'signaturePosition', 'signatureCompany', 'signaturePhone', 'signatureWebsite', 'emailSignature']
        });
    }

    // In auth.service.ts - generateToken()
    private generateToken(user: User): LoginResponse {
        const payload: JwtPayload = {
            sub: user.id,
            email: user.email,
            role: user.role,
            createdAt: user.createdAt,
        };

        const token = this.jwtService.sign(payload);

        return {
            access_token: token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                createdAt: user.createdAt,
                wantsNewsletter: user.wantsNewsletter,
                isVerified: user.isVerified,
                signatureName: user.signatureName,
                signaturePosition: user.signaturePosition,
                signatureCompany: user.signatureCompany,
                signaturePhone: user.signaturePhone,
                signatureWebsite: user.signatureWebsite,
                emailSignature: user.emailSignature,
            },
        };
    }
}