import { Module } from '@nestjs/common';
import { ContactRequestsService } from './contact-requests.service';
import { ContactRequestsController } from './contact-requests.controller';
import { ContactRequest } from './contact-requests.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailModule } from 'src/email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ContactRequest]),
    EmailModule
  ],
  providers: [ContactRequestsService],
  exports: [ContactRequestsService],
  controllers: [ContactRequestsController],
})
export class ContactRequestsModule {}
