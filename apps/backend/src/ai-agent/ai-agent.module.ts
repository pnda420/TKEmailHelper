import { Module, forwardRef } from '@nestjs/common';
import { AiAgentService } from './ai-agent.service';
import { AiAgentController } from './ai-agent.controller';
import { JtlToolsModule } from '../jtl-tools/jtl-tools.module';
import { EmailsModule } from '../emails/emails.module';

@Module({
  imports: [JtlToolsModule, forwardRef(() => EmailsModule)],
  controllers: [AiAgentController],
  providers: [AiAgentService],
  exports: [AiAgentService],
})
export class AiAgentModule {}
