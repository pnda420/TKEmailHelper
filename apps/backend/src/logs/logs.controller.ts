import {
  Controller, Get, Delete, Param, Query, UseGuards, ParseIntPipe,
  DefaultValuePipe, HttpCode,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { LogsService, LogQueryDto } from './logs.service';
import { LogLevel } from './app-log.entity';

@Controller('api/logs')
@UseGuards(JwtAuthGuard, AdminGuard)
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  /**
   * GET /api/logs — Query all logs with filters & pagination
   */
  @Get()
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('level') level?: string,
    @Query('search') search?: string,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('source') source?: string,
  ) {
    const query: LogQueryDto = { page, limit, search, userId, from, to, source };

    // Parse level(s)
    if (level) {
      const levels = level.split(',').filter(l => Object.values(LogLevel).includes(l as LogLevel)) as LogLevel[];
      if (levels.length === 1) query.level = levels[0];
      else if (levels.length > 1) query.level = levels;
    }

    return this.logsService.findAll(query);
  }

  /**
   * GET /api/logs/stats — Error statistics for dashboard
   */
  @Get('stats')
  async getStats(@Query('hours', new DefaultValuePipe(24), ParseIntPipe) hours: number) {
    return this.logsService.getStats(hours);
  }

  /**
   * GET /api/logs/:id — Single log entry detail
   */
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.logsService.findOne(id);
  }

  /**
   * DELETE /api/logs/purge?days=90 — Purge old logs
   */
  @Delete('purge')
  @HttpCode(200)
  async purge(@Query('days', new DefaultValuePipe(90), ParseIntPipe) days: number) {
    const deleted = await this.logsService.purge(days);
    return { deleted, message: `${deleted} Logs älter als ${days} Tage gelöscht` };
  }
}
