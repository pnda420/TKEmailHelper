import { Module } from '@nestjs/common';
import { SqlTestController } from './sql-test.controller';

@Module({
  controllers: [SqlTestController],
})
export class SqlTestModule {}
