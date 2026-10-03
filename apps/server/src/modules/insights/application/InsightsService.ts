import {
  STATUS_LABELS,
  campusSentences,
  detectAnomaly,
  detectProblem,
  detectTrendDrop,
  findRecurringPoorWindows,
  forecastNext24h,
  median,
  outageRisk,
  rankInspectionPriority,
  riskMessage,
  selectBaseline,
  type HealthStatus,
  type LocationStatus,
  type SpeedTestDTO,
} from '@campus/shared';
import type { EventPublisher, LlmProvider } from '../../../shared/ports';
import { daysAgo, hoursAgo, localDayIndex, localParts, startOfLocalDay, type Clock } from '../../../shared/time';
import type { InsightRepo } from '../infrastructure/InsightRepo';
import type { TestRepo } from '../../tests/infrastructure/TestRepo';
import type { LocationRepo } from '../../locations/infrastructure/LocationRepo';
import type { OutageRepo } from '../../outages/infrastructure/OutageRepo';
import type { SettingsService } from '../../settings/application/SettingsService';

/** Orchestrates the local, deterministic "AI" features (§9). Math lives in packages/shared/src/domain. */
export class InsightsService {
  constructor(
    private repo: InsightRepo,
    private tests: TestRepo,
    private locations: LocationRepo,
    private outages: OutageRepo,
    private settings: SettingsService,
    private llm: LlmProvider,
    private events: EventPublisher,
    private clock: Clock,
    private tz: string,
  ) {}

  private emit(kind: string, locationId: string | null) {
    this.events.publish('insight.updated', { kind, location_id: locationId }, { roles: ['it_staff', 'manager', 'admin'] });
  }

  /** §9.1 a/b/c run immediately for the tested location. Returns messages of newly raised insights. */
  async onNewTest(test: SpeedTestDTO): Promise<string[]> {
    const now = this.clock.now();
    const at = now.toISOString();
    const cfg = await this.settings.insights();
    const loc = await this.locations.byId(test.location_id);
    if (!loc) return [];
    const raised: string[] = [];
    const history = await this.tests.rowsSince(daysAgo(now, Math.max(cfg.anomaly.baselineDays, cfg.trend.days)), { location_id: test.location_id });

    // (a) anomaly
    const samples = history
      .filter((h) => h.tested_at !== test.tested_at)
      .map((h) => ({ download: h.download_speed, ping: h.ping, loss: h.packet_loss, hour: localParts(h.tested_at, this.tz).hour, testedAt: h.tested_at }));
    const baseline = selectBaseline(samples, localParts(test.tested_at, this.tz).hour, now, cfg);
    const anomaly = baseline ? detectAnomaly({ download: test.download_speed, ping: test.ping, loss: test.packet_loss }, baseline, loc.location_name, cfg) : null;
    if (anomaly) {
      if (await this.repo.upsert('anomaly', loc.location_id, 'warning', anomaly.message, { ...anomaly, normalStreak: 0, test_id: test.test_id }, at))
        raised.push(anomaly.message);
      this.emit('anomaly', loc.location_id);
    } else {
      const cur = await this.repo.activeOne('anomaly', loc.location_id);
      if (cur) {
        const data = JSON.parse(cur.data_json || '{}');
        const streak = (data.normalStreak ?? 0) + 1;
        if (streak >= 2) await this.repo.deactivate('anomaly', loc.location_id, at);
        else await this.repo.updateData(cur.insight_id, { ...data, normalStreak: streak }, at);
        this.emit('anomaly', loc.location_id);
      }
    }

    // (b) automatic problem detection
    await this.evaluateProblem(loc.location_id, loc.location_name, raised);

    // (c) performance trend detection
    const scores = history.map((h) => ({ s: h.health_score, t: h.tested_at })).reverse(); // newest first
    const recent = scores.slice(0, cfg.trend.recent).map((x) => x.s);
    const prev = scores.slice(cfg.trend.recent).map((x) => x.s);
    const trend = detectTrendDrop(recent, prev, cfg);
    if (trend) {
      const msg = trend.message;
      if (await this.repo.upsert('trend_drop', loc.location_id, 'warning', msg, { recentMean: round(trend.recentMean), usualMean: round(trend.usualMean) }, at))
        raised.push(`${loc.location_name}: ${msg}`);
      this.emit('trend_drop', loc.location_id);
    } else if (await this.repo.deactivate('trend_drop', loc.location_id, at)) this.emit('trend_drop', loc.location_id);

    return raised;
  }

