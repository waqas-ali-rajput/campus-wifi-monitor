import {
  computeLocationHealth,
  penaltyFor,
  STATUS_LABELS,
  type LocationCreateInput,
  type LocationDTO,
  type LocationStatus,
} from '@campus/shared';
import { AppError, notFound } from '../../../shared/errors';
import { newId, type EventPublisher } from '../../../shared/ports';
import { hoursAgo, startOfLocalDay, type Clock } from '../../../shared/time';
import type { LocationRepo, LocationRow } from '../infrastructure/LocationRepo';
import type { SettingsService } from '../../settings/application/SettingsService';
import type { ActivityRepo } from '../../activity/infrastructure/ActivityRepo';
import type { Notifier } from '../../notifications/application/Notifier';
import type { MaintenanceRepo } from '../../maintenance/infrastructure/MaintenanceRepo';
import type { OutageRepo } from '../../outages/infrastructure/OutageRepo';

const BAD: LocationStatus[] = ['poor', 'critical'];
const r1 = (x: number | null) => (x == null ? null : Math.round(x * 10) / 10);

export class LocationService {
  constructor(
    private repo: LocationRepo,
    private settings: SettingsService,
    private activity: ActivityRepo,
    private notifier: Notifier,
    private maintenance: MaintenanceRepo,
    private outages: OutageRepo,
    private events: EventPublisher,
    private clock: Clock,
    private tz: string,
  ) {}

  /** Recompute current_status/score/stale for one location; notify on degraded/recovered transitions. */
  refreshStatus(locationId: string): { status: LocationStatus; score: number | null; stale: boolean; changed: boolean } {
    const loc = this.repo.byId(locationId);
    if (!loc) throw notFound('Location');
    const now = this.clock.now();
    const cfg = this.settings.health();
    const pSince = hoursAgo(now, cfg.penalty.windowHours);
    const penalty = penaltyFor(this.repo.countFailures(locationId, pSince), this.repo.countOpenComplaints(locationId, pSince), cfg);
    const tests = this.repo.recentScores(locationId, hoursAgo(now, cfg.location.staleHours));
    const res = computeLocationHealth(tests, penalty, now, cfg);
    const changed = res.status !== loc.current_status || res.score !== loc.current_score || (res.stale ? 1 : 0) !== loc.current_stale;
    if (changed) this.repo.setStatus(locationId, res.status, res.score, res.stale);

    if (res.status !== loc.current_status) {
      const inMaint = this.maintenance.activeFor(locationId, now.toISOString()).length > 0;
      const wasBad = BAD.includes(loc.current_status);
      const isBad = BAD.includes(res.status);
      if (isBad && !wasBad && !inMaint) {
        this.notifier.notify({
          type: 'location_degraded',
          title: `${loc.location_name} is now ${STATUS_LABELS[res.status]}`,
          body: `Health score ${res.score ?? '–'} / 100.`,
          entityType: 'location',
          entityId: locationId,
          recipients: this.notifier.usersWithRoles('it_staff', 'manager'),
        });
      } else if (wasBad && !isBad && res.status !== 'unknown') {
        this.notifier.notify({
          type: 'network_recovered',
          title: `Network returns to normal at ${loc.location_name}`,
          body: `Status is now ${STATUS_LABELS[res.status]} (${res.score ?? '–'} / 100).`,
          entityType: 'location',
          entityId: locationId,
          recipients: this.notifier.usersWithRoles('it_staff', 'manager'),
        });
      }
    }
    return { status: res.status, score: res.score, stale: res.stale, changed };
  }

  refreshAll(): number {
    let changed = 0;
    for (const l of this.repo.all()) {
      const r = this.refreshStatus(l.location_id);
      if (r.changed) {
        changed++;
        this.events.publish('dashboard.updated', { location_id: l.location_id });
      }
    }
    return changed;
  }

