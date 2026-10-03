import type { InsightDTO, InsightKind } from '@campus/shared';
import type { CompatDb } from '../../../infrastructure/db/compat';
import { newId } from '../../../shared/ports';

export class InsightRepo {
  constructor(private db: CompatDb) {}

  async activeOne(kind: InsightKind, locationId: string | null): Promise<InsightDTO | undefined> {
    return (await this.db
      .prepare(`SELECT * FROM insights WHERE is_active = TRUE AND kind = ? AND COALESCE(location_id,'*') = COALESCE(?, '*')`)
      .get(kind, locationId)) as InsightDTO | undefined;
  }

  /** Re-detecting the same kind for the same location updates the active row. Returns true when newly created. */
  async upsert(kind: InsightKind, locationId: string | null, severity: string, message: string, data: unknown, at: string): Promise<boolean> {
    const cur = await this.activeOne(kind, locationId);
    if (cur) {
      await this.db
        .prepare('UPDATE insights SET severity = ?, message = ?, data_json = ?, updated_at = ? WHERE insight_id = ?')
        .run(severity, message, JSON.stringify(data ?? {}), at, cur.insight_id);
      return false;
    }
    await this.db
      .prepare(
        `INSERT INTO insights(insight_id, kind, location_id, severity, message, data_json, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, TRUE, ?, ?)`,
      )
      .run(newId(), kind, locationId, severity, message, JSON.stringify(data ?? {}), at, at);
    return true;
  }

  async updateData(id: string, data: unknown, at: string) {
    await this.db.prepare('UPDATE insights SET data_json = ?, updated_at = ? WHERE insight_id = ?').run(JSON.stringify(data), at, id);
  }

  async deactivate(kind: InsightKind, locationId: string | null, at: string): Promise<boolean> {
    const { changes } = await this.db
      .prepare(`UPDATE insights SET is_active = FALSE, updated_at = ? WHERE is_active = TRUE AND kind = ? AND COALESCE(location_id,'*') = COALESCE(?, '*')`)
      .run(at, kind, locationId);
    return changes > 0;
  }

  async active(locationId?: string): Promise<InsightDTO[]> {
    return (await this.db
      .prepare(
        `SELECT i.*, l.location_name FROM insights i LEFT JOIN locations l ON l.location_id = i.location_id
         WHERE i.is_active = TRUE ${locationId ? 'AND i.location_id = ?' : ''}
         ORDER BY CASE i.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, i.updated_at DESC`,
      )
      .all(...(locationId ? [locationId] : []))) as InsightDTO[];
  }

  async countRecent(kind: InsightKind, locationId: string, since: string): Promise<number> {
    return (
      (await this.db
        .prepare('SELECT COUNT(*)::int AS n FROM insights WHERE kind = ? AND location_id = ? AND (is_active = TRUE OR updated_at >= ?)')
        .get(kind, locationId, since)) as any
    ).n;
  }

  async complaintsSince(since: string): Promise<Array<{ location_id: string; complaint_type: string; created_at: string; status: string }>> {
    return (await this.db.prepare('SELECT location_id, complaint_type, created_at, status FROM complaints WHERE created_at >= ?').all(since)) as any;
  }
}