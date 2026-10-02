import type { LocationStatus } from '../constants';
import { STATUS_LABELS } from '../constants';

/** §9.6 inspection priority. */
export interface PriorityInput {
  locationId: string;
  locationName: string;
  currentScore: number | null; // already stale-adjusted by caller
  currentStatus: LocationStatus;
  poorShare7d: number; // 0..1
  complaints7d: number;
  activeOutage: boolean;
  recurringDays14d: number;
}

export interface PriorityResult extends PriorityInput {
  priority: number;
  reason: string;
  factors: { badness: number; poorShare: number; complaints: number; outage: number };
}

export function rankInspectionPriority(items: PriorityInput[]): PriorityResult[] {
  const maxComplaints = Math.max(1, ...items.map((i) => i.complaints7d));
  return items
    .map((i) => {
      const factors = {
        badness: 0.45 * (100 - (i.currentScore ?? 50)),
        poorShare: 0.25 * i.poorShare7d * 100,
        complaints: 0.2 * (i.complaints7d / maxComplaints) * 100,
        outage: 0.1 * (i.activeOutage ? 100 : i.recurringDays14d >= 3 ? 70 : 0),
      };
      const priority = Math.round(factors.badness + factors.poorShare + factors.complaints + factors.outage);
      const parts: Array<[number, string]> = [
        [factors.badness, i.currentScore == null ? 'no recent tests' : `score ${Math.round(i.currentScore)} (${STATUS_LABELS[i.currentStatus]})`],
        [factors.poorShare, `${Math.round(i.poorShare7d * 100)}% poor results in 7 days`],
        [factors.complaints, `${i.complaints7d} complaint${i.complaints7d === 1 ? '' : 's'} in 7 days`],
        [factors.outage, i.activeOutage ? 'outage active' : `recurring problems on ${i.recurringDays14d} days`],
      ];
      const reason = parts
        .filter(([v]) => v > 0.5)
        .sort((a, b) => b[0] - a[0])
        .slice(0, 3)
        .map(([, t]) => t)
        .join(', ');
      return { ...i, priority, factors, reason: reason || 'performing normally' };
    })
    .sort((a, b) => b.priority - a.priority);
}
