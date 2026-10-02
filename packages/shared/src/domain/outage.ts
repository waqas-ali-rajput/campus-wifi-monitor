import type { ComplaintType, FailureReason, HealthStatus } from '../constants';

/** §5.3 outage rules config (settings key `outage.config`). */
export interface OutageConfig {
  r1: { minUsers: number; windowMinutes: number; minAiConfidence: number };
  r2: { minFailures: number; minUsers: number; windowMinutes: number };
  r3: { consecutiveCritical: number };
  recovery: { consecutiveGood: number; minScore: number };
}

export const DEFAULT_OUTAGE_CONFIG: OutageConfig = {
  r1: { minUsers: 3, windowMinutes: 30, minAiConfidence: 0.6 },
  r2: { minFailures: 3, minUsers: 2, windowMinutes: 15 },
  r3: { consecutiveCritical: 3 },
  recovery: { consecutiveGood: 2, minScore: 50 },
};

export interface ComplaintSignal {
  userId: string;
  complaintType: ComplaintType;
  aiCategory: ComplaintType | null;
  aiConfidence: number | null;
  createdAt: string;
}
export interface FailureSignal {
  userId: string;
  reason: FailureReason;
  occurredAt: string;
}

export type OutageRule = 'R1' | 'R2' | 'R3';
export interface RuleResult {
  rule: OutageRule;
  complaintCount: number;
  failureCount: number;
  category?: ComplaintType;
  explanation: string;
}

/** Category used for clustering: the user's choice, or the AI category when the user picked "other". */
export function effectiveCategory(c: ComplaintSignal, cfg: OutageConfig = DEFAULT_OUTAGE_CONFIG): ComplaintType | null {
  if (c.complaintType !== 'other') return c.complaintType;
  if (c.aiCategory && c.aiCategory !== 'other' && (c.aiConfidence ?? 0) >= cfg.r1.minAiConfidence) return c.aiCategory;
  return null;
}

export function evaluateR1(
  complaints: ComplaintSignal[],
  now: Date,
  cfg: OutageConfig = DEFAULT_OUTAGE_CONFIG,
): RuleResult | null {
  const since = now.getTime() - cfg.r1.windowMinutes * 60000;
  const byCat = new Map<ComplaintType, { users: Set<string>; count: number }>();
  for (const c of complaints) {
    const t = Date.parse(c.createdAt);
    if (t < since || t > now.getTime()) continue;
    const cat = effectiveCategory(c, cfg);
    if (!cat) continue;
    const e = byCat.get(cat) ?? { users: new Set(), count: 0 };
    e.users.add(c.userId);
    e.count++;
    byCat.set(cat, e);
  }
  let best: { cat: ComplaintType; users: number; count: number } | null = null;
  for (const [cat, e] of byCat) {
    if (e.users.size >= cfg.r1.minUsers && (!best || e.users.size > best.users))
      best = { cat, users: e.users.size, count: e.count };
  }
  if (!best) return null;
  return {
    rule: 'R1',
    complaintCount: best.count,
    failureCount: 0,
    category: best.cat,
    explanation: `${best.users} users reported the same problem within ${cfg.r1.windowMinutes} minutes`,
  };
}

export function evaluateR2(
  failures: FailureSignal[],
  now: Date,
  cfg: OutageConfig = DEFAULT_OUTAGE_CONFIG,
): RuleResult | null {
  const since = now.getTime() - cfg.r2.windowMinutes * 60000;
  const recent = failures.filter((f) => {
    const t = Date.parse(f.occurredAt);
    return f.reason === 'unreachable' && t >= since && t <= now.getTime();
  });
  const users = new Set(recent.map((f) => f.userId));
  if (recent.length >= cfg.r2.minFailures && users.size >= cfg.r2.minUsers) {
    return {
      rule: 'R2',
      complaintCount: 0,
      failureCount: recent.length,
      explanation: `${recent.length} speed tests from ${users.size} users could not reach the network within ${cfg.r2.windowMinutes} minutes`,
    };
  }
  return null;
}

/** `latestStatuses` newest first. */
export function evaluateR3(latestStatuses: HealthStatus[], cfg: OutageConfig = DEFAULT_OUTAGE_CONFIG): RuleResult | null {
  const n = cfg.r3.consecutiveCritical;
  if (latestStatuses.length >= n && latestStatuses.slice(0, n).every((s) => s === 'critical')) {
    return {
      rule: 'R3',
      complaintCount: 0,
      failureCount: 0,
      explanation: `The last ${n} speed tests were all Critical`,
    };
  }
  return null;
}

export function evaluateOutageRules(
  input: { complaints: ComplaintSignal[]; failures: FailureSignal[]; latestStatuses: HealthStatus[] },
  now: Date,
  cfg: OutageConfig = DEFAULT_OUTAGE_CONFIG,
): RuleResult | null {
  return evaluateR1(input.complaints, now, cfg) ?? evaluateR2(input.failures, now, cfg) ?? evaluateR3(input.latestStatuses, cfg);
}

/** Auto-recovery: ≥ N consecutive tests (newest first, taken after detection) with score ≥ minScore and no rule firing. */
export function shouldAutoResolve(
  scoresSinceDetectionNewestFirst: number[],
  anyRuleFiring: boolean,
  cfg: OutageConfig = DEFAULT_OUTAGE_CONFIG,
): boolean {
  if (anyRuleFiring) return false;
  const n = cfg.recovery.consecutiveGood;
  return (
    scoresSinceDetectionNewestFirst.length >= n &&
    scoresSinceDetectionNewestFirst.slice(0, n).every((s) => s >= cfg.recovery.minScore)
  );
}

export function outageMessage(building: string | null | undefined, locationName: string): string {
  const where = building && building.trim() ? building.trim() : locationName;
  return `Possible Wi-Fi outage detected in ${where}.`;
}
