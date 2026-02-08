import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiConfig } from './ai-config.entity';
import { AiConfigService } from './ai-config.service';
import { AiConfigController } from './ai-config.controller';

@Global()  // Make AiConfigService available everywhere without importing
@Module({
  imports: [TypeOrmModule.forFeature([AiConfig])],
  controllers: [AiConfigController],
  providers: [AiConfigService],
  exports: [AiConfigService],
})
export class AiConfigModule {}