  private async evaluateProblem(locationId: string, name: string, raised: string[] = []) {
    const now = this.clock.now();
    const at = now.toISOString();
    const cfg = await this.settings.insights();
    const loc = (await this.locations.byId(locationId))!;
    const statuses = (await this.tests.rowsSince(hoursAgo(now, cfg.problem.windowHours), { location_id: locationId }))
      .reverse()
      .map((r) => r.health_status as HealthStatus);
    const problem = detectProblem(statuses, name, cfg);
    const fairOrBetter = ['excellent', 'good', 'fair'].includes(loc.current_status);
    if (problem && !fairOrBetter) {
      if (await this.repo.upsert('problem_detected', locationId, problem.severity, problem.message, { poorCount: problem.poorCount, of: Math.min(statuses.length, cfg.problem.lookback) }, at))
        raised.push(problem.message);
      this.emit('problem_detected', locationId);
    } else if ((fairOrBetter || !problem) && (await this.repo.deactivate('problem_detected', locationId, at))) {
      this.emit('problem_detected', locationId);
    }
  }

  /** §9.3–9.6 recompute (scheduler, every 5 min). */
  async refreshAll() {
    const now = this.clock.now();
    const at = now.toISOString();
    for (const l of await this.locations.all()) {
      await this.evaluateProblem(l.location_id, l.location_name);
      const p = await this.riskFor(l.location_id, l.location_name);
      if (p && p.level !== 'low') {
        await this.repo.upsert('outage_risk', l.location_id, p.level === 'high' ? 'critical' : 'warning', p.message, p, at);
        this.emit('outage_risk', l.location_id);
      } else if (await this.repo.deactivate('outage_risk', l.location_id, at)) this.emit('outage_risk', l.location_id);
    }
    const f = (await this.predictions()).campus;
    if (f.dips.length) {
      const d = f.dips[0]!;
      await this.repo.upsert('peak_forecast', null, 'info', `Wi-Fi performance is likely to dip between ${d.label} in the next 24 hours (expected score ${Math.round(d.expectedScore)}).`, f.dips, at);
    } else await this.repo.deactivate('peak_forecast', null, at);
  }

  private async riskFor(locationId: string, name: string) {
    const now = this.clock.now();
    const last10 = (await this.tests.rowsSince(daysAgo(now, 2), { location_id: locationId })).slice(-10);
    const tests3h = (await this.tests.rowsSince(hoursAgo(now, 3), { location_id: locationId })).length;
    const failures3h = (await this.tests.failuresSince(hoursAgo(now, 3), locationId)).length;
    const complaints3h = (await this.repo.complaintsSince(hoursAgo(now, 3))).filter((c) => c.location_id === locationId).length;
    const anomalies6h = await this.repo.countRecent('anomaly', locationId, hoursAgo(now, 6));
    const r = outageRisk({ scoresOldestFirst: last10.map((t) => t.health_score), tests3h, failures3h, complaints3h, anomalies6h });
    if (!r) return null;
    return { ...r, location_id: locationId, location_name: name, complaints3h, failures3h, message: riskMessage(name, r, complaints3h) };
  }

  async list(locationId?: string) {
    return (await this.repo.active(locationId)).filter((i) => i.kind !== 'summary' && i.kind !== 'recommendation');
  }

