import type { HealthStatus } from '../constants';

/** §5.2 health configuration (stored in settings key `health.config`). */
export interface HealthConfig {
  caps: { downloadMbps: number; uploadMbps: number };
  ping: { best: number; worst: number };
  loss: { best: number; worst: number };
  weights: { download: number; upload: number; ping: number; loss: number };
  penalty: { perFailure: number; maxFailure: number; perComplaint: number; maxComplaint: number; windowHours: number };
  bands: { excellent: number; good: number; fair: number; poor: number };
  location: { windowMinutes: number; maxTests: number; halfLifeMinutes: number; staleHours: number };
}

export const DEFAULT_HEALTH_CONFIG: HealthConfig = {
  caps: { downloadMbps: 100, uploadMbps: 50 },
  ping: { best: 20, worst: 300 },
  loss: { best: 0, worst: 15 },
  weights: { download: 0.3, upload: 0.15, ping: 0.3, loss: 0.25 },
  penalty: { perFailure: 2, maxFailure: 10, perComplaint: 1, maxComplaint: 10, windowHours: 24 },
  bands: { excellent: 90, good: 70, fair: 50, poor: 30 },
  location: { windowMinutes: 120, maxTests: 5, halfLifeMinutes: 30, staleHours: 24 },
};

export interface Metrics {
  downloadMbps: number;
  uploadMbps: number;
  pingMs: number;
  lossPct: number;
}

export interface SubScores {
  download: number;
  upload: number;
  ping: number;
  loss: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
export const round1 = (x: number) => Math.round(x * 10) / 10;

export function logScore(x: number, cap: number): number {
  if (!(x > 0)) return 0;
  return Math.min(100, (100 * Math.log(1 + x)) / Math.log(1 + cap));
}

export function linearScore(x: number, a: number, b: number): number {
  return clamp((100 * (x - a)) / (b - a), 0, 100);
}

export function subScores(m: Metrics, cfg: HealthConfig = DEFAULT_HEALTH_CONFIG): SubScores {
  return {
    download: logScore(m.downloadMbps, cfg.caps.downloadMbps),
    upload: logScore(m.uploadMbps, cfg.caps.uploadMbps),
    ping: 100 - linearScore(m.pingMs, cfg.ping.best, cfg.ping.worst),
    loss: 100 - linearScore(m.lossPct, cfg.loss.best, cfg.loss.worst),
  };
}

export function baseScore(m: Metrics, cfg: HealthConfig = DEFAULT_HEALTH_CONFIG): number {
  const s = subScores(m, cfg);
  const w = cfg.weights;
  return clamp(w.download * s.download + w.upload * s.upload + w.ping * s.ping + w.loss * s.loss, 0, 100);
}

export function penaltyFor(
  recentFailures: number,
  recentOpenComplaints: number,
  cfg: HealthConfig = DEFAULT_HEALTH_CONFIG,
): number {
  const p = cfg.penalty;
  return (
    Math.min(p.maxFailure, p.perFailure * Math.max(0, recentFailures)) +
    Math.min(p.maxComplaint, p.perComplaint * Math.max(0, recentOpenComplaints))
  );
}

export function statusFromScore(score: number, cfg: HealthConfig = DEFAULT_HEALTH_CONFIG): HealthStatus {
  const b = cfg.bands;
  if (score >= b.excellent) return 'excellent';
  if (score >= b.good) return 'good';
  if (score >= b.fair) return 'fair';
  if (score >= b.poor) return 'poor';
  return 'critical';
}

export interface HealthResult {
  baseScore: number;
  penalty: number;
  healthScore: number;
  status: HealthStatus;
  sub: SubScores;
}

/** Converts raw network values into a 0–100 score and one of the brief's five statuses. */
export function computeHealth(
  m: Metrics,
  ctx: { recentFailures?: number; recentOpenComplaints?: number } = {},
  cfg: HealthConfig = DEFAULT_HEALTH_CONFIG,
): HealthResult {
  const base = baseScore(m, cfg);
  const penalty = penaltyFor(ctx.recentFailures ?? 0, ctx.recentOpenComplaints ?? 0, cfg);
  const healthScore = round1(Math.max(0, base - penalty));
  return {
    baseScore: round1(base),
    penalty,
    healthScore,
    status: statusFromScore(healthScore, cfg),
    sub: subScores(m, cfg),
  };
}

/** Validation rules for saving a health config (§5.2). Returns a list of problems (empty = valid). */
export function validateHealthConfig(cfg: HealthConfig): string[] {
  const errs: string[] = [];
  const w = cfg.weights;
  const sum = w.download + w.upload + w.ping + w.loss;
  if (Math.abs(sum - 1) > 0.001) errs.push(`Weights must add up to 1 (currently ${sum.toFixed(3)}).`);
  const b = cfg.bands;
  if (!(b.excellent > b.good && b.good > b.fair && b.fair > b.poor))
    errs.push('Bands must be strictly descending: excellent > good > fair > poor.');
  const nums: number[] = [];
  const walk = (o: unknown) => {
    if (typeof o === 'number') nums.push(o);
    else if (o && typeof o === 'object') Object.values(o).forEach(walk);
  };
  walk(cfg);
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) errs.push('All values must be finite and not negative.');
  if (cfg.ping.worst <= cfg.ping.best) errs.push('Worst ping must be greater than best ping.');
  if (cfg.loss.worst <= cfg.loss.best) errs.push('Worst packet loss must be greater than best packet loss.');
  return errs;
}
