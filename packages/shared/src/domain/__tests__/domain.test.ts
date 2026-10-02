import { describe, expect, it } from 'vitest';
import { locationCreateSchema, locationPatchSchema } from '../../schemas';
import {
  canTransition,
  classifyComplaint,
  computeHealth,
  computeLocationHealth,
  detectAnomaly,
  detectProblem,
  detectTrendDrop,
  evaluateR1,
  evaluateR2,
  evaluateR3,
  findRecurringPoorWindows,
  forecastNext24h,
  nextStatuses,
  outageMessage,
  outageRisk,
  rankInspectionPriority,
  shouldAutoResolve,
  validateHealthConfig,
  DEFAULT_HEALTH_CONFIG,
  type ComplaintStatus,
} from '../../index';

const now = new Date('2026-05-10T12:00:00Z');
const minsAgo = (m: number) => new Date(now.getTime() - m * 60000).toISOString();

describe('verified location coordinates', () => {
  const base = { location_name: 'Lab Pin', building: 'Computer Labs', map_x: 50, map_y: 50 };
  it('accepts precise decimal pairs and unpinned legacy locations', () => {
    expect(locationCreateSchema.parse({ ...base, latitude: 25.408123, longitude: 68.260345 })).toMatchObject({ latitude: 25.408123, longitude: 68.260345 });
    expect(locationCreateSchema.parse(base)).toMatchObject({ latitude: null, longitude: null });
  });
  it('rejects out-of-range and incomplete coordinate pairs', () => {
    expect(locationCreateSchema.safeParse({ ...base, latitude: 91, longitude: 68 }).success).toBe(false);
    expect(locationCreateSchema.safeParse({ ...base, latitude: 25 }).success).toBe(false);
    expect(locationPatchSchema.safeParse({ latitude: 25 }).success).toBe(false);
    expect(locationPatchSchema.safeParse({ latitude: 25, longitude: 68 }).success).toBe(true);
  });
});

describe('health score – reference vectors (§5.2)', () => {
  const cases: Array<[number, number, number, number, number, number, number, string]> = [
    [36, 14, 28, 1, 0, 86.3, 86.3, 'good'],
    [5.2, 1.8, 190, 10, 0, 35.9, 35.9, 'poor'],
    [5.2, 1.8, 190, 10, 2, 35.9, 33.9, 'poor'],
    [100, 50, 10, 0, 0, 100, 100, 'excellent'],
    [0.1, 0.1, 300, 15, 0, 1, 1, 'critical'],
  ];
  it.each(cases)('%s/%s/%s/%s c=%s', (d, u, p, l, c, base, score, status) => {
    const r = computeHealth({ downloadMbps: d, uploadMbps: u, pingMs: p, lossPct: l }, { recentOpenComplaints: c });
    expect(Math.abs(r.baseScore - base)).toBeLessThanOrEqual(0.15);
    expect(Math.abs(r.healthScore - score)).toBeLessThanOrEqual(0.15);
    expect(r.status).toBe(status);
  });

  it('is monotonic and bounded', () => {
    let prev = -1;
    for (let d = 0; d <= 200; d += 5) {
      const s = computeHealth({ downloadMbps: d, uploadMbps: 10, pingMs: 50, lossPct: 1 }).healthScore;
      expect(s).toBeGreaterThanOrEqual(prev);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
      prev = s;
    }
  });

  it('validates config', () => {
    expect(validateHealthConfig(DEFAULT_HEALTH_CONFIG)).toEqual([]);
    const bad = structuredClone(DEFAULT_HEALTH_CONFIG);
    bad.weights.download = 0.5;
    bad.bands.good = 95;
    expect(validateHealthConfig(bad).length).toBe(2);
  });
});

describe('location health', () => {
  it('weights recent tests more', () => {
    const r = computeLocationHealth(
      [
        { baseScore: 90, testedAt: minsAgo(1) },
        { baseScore: 30, testedAt: minsAgo(90) },
      ],
      0,
      now,
    );
    expect(r.score!).toBeGreaterThan(80);
    expect(r.stale).toBe(false);
  });
  it('stale and unknown', () => {
    expect(computeLocationHealth([{ baseScore: 60, testedAt: minsAgo(300) }], 0, now)).toMatchObject({ stale: true, status: 'fair' });
    expect(computeLocationHealth([{ baseScore: 60, testedAt: minsAgo(60 * 30) }], 0, now).status).toBe('unknown');
  });
});

