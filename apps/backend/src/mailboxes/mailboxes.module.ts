import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Mailbox } from './mailbox.entity';
import { UserMailbox } from './user-mailbox.entity';
import { MailboxesService } from './mailboxes.service';
import { MailboxesController } from './mailboxes.controller';
import { EmailsModule } from '../emails/emails.module';
import { SpamKillerModule } from '../spam-killer/spam-killer.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Mailbox, UserMailbox]),
    forwardRef(() => EmailsModule),
    forwardRef(() => SpamKillerModule),
  ],
  controllers: [MailboxesController],
  providers: [MailboxesService],
  exports: [MailboxesService],
})
export class MailboxesModule {}
