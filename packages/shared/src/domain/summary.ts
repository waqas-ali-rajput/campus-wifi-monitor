import { median } from './stats';

/** §9.5 AI network summary — deterministic template generation from data. */
export interface DaySample {
  dayIndex: number; // 0 = today, 1 = yesterday … (local days)
  hour: number;
  score: number;
  download: number;
  ping: number;
  loss: number;
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const num = (n: number) => WORDS[n] ?? String(n);

export function hour12(h: number): string {
  const hh = ((h % 24) + 24) % 24;
  if (hh === 0) return '12 AM';
  if (hh === 12) return '12 PM';
  return hh < 12 ? `${hh} AM` : `${hh - 12} PM`;
}

export interface RecurringWindow {
  startHour: number;
  endHour: number; // exclusive
  days: number;
  issues: string[];
  sentence: string;
}

export function findRecurringPoorWindows(
  locationName: string,
  samples: DaySample[],
  opts = { maxDays: 7, minSamples: 3, minDays: 3, threshold: 50 },
): RecurringWindow[] {
  // bad[hour] = set of dayIndex where that hour was poor
  const groups = new Map<string, DaySample[]>();
  for (const s of samples) {
    if (s.dayIndex >= opts.maxDays) continue;
    const k = `${s.dayIndex}:${s.hour}`;
    const arr = groups.get(k) ?? [];
    arr.push(s);
    groups.set(k, arr);
  }
  const badDays: Array<Set<number>> = Array.from({ length: 24 }, () => new Set());
  for (const [k, arr] of groups) {
    if (arr.length < opts.minSamples) continue;
    if (median(arr.map((a) => a.score)) < opts.threshold) {
      const [d, h] = k.split(':').map(Number);
      badDays[h!]!.add(d!);
    }
  }
  // consecutive-day run length for each hour, ending today or yesterday
  const run = badDays.map((set) => {
    const start = set.has(0) ? 0 : set.has(1) ? 1 : -1;
    if (start < 0) return 0;
    let n = 0;
    while (set.has(start + n)) n++;
    return n;
  });
  const windows: RecurringWindow[] = [];
  let h = 0;
  while (h < 24) {
    if (run[h]! >= opts.minDays) {
      const start = h;
      let days = run[h]!;
      while (h + 1 < 24 && run[h + 1]! >= opts.minDays) {
        h++;
        days = Math.min(days, run[h]!);
      }
      const end = h + 1;
      const inWin = samples.filter((s) => s.hour >= start && s.hour < end && s.dayIndex < days + 1);
      const issues: string[] = [];
      if (median(inWin.map((s) => s.ping)) > 100) issues.push('high latency');
      if (median(inWin.map((s) => s.download)) < 10) issues.push('poor download speed');
      if (median(inWin.map((s) => s.loss)) > 3) issues.push('packet loss');
      if (!issues.length) issues.push('poor network performance');
      const list = issues.length > 1 ? `${issues.slice(0, -1).join(', ')} and ${issues[issues.length - 1]}` : issues[0];
      windows.push({
        startHour: start,
        endHour: end,
        days,
        issues,
        sentence: `${locationName} experienced ${list} between ${hour12(start)} and ${hour12(end)} for the last ${num(days)} days.`,
      });
    }
    h++;
  }
  return windows;
}

export function campusSentences(i: {
  poorLocations: string[];
  worst: { name: string; score: number; status: string } | null;
  activeOutages: string[];
  complaintsToday: number;
  complaintsDailyAvg7d: number;
}): string[] {
  const out: string[] = [];
  if (i.poorLocations.length === 0) out.push('All monitored locations are currently Fair or better.');
  else
    out.push(
      `${i.poorLocations.length} location${i.poorLocations.length === 1 ? ' is' : 's are'} currently Poor or Critical: ${i.poorLocations.join(', ')}.`,
    );
  if (i.worst) out.push(`The weakest location right now is ${i.worst.name} with a health score of ${Math.round(i.worst.score)} (${i.worst.status}).`);
  if (i.activeOutages.length) out.push(`Active outage warnings: ${i.activeOutages.join('; ')}`);
  const avg = i.complaintsDailyAvg7d;
  if (avg > 0 && i.complaintsToday >= Math.max(3, avg * 1.5))
    out.push(`Complaints are spiking: ${i.complaintsToday} today versus a 7-day average of ${avg.toFixed(1)} per day.`);
  else out.push(`${i.complaintsToday} complaint${i.complaintsToday === 1 ? '' : 's'} filed today (7-day average ${avg.toFixed(1)} per day).`);
  return out;
}
