import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppLog } from './app-log.entity';
import { LogsService } from './logs.service';
import { LogsController } from './logs.controller';
import { GlobalExceptionFilter } from './global-exception.filter';
import { RequestLoggerMiddleware } from './request-logger.middleware';

@Global() // Make LogsService available everywhere without importing
@Module({
  imports: [TypeOrmModule.forFeature([AppLog])],
  providers: [LogsService, GlobalExceptionFilter, RequestLoggerMiddleware],
  controllers: [LogsController],
  exports: [LogsService, GlobalExceptionFilter, RequestLoggerMiddleware],
})
export class LogsModule {}
