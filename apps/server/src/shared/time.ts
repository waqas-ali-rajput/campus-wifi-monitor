/** Clock port — application code never calls `new Date()` directly for business time. */
export interface Clock {
  now(): Date;
}
export const systemClock: Clock = { now: () => new Date() };

export class FixedClock implements Clock {
  constructor(private t: Date) {}
  now() {
    return new Date(this.t);
  }
  set(t: Date) {
    this.t = t;
  }
  advance(ms: number) {
    this.t = new Date(this.t.getTime() + ms);
  }
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
    });
    fmtCache.set(tz, f);
  }
  return f;
}
const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dow: number;
  dayKey: string;
}

export function localParts(d: Date | string, tz: string): LocalParts {
  const date = typeof d === 'string' ? new Date(d) : d;
  const p: Record<string, string> = {};
  for (const x of fmt(tz).formatToParts(date)) p[x.type] = x.value;
  const year = +p.year!;
  const month = +p.month!;
  const day = +p.day!;
  return {
    year,
    month,
    day,
    hour: +p.hour! % 24,
    minute: +p.minute!,
    dow: DOW[p.weekday!] ?? 0,
    dayKey: `${p.year}-${p.month}-${p.day}`,
  };
}

/** UTC instant of local midnight for the day containing `now` (optionally N days back). */
export function startOfLocalDay(now: Date, tz: string, daysBack = 0): Date {
  const lp = localParts(now, tz);
  const asUtc = Date.UTC(lp.year, lp.month - 1, lp.day, lp.hour, lp.minute);
  const offset = asUtc - Math.floor(now.getTime() / 60000) * 60000; // local - utc
  const midnightLocalAsUtc = Date.UTC(lp.year, lp.month - 1, lp.day - daysBack, 0, 0);
  return new Date(midnightLocalAsUtc - offset);
}

/** 0 = today, 1 = yesterday … in local days. */
export function localDayIndex(iso: string, now: Date, tz: string): number {
  const a = localParts(iso, tz);
  const b = localParts(now, tz);
  const da = Date.UTC(a.year, a.month - 1, a.day);
  const db = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((db - da) / 86400000);
}

export const iso = (d: Date) => d.toISOString();
export const minutesAgo = (now: Date, m: number) => new Date(now.getTime() - m * 60000).toISOString();
export const hoursAgo = (now: Date, h: number) => minutesAgo(now, h * 60);
export const daysAgo = (now: Date, d: number) => minutesAgo(now, d * 1440);
