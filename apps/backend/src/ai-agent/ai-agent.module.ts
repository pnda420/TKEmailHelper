import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiAgentService } from './ai-agent.service';
import { AiAgentController } from './ai-agent.controller';
import { AiChatService } from './ai-chat.service';
import { AiChatController } from './ai-chat.controller';
import { ChatPersistenceService } from './chat-persistence.service';
import { ChatConversation } from './chat-conversation.entity';
import { ChatMessageEntity } from './chat-message.entity';
import { JtlToolsModule } from '../jtl-tools/jtl-tools.module';
import { EmailsModule } from '../emails/emails.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatConversation, ChatMessageEntity]),
    JtlToolsModule,
    forwardRef(() => EmailsModule),
  ],
  controllers: [AiAgentController, AiChatController],
  providers: [AiAgentService, AiChatService, ChatPersistenceService],
  exports: [AiAgentService, AiChatService],
})
export class AiAgentModule {}
