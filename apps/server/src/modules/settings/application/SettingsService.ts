import {
  DEFAULT_HEALTH_CONFIG,
  DEFAULT_INSIGHTS_CONFIG,
  DEFAULT_OUTAGE_CONFIG,
  healthConfigSchema,
  insightsConfigSchema,
  outageConfigSchema,
  validateHealthConfig,
  type HealthConfig,
  type InsightsConfig,
  type OutageConfig,
} from '@campus/shared';
import { ZodError } from 'zod';
import { AppError } from '../../../shared/errors';
import type { Clock } from '../../../shared/time';
import type { SettingsRepo } from '../infrastructure/SettingsRepo';
import type { ActivityRepo } from '../../activity/infrastructure/ActivityRepo';

const KEYS = {
  'health.config': healthConfigSchema,
  'outage.config': outageConfigSchema,
  'insights.config': insightsConfigSchema,
} as const;
export type SettingKey = keyof typeof KEYS;

function deepMerge<T>(base: T, over: unknown): T {
  if (!over || typeof over !== 'object') return base;
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...(base as any) };
  for (const [k, v] of Object.entries(over as object)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? deepMerge((base as any)?.[k] ?? {}, v) : v;
  }
  return out;
}

export class SettingsService {
  constructor(
    private repo: SettingsRepo,
    private activity: ActivityRepo,
    private clock: Clock,
  ) {}

  async health(): Promise<HealthConfig> {
    return deepMerge(DEFAULT_HEALTH_CONFIG, await this.repo.get('health.config'));
  }
  async outage(): Promise<OutageConfig> {
    return deepMerge(DEFAULT_OUTAGE_CONFIG, await this.repo.get('outage.config'));
  }
  async insights(): Promise<InsightsConfig> {
    return deepMerge(DEFAULT_INSIGHTS_CONFIG, await this.repo.get('insights.config'));
  }

  async list() {
    return {
      'health.config': await this.health(),
      'outage.config': await this.outage(),
      'insights.config': await this.insights(),
      defaults: {
        'health.config': DEFAULT_HEALTH_CONFIG,
        'outage.config': DEFAULT_OUTAGE_CONFIG,
        'insights.config': DEFAULT_INSIGHTS_CONFIG,
      },
    };
  }

  async update(key: string, value: unknown, actorId: string) {
    if (!(key in KEYS)) throw new AppError('NOT_FOUND', `Unknown setting "${key}".`);
    const schema = KEYS[key as SettingKey];
    let parsed: any;
    try {
      parsed = schema.parse(value);
    } catch (e) {
      if (e instanceof ZodError) throw e;
      throw e;
    }
    if (key === 'health.config') {
      const errs = validateHealthConfig(parsed);
      if (errs.length) throw new AppError('VALIDATION_ERROR', errs[0]!, { config: errs });
    }
    const at = this.clock.now().toISOString();
    await this.repo.set(key, parsed, at);
    await this.activity.log(actorId, 'settings.update', 'setting', key, { value: parsed }, at);
    return parsed;
  }
}
