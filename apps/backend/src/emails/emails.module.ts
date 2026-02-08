import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Email } from './emails.entity';
import { EmailsService } from './emails.service';
import { EmailsController } from './emails.controller';
import { EmailTemplatesModule } from '../email-templates/email-templates.module';
import { AiAgentModule } from '../ai-agent/ai-agent.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Email]),
    forwardRef(() => EmailTemplatesModule),
    forwardRef(() => AiAgentModule),
  ],
  controllers: [EmailsController],
  providers: [EmailsService],
  exports: [EmailsService],
})
export class EmailsModule {}
