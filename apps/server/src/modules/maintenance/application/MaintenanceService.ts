import type { MaintenanceInput, Role } from '@campus/shared';
import { forbidden, invalid, notFound } from '../../../shared/errors';
import { newId, type EventPublisher } from '../../../shared/ports';
import { daysAgo, type Clock } from '../../../shared/time';
import type { MaintenanceRepo } from '../infrastructure/MaintenanceRepo';
import type { ActivityRepo } from '../../activity/infrastructure/ActivityRepo';
import type { Notifier } from '../../notifications/application/Notifier';
import type { LocationRepo } from '../../locations/infrastructure/LocationRepo';

export class MaintenanceService {
  constructor(
    private repo: MaintenanceRepo,
    private locations: LocationRepo,
    private activity: ActivityRepo,
    private notifier: Notifier,
    private events: EventPublisher,
    private clock: Clock,
  ) {}

  list(locationId?: string) {
    const now = this.clock.now();
    return this.repo.list(now.toISOString(), daysAgo(now, 7), locationId);
  }

  isUnderMaintenance(locationId: string, at = this.clock.now().toISOString()) {
    return this.repo.activeFor(locationId, at).length > 0;
  }

  create(input: MaintenanceInput, actorId: string) {
    if (input.location_id && !this.locations.byId(input.location_id)) throw invalid('Unknown location', 'location_id');
    const now = this.clock.now().toISOString();
    const id = newId();
    this.repo.insert({
      maintenance_id: id,
      location_id: input.location_id ?? null,
      title: input.title,
      notes: input.notes ?? '',
      starts_at: new Date(input.starts_at).toISOString(),
      ends_at: new Date(input.ends_at).toISOString(),
      created_by: actorId,
      announced: 0,
      created_at: now,
    });
    this.activity.log(actorId, 'maintenance.create', 'maintenance', id, input, now);
    this.announce(id);
    this.events.publish('dashboard.updated', { location_id: input.location_id ?? null });
    return this.repo.byId(id)!;
  }

  /** Sends "Maintenance scheduled" to all active users once. */
  announce(id: string) {
    const m = this.repo.byId(id);
    if (!m || m.announced) return;
    const where = m.location_name ?? 'the whole campus';
    const fmt = (s: string) => new Date(s).toISOString();
    this.notifier.notify({
      type: 'maintenance_scheduled',
      title: `Maintenance scheduled: ${m.title}`,
      body: `${where}: ${fmt(m.starts_at)} → ${fmt(m.ends_at)}${m.notes ? `. ${m.notes}` : ''}`,
      entityType: 'maintenance',
      entityId: m.maintenance_id,
      recipients: this.notifier.allActiveUsers(),
    });
    this.repo.update(id, { announced: 1 });
  }

  announcePending() {
    for (const m of this.repo.unannounced()) this.announce(m.maintenance_id);
  }

  private assertCanEdit(id: string, actorId: string, role: Role) {
    const m = this.repo.byId(id);
    if (!m) throw notFound('Maintenance window');
    if (m.created_by !== actorId && role !== 'manager' && role !== 'admin')
      throw forbidden('Only the creator, a manager or an admin can change this maintenance window.');
    return m;
  }

  update(id: string, patch: Partial<MaintenanceInput>, actorId: string, role: Role) {
    this.assertCanEdit(id, actorId, role);
    const clean: Record<string, unknown> = {};
    for (const k of ['location_id', 'title', 'notes', 'starts_at', 'ends_at'] as const)
      if (patch[k] !== undefined) clean[k] = k.endsWith('_at') ? new Date(patch[k] as string).toISOString() : patch[k];
    this.repo.update(id, clean);
    const m = this.repo.byId(id)!;
    if (m.ends_at <= m.starts_at) throw invalid('End must be after start', 'ends_at');
    this.activity.log(actorId, 'maintenance.update', 'maintenance', id, clean, this.clock.now().toISOString());
    this.events.publish('dashboard.updated', { location_id: m.location_id });
    return m;
  }

  remove(id: string, actorId: string, role: Role) {
    const m = this.assertCanEdit(id, actorId, role);
    this.repo.delete(id);
    this.activity.log(actorId, 'maintenance.delete', 'maintenance', id, { title: m.title }, this.clock.now().toISOString());
    this.events.publish('dashboard.updated', { location_id: m.location_id });
  }
}
