import { COMPLAINT_TYPE_LABELS, mean, median, type DashboardSummary } from '@campus/shared';
import { daysAgo, localParts, startOfLocalDay, type Clock } from '../../../shared/time';
import type { AnalyticsRepo, Range } from '../infrastructure/AnalyticsRepo';
import type { TestRepo } from '../../tests/infrastructure/TestRepo';
import type { LocationRepo } from '../../locations/infrastructure/LocationRepo';
import type { OutageRepo } from '../../outages/infrastructure/OutageRepo';
import type { LocationService } from '../../locations/application/LocationService';

const r1 = (x: number | null | undefined) => (x == null || Number.isNaN(x) ? null : Math.round(x * 10) / 10);

export class AnalyticsService {
  constructor(
    private repo: AnalyticsRepo,
    private tests: TestRepo,
    private locationRepo: LocationRepo,
    private locations: LocationService,
    private outages: OutageRepo,
    private clock: Clock,
    private tz: string,
  ) {}

  range(q: { from?: string; to?: string; location_id?: string; building?: string; days?: number }): Range {
    const now = this.clock.now();
    return {
      from: q.from ? new Date(q.from).toISOString() : startOfLocalDay(now, this.tz, (q.days ?? 14) - 1).toISOString(),
      to: q.to ? new Date(q.to).toISOString() : now.toISOString(),
      location_id: q.location_id || undefined,
      building: q.building || undefined,
    };
  }

  async summary(): Promise<DashboardSummary> {
    const now = this.clock.now();
    const since = startOfLocalDay(now, this.tz).toISOString();
    const k = await this.repo.kpis(since);
    const c = await this.repo.complaintCounts(since);
    const locs = await this.locationRepo.all();
    return {
      testsToday: k.tests,
      avgDownload: r1(k.d),
      avgUpload: r1(k.u),
      avgPing: r1(k.p),
      avgLoss: r1(k.l),
      poorLocations: locs.filter((l) => l.current_status === 'poor' || l.current_status === 'critical').length,
      openComplaints: c.open ?? 0,
      resolvedComplaints: c.resolved ?? 0,
      resolvedToday: c.resolved_today ?? 0,
      currentOutages: (await this.outages.active()).length,
    };
  }

  async campusStatus() {
    return {
      locations: await this.locations.list(),
      outages: await this.outages.active(),
      recent: await this.repo.recentEvents(10),
      generated_at: this.clock.now().toISOString(),
    };
  }

  async heatmap() {
    return (await this.locations.list()).map((l) => ({
      location_id: l.location_id,
      name: l.location_name,
      building: l.building,
      map_x: l.map_x,
      map_y: l.map_y,
      latitude: l.latitude,
      longitude: l.longitude,
      status: l.current_status,
      score: l.current_score,
      stale: !!l.current_stale,
      outage: l.active_outage,
      maintenance: l.active_maintenance,
      tests_today: l.today.tests,
      complaints_today: l.today.complaints,
    }));
  }

  byLocation(r: Range) {
    return this.repo.byLocation(r);
  }

  async byHour(r: Range) {
    const rows = await this.tests.rowsSince(r.from, { to: r.to, location_id: r.location_id, building: r.building });
    const buckets = Array.from({ length: 24 }, () => [] as typeof rows);
    for (const t of rows) buckets[localParts(t.tested_at, this.tz).hour]!.push(t);
    return buckets.map((b, hour) => ({
      hour,
      label: `${String(hour).padStart(2, '0')}:00`,
      tests: b.length,
      avg_score: r1(mean(b.map((x) => x.health_score))),
      avg_download: r1(mean(b.map((x) => x.download_speed))),
      avg_upload: r1(mean(b.map((x) => x.upload_speed))),
      avg_ping: r1(mean(b.map((x) => x.ping))),
    }));
  }

  async byDay(r: Range) {
    const rows = await this.tests.rowsSince(r.from, { to: r.to, location_id: r.location_id, building: r.building });
    const complaints = await this.repo.complaintRows(r);
    const map = new Map<string, typeof rows>();
    for (const t of rows) {
      const k = localParts(t.tested_at, this.tz).dayKey;
      map.set(k, [...(map.get(k) ?? []), t]);
    }
    const cmap = new Map<string, number>();
    for (const c of complaints) {
      const k = localParts(c.created_at, this.tz).dayKey;
      cmap.set(k, (cmap.get(k) ?? 0) + 1);
    }
    const days: string[] = [];
    const start = new Date(r.from);
    for (let d = new Date(start); d <= new Date(r.to); d = new Date(d.getTime() + 86400000)) {
      const k = localParts(d, this.tz).dayKey;
      if (!days.includes(k)) days.push(k);
    }
    const endKey = localParts(new Date(r.to), this.tz).dayKey;
    if (!days.includes(endKey)) days.push(endKey);
    return days.map((day) => {
      const b = map.get(day) ?? [];
      return {
        day,
        tests: b.length,
        avg_score: r1(mean(b.map((x) => x.health_score))),
        avg_download: r1(mean(b.map((x) => x.download_speed))),
        avg_upload: r1(mean(b.map((x) => x.upload_speed))),
        avg_ping: r1(mean(b.map((x) => x.ping))),
        poor_tests: b.filter((x) => x.health_status === 'poor' || x.health_status === 'critical').length,
        complaints: cmap.get(day) ?? 0,
      };
    });
  }