  list(f: { building?: string; status?: string; q?: string } = {}): LocationDTO[] {
    const now = this.clock.now();
    const since = startOfLocalDay(now, this.tz).toISOString();
    const stats = new Map(this.repo.todayStats(since).map((s) => [s.location_id, s]));
    const latest = new Map(this.repo.latestTests().map((t: any) => [t.location_id, t]));
    const outages = new Set(this.outages.active().map((o) => o.location_id));
    const maint = this.maintenance.activeAt(now.toISOString());
    const campusMaint = maint.some((m) => !m.location_id);
    const maintLocs = new Set(maint.map((m) => m.location_id));
    const q = f.q?.toLowerCase();
    return this.repo
      .all()
      .filter((l) => !f.building || l.building === f.building)
      .filter((l) => !f.status || l.current_status === f.status)
      .filter((l) => !q || l.location_name.toLowerCase().includes(q) || l.building.toLowerCase().includes(q))
      .map((l) => this.toDTO(l, stats.get(l.location_id), latest.get(l.location_id) ?? null, outages.has(l.location_id), campusMaint || maintLocs.has(l.location_id)));
  }

  private toDTO(l: LocationRow, s: any, latest: any, outage: boolean, maint: boolean): LocationDTO {
    return {
      location_id: l.location_id,
      location_name: l.location_name,
      building: l.building,
      floor: l.floor,
      description: l.description,
      current_status: l.current_status,
      current_score: l.current_score,
      current_stale: l.current_stale,
      map_x: l.map_x,
      map_y: l.map_y,
      latitude: l.latitude,
      longitude: l.longitude,
      last_tested_at: s?.last_tested_at ?? null,
      today: {
        tests: s?.tests ?? 0,
        avg_download: r1(s?.avg_download ?? null),
        avg_upload: r1(s?.avg_upload ?? null),
        avg_ping: r1(s?.avg_ping ?? null),
        complaints: s?.complaints ?? 0,
      },
      latest,
      active_outage: outage,
      active_maintenance: maint,
    };
  }

  get(id: string): LocationDTO {
    const l = this.list().find((x) => x.location_id === id);
    if (!l) throw notFound('Location');
    return l;
  }

  create(input: LocationCreateInput, actorId: string): LocationRow {
    if (this.repo.byName(input.location_name)) throw new AppError('CONFLICT', 'A location with this name already exists.', { location_name: ['Name already used'] });
    const id = newId();
    const now = this.clock.now().toISOString();
    this.repo.insert({
      location_id: id,
      location_name: input.location_name,
      building: input.building,
      floor: input.floor ?? null,
      description: input.description ?? '',
      map_x: input.map_x,
      map_y: input.map_y,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      created_at: now,
    });
    this.activity.log(actorId, 'location.create', 'location', id, input, now);
    this.events.publish('dashboard.updated', { location_id: id });
    return this.repo.byId(id)!;
  }

  update(id: string, patch: Partial<LocationCreateInput>, actorId: string): LocationRow {
    const l = this.repo.byId(id);
    if (!l) throw notFound('Location');
    if (patch.location_name && patch.location_name !== l.location_name && this.repo.byName(patch.location_name))
      throw new AppError('CONFLICT', 'A location with this name already exists.');
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    this.repo.update(id, clean);
    this.activity.log(actorId, 'location.update', 'location', id, clean, this.clock.now().toISOString());
    this.events.publish('dashboard.updated', { location_id: id });
    return this.repo.byId(id)!;
  }

  remove(id: string, actorId: string) {
    const l = this.repo.byId(id);
    if (!l) throw notFound('Location');
    this.repo.update(id, { is_active: 0 });
    this.activity.log(actorId, 'location.delete', 'location', id, { name: l.location_name }, this.clock.now().toISOString());
    this.events.publish('dashboard.updated', { location_id: id });
  }

  requireActive(id: string): LocationRow {
    const l = this.repo.byId(id);
    if (!l || !l.is_active) throw new AppError('VALIDATION_ERROR', 'Choose an active campus location.', { location_id: ['Unknown location'] });
    return l;
  }
}