  /** §9.6 ranked "inspect first" list (also "Most problematic locations"). */
  async recommendations() {
    const now = this.clock.now();
    const rows = await this.tests.rowsSince(daysAgo(now, 14));
    const complaints = await this.repo.complaintsSince(daysAgo(now, 14));
    const activeOutages = new Set((await this.outages.active()).map((o) => o.location_id));
    const since7 = daysAgo(now, 7);
    const items = (await this.locations.all()).map((l) => {
      const mine = rows.filter((r) => r.location_id === l.location_id);
      const last7 = mine.filter((r) => r.tested_at >= since7);
      const poorShare = last7.length ? last7.filter((r) => r.health_status === 'poor' || r.health_status === 'critical').length / last7.length : 0;
      let score = l.current_score;
      if (score == null || l.current_stale) {
        const day = mine.filter((r) => r.tested_at >= hoursAgo(now, 24));
        if (day.length) score = day.reduce((s, r) => s + r.health_score, 0) / day.length;
      }
      // recurring: distinct local days with daily median < 50 or ≥ 2 complaints
      const days = new Map<string, number[]>();
      for (const r of mine) {
        const k = localParts(r.tested_at, this.tz).dayKey;
        days.set(k, [...(days.get(k) ?? []), r.health_score]);
      }
      const badDays = new Set([...days].filter(([, s]) => median(s) < 50).map(([k]) => k));
      const cDays = new Map<string, number>();
      for (const c of complaints.filter((c) => c.location_id === l.location_id)) {
        const k = localParts(c.created_at, this.tz).dayKey;
        cDays.set(k, (cDays.get(k) ?? 0) + 1);
      }
      for (const [k, n] of cDays) if (n >= 2) badDays.add(k);
      return {
        locationId: l.location_id,
        locationName: l.location_name,
        building: l.building,
        currentScore: score,
        currentStatus: l.current_status as LocationStatus,
        poorShare7d: poorShare,
        complaints7d: complaints.filter((c) => c.location_id === l.location_id && c.created_at >= since7).length,
        activeOutage: activeOutages.has(l.location_id),
        recurringDays14d: badDays.size,
      };
    });
    return rankInspectionPriority(items).map((r, i) => ({ rank: i + 1, ...r, text: `${i + 1}. ${r.locationName} – priority ${r.priority}: ${r.reason}.` }));
  }

  /** §9.3 + §9.4 */
  async predictions(locationId?: string) {
    const now = this.clock.now();
    const lp = localParts(now, this.tz);
    const rows = await this.tests.rowsSince(daysAgo(now, 28), locationId ? { location_id: locationId } : {});
    const samples = rows.map((r) => {
      const p = localParts(r.tested_at, this.tz);
      return { dow: p.dow, hour: p.hour, score: r.health_score, download: r.download_speed };
    });
    const campus = forecastNext24h(samples, lp.dow, lp.hour);
    const risks = [];
    for (const l of (await this.locations.all()).filter((x) => !locationId || x.location_id === locationId))
      risks.push((await this.riskFor(l.location_id, l.location_name)) ?? { location_id: l.location_id, location_name: l.location_name, risk: 0, level: 'low' as const, message: 'Not enough recent data for a prediction.', insufficient: true });
    risks.sort((a, b) => b.risk - a.risk);
    return { campus, risks };
  }

  /** §9.5 AI network summary. */
  async summary() {
    const now = this.clock.now();
    const rows = await this.tests.rowsSince(startOfLocalDay(now, this.tz, 7).toISOString());
    const byLoc = new Map<string, typeof rows>();
    for (const r of rows) byLoc.set(r.location_name, [...(byLoc.get(r.location_name) ?? []), r]);
    const locationSentences: Array<{ location: string; sentence: string; startHour: number; endHour: number; days: number }> = [];
    for (const [name, list] of byLoc) {
      const samples = list.map((r) => ({
        dayIndex: localDayIndex(r.tested_at, now, this.tz),
        hour: localParts(r.tested_at, this.tz).hour,
        score: r.health_score,
        download: r.download_speed,
        ping: r.ping,
        loss: r.packet_loss,
      }));
      for (const w of findRecurringPoorWindows(name, samples)) locationSentences.push({ location: name, ...w });
    }
    const locs = await this.locations.all();
    const poor = locs.filter((l) => l.current_status === 'poor' || l.current_status === 'critical');
    const scored = locs.filter((l) => l.current_score != null).sort((a, b) => a.current_score! - b.current_score!);
    const complaints = await this.repo.complaintsSince(startOfLocalDay(now, this.tz, 7).toISOString());
    const todayStart = startOfLocalDay(now, this.tz).toISOString();
    const today = complaints.filter((c) => c.created_at >= todayStart).length;
    const campus = campusSentences({
      poorLocations: poor.map((l) => l.location_name),
      worst: scored[0] ? { name: scored[0].location_name, score: scored[0].current_score!, status: STATUS_LABELS[scored[0].current_status] } : null,
      activeOutages: (await this.outages.active()).map((o) => o.message),
      complaintsToday: today,
      complaintsDailyAvg7d: (complaints.length - today) / 7,
    });
    const template = [...locationSentences.map((s) => s.sentence), ...campus];
    let text = template.join(' ');
    let reworded = false;
    if (this.llm.enabled) {
      const out = await this.llm.rewrite(text);
      reworded = out !== text;
      text = out;
    }
    return { generated_at: now.toISOString(), locationSentences, campusSentences: campus, sentences: template, text, reworded };
  }
}

const round = (x: number) => Math.round(x * 10) / 10;
