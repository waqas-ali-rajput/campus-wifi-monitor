import type { InsightDTO, InsightKind } from '@campus/shared';
import type { Db } from '../../../infrastructure/db/connection';
import { newId } from '../../../shared/ports';

export class InsightRepo {
  constructor(private db: Db) {}

  activeOne(kind: InsightKind, locationId: string | null): InsightDTO | undefined {
    return this.db
      .prepare(`SELECT * FROM insights WHERE is_active = 1 AND kind = ? AND COALESCE(location_id,'*') = COALESCE(?, '*')`)
      .get(kind, locationId) as InsightDTO | undefined;
  }

  /** Re-detecting the same kind for the same location updates the active row. Returns true when newly created. */
  upsert(kind: InsightKind, locationId: string | null, severity: string, message: string, data: unknown, at: string): boolean {
    const cur = this.activeOne(kind, locationId);
    if (cur) {
      this.db
        .prepare('UPDATE insights SET severity = ?, message = ?, data_json = ?, updated_at = ? WHERE insight_id = ?')
        .run(severity, message, JSON.stringify(data ?? {}), at, cur.insight_id);
      return false;
    }
    this.db
      .prepare(
        `INSERT INTO insights(insight_id, kind, location_id, severity, message, data_json, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(newId(), kind, locationId, severity, message, JSON.stringify(data ?? {}), at, at);
    return true;
  }

  updateData(id: string, data: unknown, at: string) {
    this.db.prepare('UPDATE insights SET data_json = ?, updated_at = ? WHERE insight_id = ?').run(JSON.stringify(data), at, id);
  }

  deactivate(kind: InsightKind, locationId: string | null, at: string): boolean {
    return (
      this.db
        .prepare(`UPDATE insights SET is_active = 0, updated_at = ? WHERE is_active = 1 AND kind = ? AND COALESCE(location_id,'*') = COALESCE(?, '*')`)
        .run(at, kind, locationId).changes > 0
    );
  }

  active(locationId?: string): InsightDTO[] {
    return this.db
      .prepare(
        `SELECT i.*, l.location_name FROM insights i LEFT JOIN locations l ON l.location_id = i.location_id
         WHERE i.is_active = 1 ${locationId ? 'AND i.location_id = ?' : ''}
         ORDER BY CASE i.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, i.updated_at DESC`,
      )
      .all(...(locationId ? [locationId] : [])) as InsightDTO[];
  }

  countRecent(kind: InsightKind, locationId: string, since: string): number {
    return (
      this.db
        .prepare('SELECT COUNT(*) n FROM insights WHERE kind = ? AND location_id = ? AND (is_active = 1 OR updated_at >= ?)')
        .get(kind, locationId, since) as any
    ).n;
  }

  complaintsSince(since: string): Array<{ location_id: string; complaint_type: string; created_at: string; status: string }> {
    return this.db.prepare('SELECT location_id, complaint_type, created_at, status FROM complaints WHERE created_at >= ?').all(since) as any;
  }
}
