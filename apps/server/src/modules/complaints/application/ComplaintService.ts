import {
  COMPLAINT_STATUS_LABELS,
  COMPLAINT_TYPE_LABELS,
  canTransition,
  classifyComplaint,
  nextStatuses,
  type ComplaintCreateInput,
  type ComplaintStatus,
  type Role,
} from '@campus/shared';
import { AppError, forbidden, invalid, notFound } from '../../../shared/errors';
import { newId, type EventPublisher } from '../../../shared/ports';
import { hoursAgo, type Clock } from '../../../shared/time';
import type { ComplaintFilters, ComplaintRepo } from '../infrastructure/ComplaintRepo';
import type { TestRepo } from '../../tests/infrastructure/TestRepo';
import type { UserRepo } from '../../users/infrastructure/UserRepo';
import type { LocationService } from '../../locations/application/LocationService';
import type { OutageService } from '../../outages/application/OutageService';
import type { Notifier } from '../../notifications/application/Notifier';
import type { ActivityRepo } from '../../activity/infrastructure/ActivityRepo';
import type { Transactor } from '../../tests/application/TestService';

interface Actor {
  user_id: string;
  role: Role;
  name?: string;
}

export class ComplaintService {
  constructor(
    private repo: ComplaintRepo,
    private tests: TestRepo,
    private users: UserRepo,
    private locations: LocationService,
    private outages: OutageService,
    private notifier: Notifier,
    private activity: ActivityRepo,
    private events: EventPublisher,
    private db: Transactor,
    private clock: Clock,
  ) {}

  classify(description: string) {
    return classifyComplaint(description);
  }

  create(actor: Actor, input: ComplaintCreateInput, opts: { isSeed?: boolean } = {}) {
    const loc = this.locations.requireActive(input.location_id);
    const now = this.clock.now();
    if (input.related_test_id) {
      const t = this.tests.byId(input.related_test_id);
      if (!t || t.user_id !== actor.user_id || t.location_id !== input.location_id || Date.parse(t.tested_at) < now.getTime() - 24 * 3600000)
        throw invalid('The attached test must be your own test at this location from the last 24 hours.', 'related_test_id');
    }
    const ai = classifyComplaint(input.description);
    const complaint_id = newId();
    const at = now.toISOString();
    const out = this.db.tx(() => {
      this.repo.insert({
        complaint_id,
        user_id: actor.user_id,
        location_id: loc.location_id,
        complaint_type: input.complaint_type,
        description: input.description,
        related_test_id: input.related_test_id ?? null,
        status: 'submitted',
        assigned_staff: null,
        ai_category: ai.category,
        ai_confidence: ai.confidence,
        is_seed: opts.isSeed ? 1 : 0,
        created_at: at,
        updated_at: at,
        resolved_at: null,
      });
      this.repo.addEvent({ event_id: newId(), complaint_id, actor_id: actor.user_id, kind: 'created', from_status: null, to_status: 'submitted', note: '', created_at: at });
      this.activity.log(actor.user_id, 'complaint.create', 'complaint', complaint_id, { type: input.complaint_type, location: loc.location_name }, at);
      this.notifier.notify({
        type: 'complaint_submitted',
        title: `New complaint: ${COMPLAINT_TYPE_LABELS[input.complaint_type]} at ${loc.location_name}`,
        body: input.description.slice(0, 140),
        entityType: 'complaint',
        entityId: complaint_id,
        recipients: this.notifier.usersWithRoles('it_staff', 'manager'),
      });
      this.locations.refreshStatus(loc.location_id);
      return this.outages.evaluate(loc.location_id);
    });
    this.events.publish('complaint.updated', { complaint_id, status: 'submitted' }, { roles: ['it_staff', 'manager', 'admin'], userIds: [actor.user_id] });
    this.events.publish('dashboard.updated', { location_id: loc.location_id });
    return { ...this.repo.byId(complaint_id)!, ai: { category: ai.category, confidence: ai.confidence }, new_outage: out.opened ?? null };
  }

  list(actor: Actor, f: ComplaintFilters & { mine?: boolean }) {
    if (actor.role === 'user' || f.mine) f = { ...f, user_id: actor.user_id };
    return this.repo.list(f);
  }

