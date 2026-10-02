import type { MaintenanceDTO } from '@campus/shared';
import type { Db } from '../../../infrastructure/db/connection';

const SELECT = `SELECT m.*, l.location_name, u.name AS created_by_name FROM maintenance_windows m
  LEFT JOIN locations l ON l.location_id = m.location_id
  LEFT JOIN users u ON u.user_id = m.created_by`;

export class MaintenanceRepo {
  constructor(private db: Db) {}

  insert(m: Omit<MaintenanceDTO, 'location_name' | 'created_by_name' | 'is_active'> & { announced: number; created_at: string }) {
    this.db
      .prepare(
        `INSERT INTO maintenance_windows(maintenance_id, location_id, title, notes, starts_at, ends_at, created_by, announced, created_at)
         VALUES (@maintenance_id, @location_id, @title, @notes, @starts_at, @ends_at, @created_by, @announced, @created_at)`,
      )
      .run(m);
  }
  byId(id: string): (MaintenanceDTO & { announced: number }) | undefined {
    return this.db.prepare(`${SELECT} WHERE m.maintenance_id = ?`).get(id) as any;
  }
  update(id: string, patch: Record<string, unknown>) {
    const cols = Object.keys(patch);
    if (!cols.length) return;
    this.db.prepare(`UPDATE maintenance_windows SET ${cols.map((c) => `${c} = @${c}`).join(', ')} WHERE maintenance_id = @__id`).run({ ...patch, __id: id });
  }
  delete(id: string) {
    this.db.prepare('DELETE FROM maintenance_windows WHERE maintenance_id = ?').run(id);
  }
  /** Windows that cover `at` for this location (or campus-wide). */
  activeFor(locationId: string, at: string): MaintenanceDTO[] {
    return this.db
      .prepare(`${SELECT} WHERE (m.location_id = ? OR m.location_id IS NULL) AND m.starts_at <= ? AND m.ends_at > ?`)
      .all(locationId, at, at) as MaintenanceDTO[];
  }
  activeAt(at: string): MaintenanceDTO[] {
    return this.db.prepare(`${SELECT} WHERE m.starts_at <= ? AND m.ends_at > ?`).all(at, at) as MaintenanceDTO[];
  }
  /** Upcoming + active + recently ended (for history). */
  list(now: string, pastSince: string, locationId?: string): MaintenanceDTO[] {
    const extra = locationId ? 'AND (m.location_id = @loc OR m.location_id IS NULL)' : '';
    return (
      this.db
        .prepare(`${SELECT} WHERE m.ends_at >= @past ${extra} ORDER BY m.starts_at`)
        .all({ past: pastSince, loc: locationId }) as MaintenanceDTO[]
    ).map((m) => ({ ...m, is_active: m.starts_at <= now && m.ends_at > now }));
  }
  unannounced(): Array<MaintenanceDTO & { announced: number }> {
    return this.db.prepare(`${SELECT} WHERE m.announced = 0`).all() as any;
  }
  endedBetween(from: string, to: string): MaintenanceDTO[] {
    return this.db.prepare(`${SELECT} WHERE m.ends_at > ? AND m.ends_at <= ?`).all(from, to) as MaintenanceDTO[];
  }
}
