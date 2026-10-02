import type { LocationStatus } from '../constants';
import { DEFAULT_HEALTH_CONFIG, round1, statusFromScore, type HealthConfig } from './health';

export interface ScoredTest {
  baseScore: number;
  testedAt: string; // ISO
}

export interface LocationHealthResult {
  status: LocationStatus;
  score: number | null;
  stale: boolean;
  basedOn: number;
}

/**
 * Recency-weighted location score (§5.2 "Location health").
 * `tests` may be any order; `now` is injected (domain never reads the clock).
 */
export function computeLocationHealth(
  tests: ScoredTest[],
  penalty: number,
  now: Date,
  cfg: HealthConfig = DEFAULT_HEALTH_CONFIG,
): LocationHealthResult {
  const nowMs = now.getTime();
  const L = cfg.location;
  const withAge = tests
    .map((t) => ({ ...t, ageMin: (nowMs - Date.parse(t.testedAt)) / 60000 }))
    .filter((t) => t.ageMin >= 0)
    .sort((a, b) => a.ageMin - b.ageMin);

  const inWindow = withAge.filter((t) => t.ageMin <= L.windowMinutes).slice(0, L.maxTests);
  if (inWindow.length > 0) {
    let num = 0;
    let den = 0;
    for (const t of inWindow) {
      const w = Math.pow(0.5, t.ageMin / L.halfLifeMinutes);
      num += w * t.baseScore;
      den += w;
    }
    const score = round1(Math.min(100, Math.max(0, num / den - penalty)));
    return { status: statusFromScore(score, cfg), score, stale: false, basedOn: inWindow.length };
  }

  const recent = withAge.filter((t) => t.ageMin <= L.staleHours * 60);
  if (recent.length > 0) {
    const mean = recent.reduce((s, t) => s + t.baseScore, 0) / recent.length;
    const score = round1(Math.min(100, Math.max(0, mean - penalty)));
    return { status: statusFromScore(score, cfg), score, stale: true, basedOn: recent.length };
  }

  return { status: 'unknown', score: null, stale: false, basedOn: 0 };
}