describe('complaint workflow', () => {
  const chain: ComplaintStatus[] = ['submitted', 'reviewed', 'assigned', 'in_progress', 'resolved'];
  it('allows the forward chain', () => {
    for (let i = 0; i < chain.length - 1; i++)
      expect(canTransition(chain[i]!, chain[i + 1]!, 'manager', false, { assignedStaffProvided: true }).ok).toBe(true);
  });
  it('rejects skipping, going back, users and non-assignee staff', () => {
    expect(canTransition('submitted', 'assigned', 'admin', false, { assignedStaffProvided: true })).toMatchObject({ ok: false, code: 'CONFLICT' });
    expect(canTransition('reviewed', 'submitted', 'admin', false)).toMatchObject({ ok: false, code: 'CONFLICT' });
    expect(canTransition('submitted', 'reviewed', 'user', false)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(canTransition('assigned', 'in_progress', 'it_staff', false)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(canTransition('assigned', 'in_progress', 'it_staff', true).ok).toBe(true);
    expect(canTransition('reviewed', 'assigned', 'it_staff', false)).toMatchObject({ ok: false, code: 'VALIDATION_ERROR' });
    expect(nextStatuses('resolved', 'admin', true)).toEqual([]);
  });
});

describe('classifier', () => {
  it('brief example', () => {
    expect(classifyComplaint('Wi-Fi disconnects every few minutes in Lab 3').category).toBe('frequent_disconnection');
  });
  it('other categories', () => {
    expect(classifyComplaint('Internet is very slow, videos keep buffering').category).toBe('slow_internet');
    expect(classifyComplaint('High ping and latency during video call').category).toBe('high_ping');
    expect(classifyComplaint('No internet at all, cannot connect').category).toBe('no_internet');
    expect(classifyComplaint('Weak signal in the corner, dead zone').category).toBe('weak_signal');
    expect(classifyComplaint('The LMS portal website is not loading').category).toBe('website_service_unavailable');
    expect(classifyComplaint('hello there').category).toBe('other');
  });
});

describe('outage rules', () => {
  const c = (u: string, m: number) => ({ userId: u, complaintType: 'no_internet' as const, aiCategory: null, aiConfidence: null, createdAt: minsAgo(m) });
  it('R1 needs 3 distinct users in 30 min', () => {
    expect(evaluateR1([c('a', 1), c('a', 2), c('b', 3)], now)).toBeNull();
    expect(evaluateR1([c('a', 1), c('b', 2), c('c', 3)], now)?.rule).toBe('R1');
    expect(evaluateR1([c('a', 1), c('b', 2), c('c', 45)], now)).toBeNull();
  });
  it('R2 and R3', () => {
    const f = (u: string) => ({ userId: u, reason: 'unreachable' as const, occurredAt: minsAgo(2) });
    expect(evaluateR2([f('a'), f('a'), f('b')], now)?.rule).toBe('R2');
    expect(evaluateR2([f('a'), f('a'), f('a')], now)).toBeNull();
    expect(evaluateR3(['critical', 'critical', 'critical', 'good'])?.rule).toBe('R3');
    expect(evaluateR3(['critical', 'poor', 'critical'])).toBeNull();
  });
  it('recovery and message', () => {
    expect(shouldAutoResolve([70, 60], false)).toBe(true);
    expect(shouldAutoResolve([70, 40], false)).toBe(false);
    expect(shouldAutoResolve([70, 60], true)).toBe(false);
    expect(outageMessage('Library Block', 'Library Floor 2')).toBe('Possible Wi-Fi outage detected in Library Block.');
  });
});

describe('intelligence', () => {
  it('anomaly fires on a big drop', () => {
    const base = Array.from({ length: 20 }, (_, i) => ({ download: 40 + (i % 5), ping: 25, loss: 0.5, hour: 12, testedAt: minsAgo(200 + i * 60) }));
    const r = detectAnomaly({ download: 4, ping: 30, loss: 0.5 }, base, 'Computer Lab 1');
    expect(r?.metric).toBe('download');
    expect(detectAnomaly({ download: 41, ping: 26, loss: 0.5 }, base, 'Computer Lab 1')).toBeNull();
  });
  it('problem detection and trend', () => {
    expect(detectProblem(['poor', 'poor', 'good', 'critical', 'fair'], 'Library Floor 2')?.message).toBe(
      'Possible network problem detected in Library Floor 2.',
    );
    expect(detectProblem(['poor', 'good', 'good', 'critical', 'fair'], 'X')).toBeNull();
    expect(detectTrendDrop([40, 42, 38], Array(10).fill(80))?.message).toBe(
      'Network performance is lower than the usual average for this location.',
    );
  });
  it('risk, forecast, priority, summary', () => {
    const r = outageRisk({ scoresOldestFirst: [90, 80, 70, 60, 50, 40, 30, 20, 10, 5], tests3h: 5, failures3h: 3, complaints3h: 5, anomalies6h: 3 });
    expect(r?.level).toBe('high');
    const samples = [];
    for (let d = 0; d < 7; d++)
      for (let h = 0; h < 24; h++) for (let k = 0; k < 6; k++) samples.push({ dow: d, hour: h, score: h >= 12 && h < 14 ? 30 : 80, download: 20 });
    const f = forecastNext24h(samples, 0, 0);
    expect(f.rows).toHaveLength(24);
    expect(f.dips[0]!.from).toBeGreaterThanOrEqual(11);
    const ranked = rankInspectionPriority([
      { locationId: 'a', locationName: 'Good', currentScore: 90, currentStatus: 'excellent', poorShare7d: 0, complaints7d: 0, activeOutage: false, recurringDays14d: 0 },
      { locationId: 'b', locationName: 'Bad', currentScore: 34, currentStatus: 'poor', poorShare7d: 0.6, complaints7d: 12, activeOutage: true, recurringDays14d: 5 },
    ]);
    expect(ranked[0]!.locationName).toBe('Bad');
    const ds = [];
    for (let day = 0; day < 4; day++)
      for (const hour of [12, 13]) for (let k = 0; k < 4; k++) ds.push({ dayIndex: day, hour, score: 30, download: 4, ping: 190, loss: 2 });
    const w = findRecurringPoorWindows('Library Floor 2', ds);
    expect(w[0]!.sentence).toBe(
      'Library Floor 2 experienced high latency and poor download speed between 12 PM and 2 PM for the last four days.',
    );
  });
});
