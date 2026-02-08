import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { AiConfigService } from './ai-config.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('ai-config')
@UseGuards(JwtAuthGuard)
export class AiConfigController {
  constructor(private readonly service: AiConfigService) {}

  /** Get all config entries */
  @Get()
  async getAll() {
    return this.service.getAll();
  }

  /** Get a single config entry by key */
  @Get(':key')
  async getByKey(@Param('key') key: string) {
    return this.service.getByKey(key);
  }

  /** Update a config entry's value */
  @Patch(':key')
  async update(@Param('key') key: string, @Body('value') value: string) {
    return this.service.update(key, value);
  }
}
