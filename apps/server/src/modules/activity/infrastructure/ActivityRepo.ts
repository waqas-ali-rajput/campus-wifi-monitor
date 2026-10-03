import type { CompatDb } from '../../../infrastructure/db/compat';
import { newId } from '../../../shared/ports';

export class ActivityRepo {
  constructor(private db: CompatDb) {}

  async log(actorId: string | null, action: string, entityType: string, entityId: string | null, meta: unknown, at: string) {
    await this.db
      .prepare(
        `INSERT INTO activity_logs(log_id, actor_id, action, entity_type, entity_id, meta_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(newId(), actorId, action, entityType, entityId, JSON.stringify(meta ?? {}), at);
  }

  async list(f: { actor_id?: string; entity_type?: string; from?: string; to?: string; page: number; pageSize: number }) {
    const where: string[] = [];
    const p: unknown[] = [];
    if (f.actor_id) (where.push('a.actor_id = ?'), p.push(f.actor_id));
    if (f.entity_type) (where.push('a.entity_type = ?'), p.push(f.entity_type));
    if (f.from) (where.push('a.created_at >= ?'), p.push(f.from));
    if (f.to) (where.push('a.created_at <= ?'), p.push(f.to));
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = ((await this.db.prepare(`SELECT COUNT(*)::int AS n FROM activity_logs a ${w}`).get(...p)) as any).n;
    const items = await this.db
      .prepare(
        `SELECT a.*, u.name AS actor_name, u.role AS actor_role FROM activity_logs a
         LEFT JOIN users u ON u.user_id = a.actor_id ${w}
         ORDER BY a.created_at DESC, a.log_id DESC LIMIT ? OFFSET ?`,
      )
      .all(...p, f.pageSize, (f.page - 1) * f.pageSize);
    return { items, page: f.page, pageSize: f.pageSize, total };
  }
}