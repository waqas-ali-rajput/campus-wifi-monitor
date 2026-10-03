import {
  COMPLAINT_TYPE_LABELS,
  evaluateOutageRules,
  outageMessage,
  shouldAutoResolve,
  type OutageDTO,
  type Role,
} from '@campus/shared';
import { AppError, notFound } from '../../../shared/errors';
import { newId, type EventPublisher } from '../../../shared/ports';
import { hoursAgo, minutesAgo, type Clock } from '../../../shared/time';
import type { OutageRepo } from '../infrastructure/OutageRepo';
import type { LocationRepo } from '../../locations/infrastructure/LocationRepo';
import type { MaintenanceRepo } from '../../maintenance/infrastructure/MaintenanceRepo';
import type { SettingsService } from '../../settings/application/SettingsService';
import type { Notifier } from '../../notifications/application/Notifier';
import type { ActivityRepo } from '../../activity/infrastructure/ActivityRepo';

export class OutageService {
  constructor(
    private repo: OutageRepo,
    private locations: LocationRepo,
    private maintenance: MaintenanceRepo,
    private settings: SettingsService,
    private notifier: Notifier,
    private activity: ActivityRepo,
    private events: EventPublisher,
    private clock: Clock,
  ) {}

  /** Rules R1–R3 + auto-recovery for one location (§5.3). Returns the newly opened outage, if any. */
  async evaluate(locationId: string): Promise<{ opened?: OutageDTO; resolved?: OutageDTO }> {
    const loc = await this.locations.byId(locationId);
    if (!loc || !loc.is_active) return {};
    const now = this.clock.now();
    const cfg = await this.settings.outage();
    const maxWin = Math.max(cfg.r1.windowMinutes, cfg.r2.windowMinutes);
    // Evidence from before the last resolved outage never reopens it.
    const lastResolved = await this.repo.lastResolvedAt(locationId);
    const fresh = (iso: string) => iso > lastResolved;
    const fired = evaluateOutageRules(
      {
        complaints: (await this.repo.complaintSignals(locationId, minutesAgo(now, maxWin))).filter((x) => fresh(x.createdAt)),
        failures: (await this.repo.failureSignals(locationId, minutesAgo(now, maxWin))).filter((x) => fresh(x.occurredAt)),
        latestStatuses: await this.repo.latestStatuses(locationId, cfg.r3.consecutiveCritical, lastResolved),
      },
      now,
      cfg,
    );
    const active = await this.repo.activeFor(locationId);

    if (!active && fired) {
      if ((await this.maintenance.activeFor(locationId, now.toISOString())).length) return {};
      const where = loc.building || loc.location_name;
      const explanation =
        fired.rule === 'R1' && fired.category
          ? `${fired.explanation.split(' ')[0]} users reported ${COMPLAINT_TYPE_LABELS[fired.category]} in ${where} in ${cfg.r1.windowMinutes} minutes`
          : fired.explanation;
      const id = newId();
      await this.repo.insert({
        outage_id: id,
        location_id: locationId,
        cause_rule: fired.rule,
        message: outageMessage(loc.building, loc.location_name),
        complaint_count: fired.complaintCount,
        failure_count: fired.failureCount,
        explanation,
        category: fired.category ?? null,
        detected_at: now.toISOString(),
      });
      const o = (await this.repo.byId(id))!;
      await this.activity.log(null, 'outage.detected', 'outage', id, { rule: fired.rule, location: loc.location_name }, now.toISOString());
      await this.notifier.notify({
        type: 'outage_detected',
        title: o.message,
        body: `${loc.location_name}: ${explanation}.`,
        entityType: 'outage',
        entityId: id,
        recipients: [
          ...(await this.notifier.usersWithRoles('it_staff', 'manager', 'admin')),
          ...(await this.repo.affectedUsers(locationId, hoursAgo(now, 24))),
        ],
      });
      this.events.publish('outage.opened', { outage_id: id, location_id: locationId, message: o.message });
      this.events.publish('dashboard.updated', { location_id: locationId });
      return { opened: o };
    }

    if (active) {
      // Recovery: ≥ N consecutive good tests since detection, and no rule firing on evidence that arrived
      // after that good streak began (the reports that opened the outage don't keep it open forever).
      const tests = await this.repo.scoresSince(locationId, active.detected_at);
      const n = cfg.recovery.consecutiveGood;
      const streakStart = tests.length >= n ? tests[n - 1]!.at : now.toISOString();
      const after = (iso: string) => iso >= streakStart;
      const stillFiring = evaluateOutageRules(
        {
          complaints: (await this.repo.complaintSignals(locationId, minutesAgo(now, maxWin))).filter((x) => after(x.createdAt)),
          failures: (await this.repo.failureSignals(locationId, minutesAgo(now, maxWin))).filter((x) => after(x.occurredAt)),
          latestStatuses: await this.repo.latestStatuses(locationId, cfg.r3.consecutiveCritical),
        },
        now,
        cfg,
      );
      const scores = tests.map((t) => t.score);
      if (shouldAutoResolve(scores, !!stillFiring, cfg)) {
        await this.resolveInternal(active, null);
        return { resolved: await this.repo.byId(active.outage_id) };
      }
    }
    return {};
  }

  async evaluateAll() {
    for (const l of await this.locations.all()) await this.evaluate(l.location_id);
  }

  private async resolveInternal(o: OutageDTO, by: string | null) {
    const now = this.clock.now();
    await this.repo.resolve(o.outage_id, now.toISOString(), by);
    await this.activity.log(by, by ? 'outage.resolve' : 'outage.auto_resolve', 'outage', o.outage_id, { location: o.location_name }, now.toISOString());
    await this.notifier.notify({
      type: 'network_recovered',
      title: `Network returns to normal at ${o.location_name}`,
      body: by ? 'The outage was resolved by IT support.' : 'Recent speed tests are healthy again.',
      entityType: 'outage',
      entityId: o.outage_id,
      recipients: [
        ...(await this.notifier.usersWithRoles('it_staff', 'manager', 'admin')),
        ...(await this.repo.affectedUsers(o.location_id, hoursAgo(now, 24))),
      ],
    });
    this.events.publish('outage.resolved', { outage_id: o.outage_id, location_id: o.location_id, message: o.message });
    this.events.publish('dashboard.updated', { location_id: o.location_id });
  }

  async resolveManually(id: string, actorId: string) {
    const o = await this.repo.byId(id);
    if (!o) throw notFound('Outage');
    if (o.status !== 'active') throw new AppError('CONFLICT', 'This outage is already resolved.');
    await this.resolveInternal(o, actorId);
    return (await this.repo.byId(id))!;
  }

  async list(status: 'active' | 'resolved' | undefined, role: Role) {
    const rows = await this.repo.list(status);
    if (role !== 'user') return rows;
    // users get public fields only
    return rows.map((o) => ({
      outage_id: o.outage_id,
      location_id: o.location_id,
      location_name: o.location_name,
      building: o.building,
      status: o.status,
      message: o.message,
      detected_at: o.detected_at,
      resolved_at: o.resolved_at,
    }));
  }
}