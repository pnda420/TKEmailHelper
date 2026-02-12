import { Injectable, NotFoundException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './users.entity';
import { CreateUserDto, LoginDto, UpdateUserDto } from './users.dto';

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
    ) { }

    async create(dto: CreateUserDto): Promise<User> {
        // Prüfe ob Email bereits existiert
        const existingUser = await this.userRepo.findOne({
            where: { email: dto.email }
        });

        if (existingUser) {
            throw new ConflictException('Email already exists');
        }

        // Passwort hashen
        const hashedPassword = await bcrypt.hash(dto.password, 10);

        const user = this.userRepo.create({
            ...dto,
            password: hashedPassword,
        });

        const savedUser = await this.userRepo.save(user);

        // Passwort aus Response entfernen
        delete savedUser.password;
        return savedUser;
    }

    async findAll(): Promise<User[]> {
        const users = await this.userRepo.find({
            order: { createdAt: 'DESC' },
            select: ['id', 'email', 'name', 'isVerified', 'isProfileComplete', 'createdAt', 'updatedAt', 'role', 'signatureName', 'signaturePosition', 'signatureCompany', 'signaturePhone', 'signatureWebsite', 'emailSignature'],
        });
        return users;
    }

    async findOne(id: string): Promise<User> {
        const user = await this.userRepo.findOne({
            where: { id },
            select: ['id', 'email', 'name', 'isVerified', 'isProfileComplete', 'createdAt', 'updatedAt', 'role', 'signatureName', 'signaturePosition', 'signatureCompany', 'signaturePhone', 'signatureWebsite', 'emailSignature'],
        });

        if (!user) {
            throw new NotFoundException(`User with ID ${id} not found`);
        }

        return user;
    }

    async findByEmail(email: string): Promise<User | null> {
        return this.userRepo.findOne({ where: { email } });
    }

    async update(id: string, dto: UpdateUserDto): Promise<User> {
        const user = await this.userRepo.findOne({ where: { id } });

        if (!user) {
            throw new NotFoundException(`User with ID ${id} not found`);
        }

        // If password is being changed, hash it
        if (dto.password) {
            dto.password = await bcrypt.hash(dto.password, 10);
        }

        // If email is being changed, check for duplicates
        if (dto.email && dto.email !== user.email) {
            const existing = await this.userRepo.findOne({ where: { email: dto.email } });
            if (existing) {
                throw new ConflictException('Email already in use');
            }
        }

        Object.assign(user, dto);
        const updated = await this.userRepo.save(user);
        delete updated.password;
        return updated;
    }

    async adminResetPassword(id: string, newPassword: string): Promise<{ message: string }> {
        const user = await this.userRepo.findOne({ where: { id } });
        if (!user) {
            throw new NotFoundException(`User with ID ${id} not found`);
        }
        user.password = await bcrypt.hash(newPassword, 10);
        await this.userRepo.save(user);
        return { message: `Passwort für ${user.name} wurde zurückgesetzt` };
    }

    async delete(id: string): Promise<void> {
        const result = await this.userRepo.delete(id);
        if (result.affected === 0) {
            throw new NotFoundException(`User with ID ${id} not found`);
        }
    }

    async validateUser(email: string, password: string): Promise<User> {
        const user = await this.userRepo.findOne({ where: { email } });

        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            throw new UnauthorizedException('Invalid credentials');
        }

        delete user.password;
        return user;
    }

    async login(dto: LoginDto): Promise<User> {
        return this.validateUser(dto.email, dto.password);
    }

    async count(): Promise<number> {
        return this.userRepo.count();
    }
}