  async complaintsByBuilding(r: Range) {
    const rows = await this.repo.complaintsByBuilding(r);
    const out = new Map<string, Record<string, number | string>>();
    for (const x of rows) {
      const e = out.get(x.building) ?? { building: x.building, total: 0 };
      e[x.complaint_type] = x.n;
      e.total = (e.total as number) + x.n;
      out.set(x.building, e);
    }
    return { rows: [...out.values()].sort((a, b) => (b.total as number) - (a.total as number)), labels: COMPLAINT_TYPE_LABELS };
  }

  /** Peak usage periods: volume and score per hour of day. */
  async peakPeriods(r: Range) {
    const hours = await this.byHour(r);
    const byVolume = [...hours].sort((a, b) => b.tests - a.tests).slice(0, 3);
    const worst = [...hours].filter((h) => h.tests >= 3).sort((a, b) => (a.avg_score ?? 100) - (b.avg_score ?? 100)).slice(0, 3);
    return { hours, busiest: byVolume, slowest: worst };
  }

  async trends(locationId: string | undefined, days = 14) {
    const r = this.range({ days, location_id: locationId });
    return { daily: await this.byDay(r), hourly: await this.byHour(r), location_id: locationId ?? null, days };
  }

  compareBuildings(r: Range) {
    return this.repo.compareBuildings(r);
  }

  /** Locations/categories repeating on ≥ 3 distinct days in 14 d. */
  async recurringProblems(r: Range) {
    const now = this.clock.now();
    const range = { ...r, from: r.from ?? daysAgo(now, 14) };
    const complaints = await this.repo.complaintRows(range);
    const groups = new Map<string, { location_id: string; location_name: string; building: string; type: string; days: Set<string>; count: number; last: string }>();
    for (const c of complaints) {
      const key = `${c.location_id}|${c.complaint_type}`;
      const g = groups.get(key) ?? { location_id: c.location_id, location_name: c.location_name, building: c.building, type: c.complaint_type, days: new Set(), count: 0, last: c.created_at };
      g.days.add(localParts(c.created_at, this.tz).dayKey);
      g.count++;
      if (c.created_at > g.last) g.last = c.created_at;
      groups.set(key, g);
    }
    const complaintItems = [...groups.values()]
      .filter((g) => g.days.size >= 3)
      .map((g) => ({
        kind: 'complaints' as const,
        location_id: g.location_id,
        location_name: g.location_name,
        building: g.building,
        problem: COMPLAINT_TYPE_LABELS[g.type as keyof typeof COMPLAINT_TYPE_LABELS] ?? g.type,
        days: g.days.size,
        count: g.count,
        last_seen: g.last,
      }));
    const rows = await this.tests.rowsSince(range.from, { to: range.to, location_id: r.location_id, building: r.building });
    const perLocDay = new Map<string, Map<string, number[]>>();
    for (const t of rows) {
      const m = perLocDay.get(t.location_id) ?? new Map();
      const k = localParts(t.tested_at, this.tz).dayKey;
      m.set(k, [...(m.get(k) ?? []), t.health_score]);
      perLocDay.set(t.location_id, m);
    }
    const names = new Map(rows.map((t) => [t.location_id, t]));
    const testItems = [...perLocDay]
      .map(([loc, days]) => {
        const bad = [...days].filter(([, s]) => s.filter((x) => x < 50).length >= Math.max(3, s.length * 0.3));
        return { loc, bad };
      })
      .filter((x) => x.bad.length >= 3)
      .map((x) => ({
        kind: 'tests' as const,
        location_id: x.loc,
        location_name: names.get(x.loc)!.location_name,
        building: names.get(x.loc)!.building,
        problem: 'Repeated Poor/Critical speed tests',
        days: x.bad.length,
        count: x.bad.reduce((s, [, v]) => s + v.filter((y) => y < 50).length, 0),
        last_seen: rows.filter((t) => t.location_id === x.loc).at(-1)!.tested_at,
      }));
    return [...complaintItems, ...testItems].sort((a, b) => b.days - a.days || b.count - a.count);
  }

  staffActivity(r: Range) {
    return this.repo.staffActivity(r);
  }

  /** Location detail (IT): 24 h series, hour-of-day profile. */
  async locationSeries(locationId: string) {
    const now = this.clock.now();
    const rows = await this.tests.rowsSince(daysAgo(now, 1), { location_id: locationId });
    const series = rows.map((t) => ({
      at: t.tested_at,
      score: t.health_score,
      download: t.download_speed,
      upload: t.upload_speed,
      ping: t.ping,
      loss: t.packet_loss,
    }));
    const r = this.range({ days: 14, location_id: locationId });
    return { series24h: series, byHour: await this.byHour(r), median24h: r1(median(rows.map((x) => x.health_score))) };
  }
}