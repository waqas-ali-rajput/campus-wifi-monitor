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

  health(): HealthConfig {
    return deepMerge(DEFAULT_HEALTH_CONFIG, this.repo.get('health.config'));
  }
  outage(): OutageConfig {
    return deepMerge(DEFAULT_OUTAGE_CONFIG, this.repo.get('outage.config'));
  }
  insights(): InsightsConfig {
    return deepMerge(DEFAULT_INSIGHTS_CONFIG, this.repo.get('insights.config'));
  }

  list() {
    return {
      'health.config': this.health(),
      'outage.config': this.outage(),
      'insights.config': this.insights(),
      defaults: {
        'health.config': DEFAULT_HEALTH_CONFIG,
        'outage.config': DEFAULT_OUTAGE_CONFIG,
        'insights.config': DEFAULT_INSIGHTS_CONFIG,
      },
    };
  }

  update(key: string, value: unknown, actorId: string) {
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
    this.repo.set(key, parsed, at);
    this.activity.log(actorId, 'settings.update', 'setting', key, { value: parsed }, at);
    return parsed;
  }
}
