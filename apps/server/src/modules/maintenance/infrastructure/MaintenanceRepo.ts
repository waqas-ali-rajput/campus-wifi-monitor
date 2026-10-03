import type { MaintenanceDTO } from '@campus/shared';
import type { CompatDb } from '../../../infrastructure/db/compat';

const SELECT = `SELECT m.*, l.location_name, u.name AS created_by_name FROM maintenance_windows m
  LEFT JOIN locations l ON l.location_id = m.location_id
  LEFT JOIN users u ON u.user_id = m.created_by`;

export class MaintenanceRepo {
  constructor(private db: CompatDb) {}

  async insert(m: Omit<MaintenanceDTO, 'location_name' | 'created_by_name' | 'is_active'> & { announced: boolean; created_at: string }) {
    await this.db
      .prepare(
        `INSERT INTO maintenance_windows(maintenance_id, location_id, title, notes, starts_at, ends_at, created_by, announced, created_at)
         VALUES (@maintenance_id, @location_id, @title, @notes, @starts_at, @ends_at, @created_by, @announced, @created_at)`,
      )
      .run(m);
  }
  async byId(id: string): Promise<(MaintenanceDTO & { announced: number }) | undefined> {
    return (await this.db.prepare(`${SELECT} WHERE m.maintenance_id = ?`).get(id)) as any;
  }
  async update(id: string, patch: Record<string, unknown>) {
    const cols = Object.keys(patch);
    if (!cols.length) return;
    await this.db.prepare(`UPDATE maintenance_windows SET ${cols.map((c) => `${c} = @${c}`).join(', ')} WHERE maintenance_id = @__id`).run({ ...patch, __id: id });
  }
  async delete(id: string) {
    await this.db.prepare('DELETE FROM maintenance_windows WHERE maintenance_id = ?').run(id);
  }
  /** Windows that cover `at` for this location (or campus-wide). */
  async activeFor(locationId: string, at: string): Promise<MaintenanceDTO[]> {
    return (await this.db
      .prepare(`${SELECT} WHERE (m.location_id = ? OR m.location_id IS NULL) AND m.starts_at <= ? AND m.ends_at > ?`)
      .all(locationId, at, at)) as MaintenanceDTO[];
  }
  async activeAt(at: string): Promise<MaintenanceDTO[]> {
    return (await this.db.prepare(`${SELECT} WHERE m.starts_at <= ? AND m.ends_at > ?`).all(at, at)) as MaintenanceDTO[];
  }
  /** Upcoming + active + recently ended (for history). */
  async list(now: string, pastSince: string, locationId?: string): Promise<MaintenanceDTO[]> {
    const extra = locationId ? 'AND (m.location_id = @loc OR m.location_id IS NULL)' : '';
    return (
      (await this.db
        .prepare(`${SELECT} WHERE m.ends_at >= @past ${extra} ORDER BY m.starts_at`)
        .all({ past: pastSince, loc: locationId })) as MaintenanceDTO[]
    ).map((m) => ({ ...m, is_active: m.starts_at <= now && m.ends_at > now }));
  }
  async unannounced(): Promise<Array<MaintenanceDTO & { announced: number }>> {
    return (await this.db.prepare(`${SELECT} WHERE m.announced = FALSE`).all()) as any;
  }
  async endedBetween(from: string, to: string): Promise<MaintenanceDTO[]> {
    return (await this.db.prepare(`${SELECT} WHERE m.ends_at > ? AND m.ends_at <= ?`).all(from, to)) as MaintenanceDTO[];
  }
}