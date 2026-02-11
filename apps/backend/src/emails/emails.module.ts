import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Email } from './emails.entity';
import { EmailsService } from './emails.service';
import { EmailsController } from './emails.controller';
import { EmailTemplatesModule } from '../email-templates/email-templates.module';
import { AiAgentModule } from '../ai-agent/ai-agent.module';
import { EmailEventsService } from './email-events.service';
import { ImapIdleService } from './imap-idle.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Email]),
    forwardRef(() => EmailTemplatesModule),
    forwardRef(() => AiAgentModule),
  ],
  controllers: [EmailsController],
  providers: [EmailsService, EmailEventsService, ImapIdleService],
  exports: [EmailsService, EmailEventsService, ImapIdleService],
})
export class EmailsModule {}
