import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { AiUsage } from './ai-usage.entity';

// ==================== PRICING (USD per 1M tokens) ====================
// Keep updated when models change — https://openai.com/api/pricing
// Last updated: 2026-02-14
const MODEL_PRICING: Record<string, { input: number; output: number; cachedInput?: number }> = {
  // GPT-5
  'gpt-5':        { input: 1.25,  output: 10.00, cachedInput: 0.125 },
  // GPT-5 mini
  'gpt-5-mini':   { input: 0.25,  output: 2.00,  cachedInput: 0.025 },
  // GPT-4.1 (fallbacks)
  'gpt-4.1':      { input: 2.00,  output: 8.00 },
  'gpt-4.1-mini': { input: 0.40,  output: 1.60 },
  'gpt-4.1-nano': { input: 0.10,  output: 0.40 },
  // GPT-4o (fallbacks)
  'gpt-4o':       { input: 2.50,  output: 10.00 },
  'gpt-4o-mini':  { input: 0.15,  output: 0.60 },
};

export interface TrackUsageDto {
  feature: string;
  model: string;
  userId?: string;
  userEmail?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs?: number;
  success?: boolean;
  errorMessage?: string;
  context?: string;
}

export interface UsageQueryDto {
  page?: number;
  limit?: number;
  feature?: string;
  userId?: string;
  model?: string;
  from?: string;
  to?: string;
}

@Injectable()
export class AiUsageService {
  private readonly logger = new Logger(AiUsageService.name);

  constructor(
    @InjectRepository(AiUsage)
    private readonly repo: Repository<AiUsage>,
    private readonly configService: ConfigService,
  ) {}

  // ==================== TRACK ====================

  /** Estimate cost from model + tokens */
  estimateCost(model: string, promptTokens: number, completionTokens: number): number {
    const pricing = MODEL_PRICING[model] || MODEL_PRICING['gpt-4o-mini'];
    const inputCost = (promptTokens / 1_000_000) * pricing.input;
    const outputCost = (completionTokens / 1_000_000) * pricing.output;
    return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000; // 6 decimal places
  }

  /** Track a single OpenAI API call */
  async track(dto: TrackUsageDto): Promise<AiUsage | null> {
    try {
      const costUsd = this.estimateCost(dto.model, dto.promptTokens, dto.completionTokens);
      const entry = this.repo.create({
        ...dto,
        costUsd,
        success: dto.success ?? true,
      });
      return await this.repo.save(entry);
    } catch (err) {
      this.logger.error(`Failed to track AI usage: ${err.message}`);
      return null;
    }
  }

  // ==================== QUERY ====================

