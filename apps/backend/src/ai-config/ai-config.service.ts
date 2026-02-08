import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiConfig } from './ai-config.entity';

/**
 * Only reply_rules are stored in the DB.
 * All system prompts are now hardcoded in prompts.ts.
 */
const DEFAULT_CONFIGS: { key: string; label: string; description: string; value: string; type: 'rules' }[] = [
  {
    key: 'reply_rules',
    label: 'Antwort-Regeln',
    description: 'Liste von Regeln die bei JEDER KI-generierten E-Mail-Antwort berücksichtigt werden sollen.',
    value: '[]',
    type: 'rules',
  },
];

@Injectable()
export class AiConfigService implements OnModuleInit {
  private readonly logger = new Logger(AiConfigService.name);

  /** In-memory cache to avoid DB reads on every request */
  private cache = new Map<string, AiConfig>();

  constructor(
    @InjectRepository(AiConfig)
    private readonly repo: Repository<AiConfig>,
  ) {}

  /** Seed defaults on startup if they don't exist yet */
  async onModuleInit(): Promise<void> {
    for (const def of DEFAULT_CONFIGS) {
      const existing = await this.repo.findOne({ where: { key: def.key } });
      if (!existing) {
        await this.repo.save(this.repo.create(def));
        this.logger.log(`Seeded AI config: ${def.key}`);
      }
    }
    await this.refreshCache();
  }

  private async refreshCache(): Promise<void> {
    const all = await this.repo.find();
    this.cache.clear();
    for (const cfg of all) {
      this.cache.set(cfg.key, cfg);
    }
  }

  // ==================== PUBLIC API ====================

  async getAll(): Promise<AiConfig[]> {
    return this.repo.find({ order: { type: 'ASC', key: 'ASC' } });
  }

  async getByKey(key: string): Promise<AiConfig | null> {
    // Check cache first
    if (this.cache.has(key)) return this.cache.get(key)!;
    const cfg = await this.repo.findOne({ where: { key } });
    if (cfg) this.cache.set(key, cfg);
    return cfg;
  }

  async getValue(key: string): Promise<string> {
    const cfg = await this.getByKey(key);
    return cfg?.value || '';
  }

  async update(key: string, value: string): Promise<AiConfig> {
    let cfg = await this.repo.findOne({ where: { key } });
    if (!cfg) {
      throw new Error(`AI config key "${key}" not found`);
    }
    cfg.value = value;
    cfg = await this.repo.save(cfg);
    this.cache.set(key, cfg);
    return cfg;
  }

  // ==================== CONVENIENCE METHODS ====================

  /** Get reply rules as string array */
  async getReplyRules(): Promise<string[]> {
    const val = await this.getValue('reply_rules');
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}
