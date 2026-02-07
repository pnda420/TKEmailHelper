import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, ILike, In } from 'typeorm';
import { AppLog, LogLevel } from './app-log.entity';

export interface CreateLogDto {
  level: LogLevel;
  message: string;
  stack?: string;
  method?: string;
  url?: string;
  statusCode?: number;
  userId?: string;
  userEmail?: string;
  requestBody?: string;
  ip?: string;
  userAgent?: string;
  source?: string;
  duration?: number;
  extra?: any;
}

export interface LogQueryDto {
  page?: number;
  limit?: number;
  level?: LogLevel | LogLevel[];
  search?: string;
  userId?: string;
  from?: string;   // ISO date
  to?: string;     // ISO date
  source?: string;
}

@Injectable()
export class LogsService {
  private readonly logger = new Logger(LogsService.name);

  constructor(
    @InjectRepository(AppLog)
    private readonly logRepo: Repository<AppLog>,
  ) {}

  /** Write a log entry to the database */
  async log(dto: CreateLogDto): Promise<AppLog> {
    try {
      const entry = this.logRepo.create({
        ...dto,
        requestBody: dto.requestBody ? dto.requestBody.substring(0, 5000) : null,
        extra: dto.extra ? JSON.stringify(dto.extra).substring(0, 5000) : null,
      });
      return await this.logRepo.save(entry);
    } catch (err) {
      // Don't let logging errors crash the app
      this.logger.error(`Failed to persist log: ${err.message}`);
      return null as any;
    }
  }

  /** Quick shorthand for error logging */
  async error(message: string, opts?: Partial<CreateLogDto>): Promise<void> {
    await this.log({ level: LogLevel.ERROR, message, ...opts });
  }

  /** Quick shorthand for warn logging */
  async warn(message: string, opts?: Partial<CreateLogDto>): Promise<void> {
    await this.log({ level: LogLevel.WARN, message, ...opts });
  }

  /** Quick shorthand for info logging */
  async info(message: string, opts?: Partial<CreateLogDto>): Promise<void> {
    await this.log({ level: LogLevel.INFO, message, ...opts });
  }

  /** Query logs with filters, pagination, and search */
  async findAll(query: LogQueryDto): Promise<{ data: AppLog[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 50));
    const skip = (page - 1) * limit;

    const where: any = {};

    // Level filter
    if (query.level) {
      where.level = Array.isArray(query.level) ? In(query.level) : query.level;
    }

    // User filter
    if (query.userId) {
      where.userId = query.userId;
    }

    // Source filter
    if (query.source) {
      where.source = ILike(`%${query.source}%`);
    }

    // Date range
    if (query.from || query.to) {
      const from = query.from ? new Date(query.from) : new Date('2020-01-01');
      const to = query.to ? new Date(query.to) : new Date();
      where.createdAt = Between(from, to);
    }

    // Search across message and url
    let qb = this.logRepo.createQueryBuilder('log').where(where);

    if (query.search) {
      qb = qb.andWhere(
        '(log.message ILIKE :search OR log.url ILIKE :search OR log.userEmail ILIKE :search OR log.source ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    const [data, total] = await qb
      .orderBy('log.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit };
  }

  /** Get a single log entry by ID */
  async findOne(id: number): Promise<AppLog | null> {
    return this.logRepo.findOne({ where: { id } });
  }

  /** Get log statistics for the dashboard */
  async getStats(hours = 24): Promise<{
    totalErrors: number;
    totalWarnings: number;
    totalInfo: number;
    recentErrorRate: number;
    topSources: { source: string; count: number }[];
    topUsers: { userId: string; userEmail: string; count: number }[];
  }> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const [totalErrors, totalWarnings, totalInfo] = await Promise.all([
      this.logRepo.count({ where: { level: LogLevel.ERROR, createdAt: Between(since, new Date()) } }),
      this.logRepo.count({ where: { level: LogLevel.WARN, createdAt: Between(since, new Date()) } }),
      this.logRepo.count({ where: { level: LogLevel.INFO, createdAt: Between(since, new Date()) } }),
    ]);

    // Error rate per hour
    const recentErrorRate = hours > 0 ? Math.round((totalErrors / hours) * 10) / 10 : 0;

    // Top error sources
    const topSources = await this.logRepo
      .createQueryBuilder('log')
      .select('log.source', 'source')
      .addSelect('COUNT(*)', 'count')
      .where({ level: LogLevel.ERROR, createdAt: Between(since, new Date()) })
      .andWhere('log.source IS NOT NULL')
      .groupBy('log.source')
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany();

    // Top users hitting errors
    const topUsers = await this.logRepo
      .createQueryBuilder('log')
      .select('log.userId', 'userId')
      .addSelect('log.userEmail', 'userEmail')
      .addSelect('COUNT(*)', 'count')
      .where({ level: LogLevel.ERROR, createdAt: Between(since, new Date()) })
      .andWhere('log.userId IS NOT NULL')
      .groupBy('log.userId')
      .addGroupBy('log.userEmail')
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany();

    return { totalErrors, totalWarnings, totalInfo, recentErrorRate, topSources, topUsers };
  }

  /** Delete logs older than given days */
  async purge(olderThanDays = 90): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    const result = await this.logRepo
      .createQueryBuilder()
      .delete()
      .where('createdAt < :cutoff', { cutoff })
      .execute();
    return result.affected || 0;
  }
}
