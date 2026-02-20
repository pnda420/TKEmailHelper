import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SpamKillerService } from './spam-killer.service';
import { SpamKillerController } from './spam-killer.controller';
import { SpamKillerEventsService } from './spam-killer-events.service';
import { MailboxesModule } from '../mailboxes/mailboxes.module';
import { AiUsageModule } from '../ai-usage/ai-usage.module';
import { SpamScan } from './spam-scan.entity';
import { SpamDeletionLog } from './spam-deletion-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SpamScan, SpamDeletionLog]), forwardRef(() => MailboxesModule), AiUsageModule],
  controllers: [SpamKillerController],
  providers: [SpamKillerService, SpamKillerEventsService],
  exports: [SpamKillerService, SpamKillerEventsService],
})
export class SpamKillerModule {}