  async findAll(query: UsageQueryDto): Promise<{ data: AiUsage[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 50));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.feature) where.feature = query.feature;
    if (query.userId) where.userId = query.userId;
    if (query.model) where.model = query.model;

    if (query.from || query.to) {
      const from = query.from ? new Date(query.from) : new Date('2020-01-01');
      const to = query.to ? new Date(query.to) : new Date();
      where.createdAt = Between(from, to);
    }

    const [data, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return { data, total, page, limit };
  }

  // ==================== STATS ====================

  async getStats(days = 30): Promise<{
    totalRequests: number;
    totalTokens: number;
    totalCostUsd: number;
    totalErrors: number;
    costByModel: { model: string; cost: number; requests: number; tokens: number }[];
    costByFeature: { feature: string; cost: number; requests: number; tokens: number }[];
    costByUser: { userId: string; userEmail: string; cost: number; requests: number }[];
    dailyCost: { date: string; cost: number; requests: number }[];
  }> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Aggregates
    const base = this.repo.createQueryBuilder('u').where('u.createdAt >= :since', { since });

    const totals = await base.clone()
      .select('COUNT(*)', 'totalRequests')
      .addSelect('COALESCE(SUM(u.totalTokens), 0)', 'totalTokens')
      .addSelect('COALESCE(SUM(u.costUsd), 0)', 'totalCostUsd')
      .addSelect('COALESCE(SUM(CASE WHEN u.success = false THEN 1 ELSE 0 END), 0)', 'totalErrors')
      .getRawOne();

    // By model
    const costByModel = await base.clone()
      .select('u.model', 'model')
      .addSelect('COALESCE(SUM(u.costUsd), 0)', 'cost')
      .addSelect('COUNT(*)', 'requests')
      .addSelect('COALESCE(SUM(u.totalTokens), 0)', 'tokens')
      .groupBy('u.model')
      .orderBy('cost', 'DESC')
      .getRawMany();

    // By feature
    const costByFeature = await base.clone()
      .select('u.feature', 'feature')
      .addSelect('COALESCE(SUM(u.costUsd), 0)', 'cost')
      .addSelect('COUNT(*)', 'requests')
      .addSelect('COALESCE(SUM(u.totalTokens), 0)', 'tokens')
      .groupBy('u.feature')
      .orderBy('cost', 'DESC')
      .getRawMany();

    // By user
    const costByUser = await base.clone()
      .select('u.userId', 'userId')
      .addSelect('u.userEmail', 'userEmail')
      .addSelect('COALESCE(SUM(u.costUsd), 0)', 'cost')
      .addSelect('COUNT(*)', 'requests')
      .where('u.createdAt >= :since AND u.userId IS NOT NULL', { since })
      .groupBy('u.userId')
      .addGroupBy('u.userEmail')
      .orderBy('cost', 'DESC')
      .limit(20)
      .getRawMany();

    // Daily cost (last N days)
    const dailyCost = await this.repo
      .createQueryBuilder('u')
      .select("TO_CHAR(u.createdAt, 'YYYY-MM-DD')", 'date')
      .addSelect('COALESCE(SUM(u.costUsd), 0)', 'cost')
      .addSelect('COUNT(*)', 'requests')
      .where('u.createdAt >= :since', { since })
      .groupBy("TO_CHAR(u.createdAt, 'YYYY-MM-DD')")
      .orderBy('date', 'ASC')
      .getRawMany();

    return {
      totalRequests: parseInt(totals.totalRequests) || 0,
      totalTokens: parseInt(totals.totalTokens) || 0,
      totalCostUsd: parseFloat(totals.totalCostUsd) || 0,
      totalErrors: parseInt(totals.totalErrors) || 0,
      costByModel: costByModel.map(r => ({
        model: r.model,
        cost: parseFloat(r.cost) || 0,
        requests: parseInt(r.requests) || 0,
        tokens: parseInt(r.tokens) || 0,
      })),
      costByFeature: costByFeature.map(r => ({
        feature: r.feature,
        cost: parseFloat(r.cost) || 0,
        requests: parseInt(r.requests) || 0,
        tokens: parseInt(r.tokens) || 0,
      })),
      costByUser: costByUser.map(r => ({
        userId: r.userId,
        userEmail: r.userEmail || 'Unknown',
        cost: parseFloat(r.cost) || 0,
        requests: parseInt(r.requests) || 0,
      })),
      dailyCost: dailyCost.map(r => ({
        date: r.date,
        cost: parseFloat(r.cost) || 0,
        requests: parseInt(r.requests) || 0,
      })),
    };
  }

  // ==================== OPENAI BALANCE ====================

  /** Recalculate costUsd for ALL records using current MODEL_PRICING */
  async recalculateAllCosts(): Promise<{ updated: number; skipped: number }> {
    const all = await this.repo.find();
    let updated = 0;
    let skipped = 0;

    for (const entry of all) {
      const newCost = this.estimateCost(entry.model, entry.promptTokens, entry.completionTokens);
      if (Math.abs(newCost - Number(entry.costUsd)) > 0.000001) {
        entry.costUsd = newCost as any;
        await this.repo.save(entry);
        updated++;
      } else {
        skipped++;
      }
    }

    this.logger.log(`Recalculated costs: ${updated} updated, ${skipped} unchanged`);
    return { updated, skipped };
  }

  /** Fetch current OpenAI organization billing / credit balance */
  async getOpenAiBalance(): Promise<{ available: number | null; used: number | null; error?: string }> {
    try {
      const apiKey = this.configService.get<string>('OPENAI_API_KEY');
      // The billing API requires organization-level API key
      // If not available, estimate from our own usage data
      const res = await fetch('https://api.openai.com/v1/organization/costs?start_time=' + Math.floor((Date.now() - 30 * 24 * 3600 * 1000) / 1000) + '&limit=1', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (res.ok) {
        const data = await res.json();
        return {
          available: null,
          used: data?.data?.[0]?.results?.[0]?.amount?.value ?? null,
        };
      }

      // Fallback: calculate from our own tracked data
      const stats = await this.getStats(30);
      return {
        available: null,
        used: stats.totalCostUsd,
        error: 'OpenAI billing API nicht erreichbar — zeige geschätzte Kosten aus Tracking',
      };
    } catch (err) {
      this.logger.warn(`Could not fetch OpenAI balance: ${err.message}`);
      const stats = await this.getStats(30);
      return {
        available: null,
        used: stats.totalCostUsd,
        error: 'Geschätzte Kosten aus eigenem Tracking',
      };
    }
  }
}
