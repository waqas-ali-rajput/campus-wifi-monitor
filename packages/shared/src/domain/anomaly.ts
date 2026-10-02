import type { HealthStatus } from '../constants';
import { mad, mean, median } from './stats';

export interface InsightsConfig {
  anomaly: { minSamples: number; zThreshold: number; minDropPct: number; pingFactor: number; minLossPct: number; baselineDays: number; excludeRecentMinutes: number };
  problem: { lookback: number; minPoor: number; criticalAt: number; windowHours: number };
  trend: { recent: number; ratio: number; minSamples: number; days: number };
}

export const DEFAULT_INSIGHTS_CONFIG: InsightsConfig = {
  anomaly: { minSamples: 8, zThreshold: 3, minDropPct: 40, pingFactor: 2, minLossPct: 5, baselineDays: 14, excludeRecentMinutes: 60 },
  problem: { lookback: 5, minPoor: 3, criticalAt: 4, windowHours: 24 },
  trend: { recent: 3, ratio: 0.75, minSamples: 8, days: 14 },
};

export interface HistSample {
  download: number;
  ping: number;
  loss: number;
  hour: number; // local hour 0..23
  testedAt: string;
}

/** Baseline: same local hour ±1 over the last N days excluding the last 60 min; falls back to all hours. */
export function selectBaseline(
  history: HistSample[],
  targetHour: number,
  now: Date,
  cfg: InsightsConfig = DEFAULT_INSIGHTS_CONFIG,
): HistSample[] | null {
  const a = cfg.anomaly;
  const from = now.getTime() - a.baselineDays * 86400000;
  const to = now.getTime() - a.excludeRecentMinutes * 60000;
  const pool = history.filter((h) => {
    const t = Date.parse(h.testedAt);
    return t >= from && t <= to;
  });
  const near = pool.filter((h) => {
    const d = Math.abs(h.hour - targetHour);
    return Math.min(d, 24 - d) <= 1;
  });
  if (near.length >= a.minSamples) return near;
  if (pool.length >= a.minSamples) return pool;
  return null;
}

export function robustZ(x: number, xs: number[]): { z: number; med: number } {
  const med = median(xs);
  let scale = 1.4826 * mad(xs);
  if (scale === 0) scale = 0.1 * med || 1;
  return { z: (x - med) / scale, med };
}

export interface AnomalyResult {
  metric: 'download' | 'ping' | 'loss';
  value: number;
  usual: number;
  z: number;
  message: string;
}

const f1 = (x: number) => (x < 10 ? x.toFixed(1) : Math.round(x).toString());

export function detectAnomaly(
  test: { download: number; ping: number; loss: number },
  baseline: HistSample[],
  locationName: string,
  cfg: InsightsConfig = DEFAULT_INSIGHTS_CONFIG,
): AnomalyResult | null {
  const a = cfg.anomaly;
  const d = robustZ(test.download, baseline.map((b) => b.download));
  const dropPct = d.med > 0 ? ((d.med - test.download) / d.med) * 100 : 0;
  if (d.z <= -a.zThreshold && dropPct >= a.minDropPct) {
    return {
      metric: 'download',
      value: test.download,
      usual: d.med,
      z: d.z,
      message: `Download speed at ${locationName} is ${f1(test.download)} Mbps, ${Math.round(dropPct)}% below its usual ${f1(d.med)} Mbps for this hour.`,
    };
  }
  const p = robustZ(test.ping, baseline.map((b) => b.ping));
  if (p.z >= a.zThreshold && test.ping >= a.pingFactor * p.med) {
    return {
      metric: 'ping',
      value: test.ping,
      usual: p.med,
      z: p.z,
      message: `Ping at ${locationName} is ${Math.round(test.ping)} ms, ${(test.ping / p.med).toFixed(1)}× its usual ${Math.round(p.med)} ms for this hour.`,
    };
  }
  const l = robustZ(test.loss, baseline.map((b) => b.loss));
  if (l.z >= a.zThreshold && test.loss >= a.minLossPct) {
    return {
      metric: 'loss',
      value: test.loss,
      usual: l.med,
      z: l.z,
      message: `Packet loss at ${locationName} is ${f1(test.loss)}%, well above its usual ${f1(l.med)}%.`,
    };
  }
  return null;
}

/** §9.1(b) Automatic problem detection. `statuses` = tests in the window, newest first. */
export function detectProblem(
  statuses: HealthStatus[],
  locationName: string,
  cfg: InsightsConfig = DEFAULT_INSIGHTS_CONFIG,
): { severity: 'warning' | 'critical'; poorCount: number; message: string } | null {
  const last = statuses.slice(0, cfg.problem.lookback);
  const poor = last.filter((s) => s === 'poor' || s === 'critical').length;
  if (poor < cfg.problem.minPoor) return null;
  return {
    severity: poor >= cfg.problem.criticalAt ? 'critical' : 'warning',
    poorCount: poor,
    message: `Possible network problem detected in ${locationName}.`,
  };
}

/** §9.1(c) Performance trend detection. */
export function detectTrendDrop(
  recentScoresNewestFirst: number[],
  previousScores: number[],
  cfg: InsightsConfig = DEFAULT_INSIGHTS_CONFIG,
): { recentMean: number; usualMean: number; message: string } | null {
  const t = cfg.trend;
  if (recentScoresNewestFirst.length < t.recent || previousScores.length < t.minSamples) return null;
  const recentMean = mean(recentScoresNewestFirst.slice(0, t.recent));
  const usualMean = mean(previousScores);
  if (recentMean < t.ratio * usualMean) {
    return { recentMean, usualMean, message: 'Network performance is lower than the usual average for this location.' };
  }
  return null;
}
