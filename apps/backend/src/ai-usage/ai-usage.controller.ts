import {
  Controller, Get, Post, Query, UseGuards, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AiUsageService, UsageQueryDto } from './ai-usage.service';

@Controller('api/ai-usage')
@UseGuards(JwtAuthGuard)
export class AiUsageController {
  constructor(private readonly usageService: AiUsageService) {}

  /**
   * GET /api/ai-usage — Paginated list of all AI API calls (Admin only)
   */
  @UseGuards(AdminGuard)
  @Get()
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('feature') feature?: string,
    @Query('userId') userId?: string,
    @Query('model') model?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const query: UsageQueryDto = { page, limit, feature, userId, model, from, to };
    return this.usageService.findAll(query);
  }

  /**
   * GET /api/ai-usage/stats — Aggregated cost & usage statistics (all users)
   */
  @Get('stats')
  async getStats(@Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number) {
    return this.usageService.getStats(days);
  }

  /**
   * GET /api/ai-usage/balance — OpenAI billing balance (Admin only)
   */
  @UseGuards(AdminGuard)
  @Get('balance')
  async getBalance() {
    return this.usageService.getOpenAiBalance();
  }

  /**
   * POST /api/ai-usage/recalculate — Recalculate all historical costs with current pricing (Admin only)
   */
  @UseGuards(AdminGuard)
  @Post('recalculate')
  async recalculateCosts() {
    return this.usageService.recalculateAllCosts();
  }
}
