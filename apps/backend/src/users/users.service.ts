import { Injectable, NotFoundException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './users.entity';
import { CreateUserDto, LoginDto, NewsletterSubscribeDto, UpdateUserDto } from './users.dto';

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
            select: ['id', 'email', 'name', 'wantsNewsletter', 'isVerified', 'createdAt', 'updatedAt', 'role', 'signatureName', 'signaturePosition', 'signatureCompany', 'signaturePhone', 'signatureWebsite', 'emailSignature'],
        });
        return users;
    }

    async findOne(id: string): Promise<User> {
        const user = await this.userRepo.findOne({
            where: { id },
            select: ['id', 'email', 'name', 'wantsNewsletter', 'isVerified', 'createdAt', 'updatedAt', 'role', 'signatureName', 'signaturePosition', 'signatureCompany', 'signaturePhone', 'signatureWebsite', 'emailSignature'],
            relations: ['generatedPages', 'contactRequests'],
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

        Object.assign(user, dto);
        const updated = await this.userRepo.save(user);
        delete updated.password;
        return updated;
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

    async subscribeNewsletter(dto: NewsletterSubscribeDto): Promise<{ message: string }> {
        let user = await this.findByEmail(dto.email);

        if (user) {
            // User existiert bereits, Newsletter-Flag updaten
            if (user.wantsNewsletter) {
                return { message: 'Already subscribed to newsletter' };
            }

            user.wantsNewsletter = true;
            await this.userRepo.save(user);
            return { message: 'Successfully subscribed to newsletter' };
        }

        // Neuer User nur für Newsletter
        user = this.userRepo.create({
            email: dto.email,
            name: dto.name || dto.email.split('@')[0],
            password: await bcrypt.hash(Math.random().toString(36), 10), // Dummy Password
            wantsNewsletter: true,
        });

        await this.userRepo.save(user);
        return { message: 'Successfully subscribed to newsletter' };
    }

    async unsubscribeNewsletter(email: string): Promise<{ message: string }> {
        const user = await this.findByEmail(email);

        if (!user) {
            throw new NotFoundException('Email not found');
        }

        user.wantsNewsletter = false;
        await this.userRepo.save(user);

        return { message: 'Successfully unsubscribed from newsletter' };
    }

    async getNewsletterSubscribers(): Promise<User[]> {
        return this.userRepo.find({
            where: { wantsNewsletter: true },
            select: ['id', 'email', 'name', 'createdAt'],
        });
    }

    async count(): Promise<number> {
        return this.userRepo.count();
    }

    async countNewsletterSubscribers(): Promise<number> {
        return this.userRepo.count({ where: { wantsNewsletter: true } });
    }
}