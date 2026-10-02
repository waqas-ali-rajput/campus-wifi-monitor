import { clamp01, mean, median, quantile, slope } from './stats';

/** §9.3 outage risk 0–100. */
export interface RiskInput {
  scoresOldestFirst: number[]; // last 10 tests
  tests3h: number;
  failures3h: number;
  complaints3h: number;
  anomalies6h: number;
}

export interface RiskResult {
  risk: number;
  level: 'low' | 'medium' | 'high';
  slope: number;
  parts: { trend: number; failures: number; complaints: number; anomalies: number };
}

export function outageRisk(i: RiskInput): RiskResult | null {
  if (i.scoresOldestFirst.length < 4 && i.complaints3h < 2) return null;
  const s = slope(i.scoresOldestFirst.slice(-10));
  const failureRate = i.failures3h + i.tests3h > 0 ? i.failures3h / (i.failures3h + i.tests3h) : 0;
  const parts = {
    trend: 40 * clamp01(-s / 10),
    failures: 25 * failureRate,
    complaints: 20 * clamp01(i.complaints3h / 5),
    anomalies: 15 * clamp01(i.anomalies6h / 3),
  };
  const risk = Math.round(parts.trend + parts.failures + parts.complaints + parts.anomalies);
  const level = risk >= 70 ? 'high' : risk >= 40 ? 'medium' : 'low';
  return { risk, level, slope: s, parts };
}

export function riskMessage(locationName: string, r: RiskResult, complaints3h: number): string {
  const bits: string[] = [];
  if (r.slope < -1) bits.push('a falling trend');
  if (complaints3h > 0) bits.push(`${complaints3h} complaint${complaints3h === 1 ? '' : 's'} in 3 hours`);
  if (r.parts.failures > 3) bits.push('failed speed tests');
  if (r.parts.anomalies > 0) bits.push('recent anomalies');
  const why = bits.length ? ` shows ${bits.join(' with ')}.` : ' shows early warning signs.';
  return `${locationName}${why} Outage risk: ${r.level} (${r.risk}).`;
}

/** §9.4 hour-of-week profile & next-24 h forecast. */
export interface WeekSample {
  dow: number; // 0 Sunday … 6 Saturday (local)
  hour: number; // 0..23 local
  score: number;
  download: number;
}

export interface ForecastRow {
  hour: number;
  dow: number;
  expectedScore: number | null;
  expectedDownload: number | null;
  samples: number;
  isDip: boolean;
}

export function forecastNext24h(
  samples: WeekSample[],
  startDow: number,
  startHour: number,
  minSamples = 5,
): { rows: ForecastRow[]; dips: Array<{ from: number; to: number; label: string; expectedScore: number }> } {
  const cells = new Map<string, WeekSample[]>();
  for (const s of samples) {
    const k = `${s.dow}:${s.hour}`;
    const arr = cells.get(k) ?? [];
    arr.push(s);
    cells.set(k, arr);
  }
  const allScores = samples.map((s) => s.score);
  const p25 = quantile(allScores, 0.25);
  const typical = median(allScores);
  const raw: ForecastRow[] = [];
  for (let i = 0; i < 24; i++) {
    const hour = (startHour + i) % 24;
    const dow = (startDow + Math.floor((startHour + i) / 24)) % 7;
    const c = cells.get(`${dow}:${hour}`) ?? [];
    raw.push({
      hour,
      dow,
      expectedScore: c.length ? median(c.map((x) => x.score)) : null,
      expectedDownload: c.length ? mean(c.map((x) => x.download)) : null,
      samples: c.length,
      isDip: false,
    });
  }
  // 3-hour centred moving average over the available values
  const rows = raw.map((r, i) => {
    const win = [raw[i - 1], r, raw[i + 1]].filter((x): x is ForecastRow => !!x && x.expectedScore != null);
    const sm = win.length ? mean(win.map((x) => x.expectedScore!)) : null;
    const isDip = sm != null && r.samples >= minSamples && sm <= p25 && sm < typical - 2;
    return { ...r, expectedScore: sm == null ? null : Math.round(sm * 10) / 10, isDip };
  });
  // merge consecutive dip hours into ranges
  const ranges: Array<{ from: number; to: number; expectedScore: number }> = [];
  let cur: { from: number; to: number; scores: number[] } | null = null as { from: number; to: number; scores: number[] } | null;
  for (const r of rows) {
    if (r.isDip) {
      if (cur && cur.to === r.hour) {
        cur.to = (r.hour + 1) % 24;
        cur.scores.push(r.expectedScore!);
      } else {
        if (cur) ranges.push({ from: cur.from, to: cur.to, expectedScore: mean(cur.scores) });
        cur = { from: r.hour, to: (r.hour + 1) % 24, scores: [r.expectedScore!] };
      }
    } else if (cur) {
      ranges.push({ from: cur.from, to: cur.to, expectedScore: mean(cur.scores) });
      cur = null;
    }
  }
  if (cur) ranges.push({ from: cur.from, to: cur.to, expectedScore: mean(cur.scores) });
  const pad = (h: number) => `${String(h).padStart(2, '0')}:00`;
  const dips = ranges
    .sort((a, b) => a.expectedScore - b.expectedScore)
    .slice(0, 3)
    .map((r) => ({ ...r, expectedScore: Math.round(r.expectedScore * 10) / 10, label: `${pad(r.from)}–${pad(r.to)}` }));
  return { rows, dips };
}
