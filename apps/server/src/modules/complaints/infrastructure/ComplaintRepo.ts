import type { ComplaintDTO, ComplaintEventDTO } from '@campus/shared';
import type { CompatDb } from '../../../infrastructure/db/compat';

export interface ComplaintFilters {
  location_id?: string;
  building?: string;
  complaint_type?: string;
  status?: string;
  network_status?: string;
  assigned_staff?: string;
  user_id?: string;
  from?: string;
  to?: string;
  q?: string;
  page: number;
  pageSize: number;
}

const SELECT = `SELECT c.*, l.location_name, l.building, l.current_status AS location_status,
  u.name AS user_name, s.name AS assigned_name
  FROM complaints c JOIN locations l ON l.location_id = c.location_id
  JOIN users u ON u.user_id = c.user_id LEFT JOIN users s ON s.user_id = c.assigned_staff`;

export class ComplaintRepo {
  constructor(private db: CompatDb) {}

  async insert(c: Omit<ComplaintDTO, 'user_name' | 'location_name' | 'building' | 'assigned_name' | 'location_status'> & { is_seed: boolean }) {
    await this.db
      .prepare(
        `INSERT INTO complaints(complaint_id, user_id, location_id, complaint_type, description, related_test_id, status, assigned_staff,
           ai_category, ai_confidence, is_seed, created_at, updated_at, resolved_at)
         VALUES (@complaint_id, @user_id, @location_id, @complaint_type, @description, @related_test_id, @status, @assigned_staff,
           @ai_category, @ai_confidence, @is_seed, @created_at, @updated_at, @resolved_at)`,
      )
      .run(c);
  }

  async byId(id: string): Promise<ComplaintDTO | undefined> {
    return (await this.db.prepare(`${SELECT} WHERE c.complaint_id = ?`).get(id)) as ComplaintDTO | undefined;
  }

  async update(id: string, patch: Record<string, unknown>) {
    const cols = Object.keys(patch);
    await this.db.prepare(`UPDATE complaints SET ${cols.map((c) => `${c} = @${c}`).join(', ')} WHERE complaint_id = @__id`).run({ ...patch, __id: id });
  }

  async addEvent(e: Omit<ComplaintEventDTO, 'actor_name'>) {
    await this.db
      .prepare(
        `INSERT INTO complaint_events(event_id, complaint_id, actor_id, kind, from_status, to_status, note, created_at)
         VALUES (@event_id, @complaint_id, @actor_id, @kind, @from_status, @to_status, @note, @created_at)`,
      )
      .run(e);
  }

  async events(complaintId: string): Promise<ComplaintEventDTO[]> {
    // `rowid` ordered same-created_at events in SQLite; `seq` is its stable equivalent.
    return (await this.db
      .prepare(
        `SELECT e.event_id, e.complaint_id, e.actor_id, e.kind, e.from_status, e.to_status, e.note, e.created_at,
           u.name AS actor_name, u.role AS actor_role
         FROM complaint_events e JOIN users u ON u.user_id = e.actor_id
         WHERE e.complaint_id = ? ORDER BY e.created_at, e.seq`,
      )
      .all(complaintId)) as ComplaintEventDTO[];
  }

  async list(f: ComplaintFilters) {
    const where: string[] = [];
    const p: Record<string, unknown> = {};
    if (f.location_id) (where.push('c.location_id = @location_id'), (p.location_id = f.location_id));
    if (f.building) (where.push('l.building = @building'), (p.building = f.building));
    if (f.complaint_type) (where.push('c.complaint_type = @complaint_type'), (p.complaint_type = f.complaint_type));
    if (f.status === 'open') where.push(`c.status <> 'resolved'`);
    else if (f.status) (where.push('c.status = @status'), (p.status = f.status));
    if (f.network_status) (where.push('l.current_status = @network_status'), (p.network_status = f.network_status));
    if (f.assigned_staff === 'unassigned') where.push('c.assigned_staff IS NULL');
    else if (f.assigned_staff) (where.push('c.assigned_staff = @assigned_staff'), (p.assigned_staff = f.assigned_staff));
    if (f.user_id) (where.push('c.user_id = @user_id'), (p.user_id = f.user_id));
    if (f.from) (where.push('c.created_at >= @from'), (p.from = f.from));
    if (f.to) (where.push('c.created_at <= @to'), (p.to = f.to));
    // SQLite LIKE is case-insensitive for ASCII; ILIKE preserves that in Postgres.
    if (f.q) (where.push('(c.description ILIKE @q OR l.location_name ILIKE @q OR u.name ILIKE @q)'), (p.q = `%${f.q}%`));
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (
      (await this.db
        .prepare(
          `SELECT COUNT(*)::int AS n FROM complaints c JOIN locations l ON l.location_id = c.location_id JOIN users u ON u.user_id = c.user_id ${w}`,
        )
        .get(p)) as any
    ).n;
    const items = (await this.db
      .prepare(`${SELECT} ${w} ORDER BY c.created_at DESC, c.complaint_id DESC LIMIT @limit OFFSET @offset`)
      .all({ ...p, limit: f.pageSize, offset: (f.page - 1) * f.pageSize })) as ComplaintDTO[];
    return { items, page: f.page, pageSize: f.pageSize, total };
  }
}