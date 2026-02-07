import { Module } from '@nestjs/common';
import { JtlToolsService } from './jtl-tools.service';

@Module({
  providers: [JtlToolsService],
  exports: [JtlToolsService],
})
export class JtlToolsModule {}
