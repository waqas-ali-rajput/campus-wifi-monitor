import {
  computeHealth,
  type FailureReason,
  type OutageDTO,
  type Role,
  type SpeedTestDTO,
  type SubmitTestInput,
} from '@campus/shared';
import { forbidden, notFound } from '../../../shared/errors';
import { newId, type EventPublisher } from '../../../shared/ports';
import { hoursAgo, type Clock } from '../../../shared/time';
import type { TestFilters, TestRepo } from '../infrastructure/TestRepo';
import type { LocationRepo } from '../../locations/infrastructure/LocationRepo';
import type { LocationService } from '../../locations/application/LocationService';
import type { SettingsService } from '../../settings/application/SettingsService';
import type { OutageService } from '../../outages/application/OutageService';
import type { MaintenanceService } from '../../maintenance/application/MaintenanceService';
import type { InsightsService } from '../../insights/application/InsightsService';

export interface Transactor {
  tx<T>(fn: () => T): T;
}

/**
 * SubmitSpeedTest pipeline (§8.2): validate → score (server-authoritative) → store → location status →
 * outage rules → insights → push dashboard update.
 */
export class TestService {
  constructor(
    private repo: TestRepo,
    private locationRepo: LocationRepo,
    private locations: LocationService,
    private settings: SettingsService,
    private outages: OutageService,
    private maintenance: MaintenanceService,
    private insights: InsightsService,
    private events: EventPublisher,
    private db: Transactor,
    private clock: Clock,
  ) {}

  submit(userId: string, input: SubmitTestInput, opts: { isSeed?: boolean } = {}) {
    const loc = this.locations.requireActive(input.location_id);
    const now = this.clock.now();
    const cfg = this.settings.health();
    const pSince = hoursAgo(now, cfg.penalty.windowHours);

    const result = this.db.tx(() => {
      const health = computeHealth(
        { downloadMbps: input.download_mbps, uploadMbps: input.upload_mbps, pingMs: input.ping_ms, lossPct: input.packet_loss_pct },
        {
          recentFailures: this.locationRepo.countFailures(loc.location_id, pSince),
          recentOpenComplaints: this.locationRepo.countOpenComplaints(loc.location_id, pSince),
        },
        cfg,
      );
      const test_id = newId();
      this.repo.insert({
        test_id,
        user_id: userId,
        location_id: loc.location_id,
        download_speed: round2(input.download_mbps),
        upload_speed: round2(input.upload_mbps),
        ping: round2(input.ping_ms),
        jitter: round2(input.jitter_ms ?? 0),
        packet_loss: Math.round((input.packet_loss_pct ?? 0) * 10) / 10,
        base_score: health.baseScore,
        health_score: health.healthScore,
        health_status: health.status,
        during_maintenance: this.maintenance.isUnderMaintenance(loc.location_id, now.toISOString()) ? 1 : 0,
        is_seed: opts.isSeed ? 1 : 0,
        client_meta: JSON.stringify(input.client_meta ?? {}),
        tested_at: now.toISOString(),
      });
      const status = this.locations.refreshStatus(loc.location_id);
      const outage = this.outages.evaluate(loc.location_id);
      const test = this.repo.byId(test_id)!;
      const insights = this.insights.onNewTest(test);
      return { test, status, outage, insights, health };
    });

    this.events.publish('dashboard.updated', { location_id: loc.location_id, test_id: result.test.test_id });
    return {
      ...result.test,
      sub_scores: result.health.sub,
      penalty: result.health.penalty,
      location_status: result.status.status,
      location_score: result.status.score,
      new_outage: (result.outage.opened as OutageDTO | undefined) ?? null,
      new_insights: result.insights,
    };
  }

  recordFailure(userId: string, input: { location_id: string; reason: FailureReason; detail?: string }) {
    const loc = this.locations.requireActive(input.location_id);
    const now = this.clock.now().toISOString();
    const failure_id = newId();
    const out = this.db.tx(() => {
      this.repo.insertFailure({ failure_id, user_id: userId, location_id: loc.location_id, reason: input.reason, detail: input.detail ?? '', occurred_at: now });
      this.locations.refreshStatus(loc.location_id);
      return this.outages.evaluate(loc.location_id);
    });
    this.events.publish('dashboard.updated', { location_id: loc.location_id });
    return { failure_id, recorded: true, new_outage: out.opened ?? null };
  }

  list(actor: { user_id: string; role: Role }, f: TestFilters) {
    if (actor.role === 'user') f = { ...f, user_id: actor.user_id };
    return this.repo.list(f);
  }

  get(actor: { user_id: string; role: Role }, id: string): SpeedTestDTO {
    const t = this.repo.byId(id);
    if (!t) throw notFound('Speed test');
    if (actor.role === 'user' && t.user_id !== actor.user_id) throw forbidden();
    return t;
  }
}

const round2 = (x: number) => Math.round(x * 100) / 100;