  detail(actor: Actor, id: string) {
    const c = this.repo.byId(id);
    if (!c) throw notFound('Complaint');
    if (actor.role === 'user' && c.user_id !== actor.user_id) throw forbidden();
    return {
      ...c,
      related_test: c.related_test_id ? this.tests.byId(c.related_test_id) ?? null : null,
      events: this.repo.events(id),
      allowed_next: nextStatuses(c.status, actor.role, c.assigned_staff === actor.user_id),
      staff: actor.role === 'user' ? [] : this.users.staff(),
    };
  }

  transition(actor: Actor, id: string, input: { to: ComplaintStatus; assigned_staff?: string; note?: string }) {
    const c = this.repo.byId(id);
    if (!c) throw notFound('Complaint');
    const assigneeAfter = input.to === 'assigned' ? input.assigned_staff : c.assigned_staff;
    const check = canTransition(c.status, input.to, actor.role, c.assigned_staff === actor.user_id, {
      assignedStaffProvided: !!input.assigned_staff,
    });
    if (!check.ok) throw new AppError(check.code, check.message);
    let staffName: string | undefined;
    if (input.to === 'assigned') {
      const s = this.users.byId(input.assigned_staff!);
      if (!s || s.role !== 'it_staff' || s.account_status !== 'active') throw invalid('Assign an active IT staff member.', 'assigned_staff');
      staffName = s.name;
    }
    const at = this.clock.now().toISOString();
    this.db.tx(() => {
      const patch: Record<string, unknown> = { status: input.to, updated_at: at };
      if (input.to === 'assigned') patch.assigned_staff = assigneeAfter;
      if (input.to === 'resolved') patch.resolved_at = at;
      this.repo.update(id, patch);
      this.repo.addEvent({
        event_id: newId(),
        complaint_id: id,
        actor_id: actor.user_id,
        kind: input.to === 'assigned' ? 'assignment' : 'status_change',
        from_status: c.status,
        to_status: input.to,
        note: input.note ?? (staffName ? `Assigned to ${staffName}` : ''),
        created_at: at,
      });
      this.activity.log(actor.user_id, `complaint.${input.to}`, 'complaint', id, { from: c.status, to: input.to, assigned_staff: assigneeAfter, note: input.note }, at);
      if (input.to === 'assigned') {
        this.notifier.notify({
          type: 'complaint_assigned',
          title: `Complaint assigned to ${staffName}`,
          body: `${COMPLAINT_TYPE_LABELS[c.complaint_type]} at ${c.location_name}`,
          entityType: 'complaint',
          entityId: id,
          recipients: [assigneeAfter!, c.user_id],
        });
      }
      if (input.to === 'resolved') {
        this.notifier.notify({
          type: 'complaint_resolved',
          title: `Your complaint at ${c.location_name} was resolved`,
          body: input.note || `${COMPLAINT_TYPE_LABELS[c.complaint_type]} — marked ${COMPLAINT_STATUS_LABELS.resolved}.`,
          entityType: 'complaint',
          entityId: id,
          recipients: [c.user_id],
        });
        this.locations.refreshStatus(c.location_id);
      }
    });
    this.events.publish('complaint.updated', { complaint_id: id, status: input.to }, { roles: ['it_staff', 'manager', 'admin'], userIds: [c.user_id] });
    this.events.publish('dashboard.updated', { location_id: c.location_id });
    return this.detail(actor, id);
  }

  addNote(actor: Actor, id: string, note: string) {
    const c = this.repo.byId(id);
    if (!c) throw notFound('Complaint');
    const at = this.clock.now().toISOString();
    this.repo.addEvent({ event_id: newId(), complaint_id: id, actor_id: actor.user_id, kind: 'note', from_status: null, to_status: null, note, created_at: at });
    this.repo.update(id, { updated_at: at });
    this.activity.log(actor.user_id, 'complaint.note', 'complaint', id, { note }, at);
    this.events.publish('complaint.updated', { complaint_id: id, status: c.status }, { roles: ['it_staff', 'manager', 'admin'], userIds: [c.user_id] });
    return this.detail(actor, id);
  }

  /** The user's latest test at this location (≤ 24 h) for pre-selection in the form. */
  latestAttachable(userId: string, locationId: string) {
    return this.tests.latestForUserAtLocation(userId, locationId, hoursAgo(this.clock.now(), 24)) ?? null;
  }
}
