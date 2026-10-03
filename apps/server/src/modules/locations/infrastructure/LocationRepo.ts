import type { LocationStatus } from '@campus/shared';
import type { CompatDb } from '../../../infrastructure/db/compat';

export interface LocationRow {
  location_id: string;
  location_name: string;
  building: string;
  floor: number | null;
  description: string;
  current_status: LocationStatus;
  current_score: number | null;
  current_stale: number;
  map_x: number;
  map_y: number;
  latitude: number | null;
  longitude: number | null;
  is_active: number;
  created_at: string;
}

export class LocationRepo {
  constructor(private db: CompatDb) {}

  async all(includeInactive = false): Promise<LocationRow[]> {
    return (await this.db
      .prepare(`SELECT * FROM locations ${includeInactive ? '' : 'WHERE is_active = TRUE'} ORDER BY building, floor NULLS FIRST, location_name`)
      .all()) as LocationRow[];
  }
  async byId(id: string): Promise<LocationRow | undefined> {
    return (await this.db.prepare('SELECT * FROM locations WHERE location_id = ?').get(id)) as LocationRow | undefined;
  }
  async byName(name: string): Promise<LocationRow | undefined> {
    // Case-insensitive, like the SQLite `COLLATE NOCASE` lookup it replaces.
    return (await this.db.prepare('SELECT * FROM locations WHERE lower(location_name) = lower(?)').get(name)) as LocationRow | undefined;
  }
  async insert(l: Omit<LocationRow, 'current_status' | 'current_score' | 'current_stale' | 'is_active'>) {
    await this.db
      .prepare(
        `INSERT INTO locations(location_id, location_name, building, floor, description, map_x, map_y, latitude, longitude, created_at)
         VALUES (@location_id, @location_name, @building, @floor, @description, @map_x, @map_y, @latitude, @longitude, @created_at)`,
      )
      .run(l);
  }
  async update(id: string, patch: Record<string, unknown>) {
    const cols = Object.keys(patch);
    if (!cols.length) return;
    await this.db.prepare(`UPDATE locations SET ${cols.map((c) => `${c} = @${c}`).join(', ')} WHERE location_id = @__id`).run({ ...patch, __id: id });
  }
  async setStatus(id: string, status: LocationStatus, score: number | null, stale: boolean) {
    await this.db
      .prepare('UPDATE locations SET current_status = ?, current_score = ?, current_stale = ? WHERE location_id = ?')
      .run(status, score, stale, id);
  }

  /** Per-location stats for "today" (§6 of the brief). */
  async todayStats(since: string) {
    return (await this.db
      .prepare(
        `SELECT l.location_id,
           (SELECT COUNT(*)::int FROM speed_tests t WHERE t.location_id = l.location_id AND t.tested_at >= @since) AS tests,
           (SELECT AVG(download_speed) FROM speed_tests t WHERE t.location_id = l.location_id AND t.tested_at >= @since) AS avg_download,
           (SELECT AVG(upload_speed) FROM speed_tests t WHERE t.location_id = l.location_id AND t.tested_at >= @since) AS avg_upload,
           (SELECT AVG(ping) FROM speed_tests t WHERE t.location_id = l.location_id AND t.tested_at >= @since) AS avg_ping,
           (SELECT COUNT(*)::int FROM complaints c WHERE c.location_id = l.location_id AND c.created_at >= @since) AS complaints,
           (SELECT MAX(tested_at) FROM speed_tests t WHERE t.location_id = l.location_id) AS last_tested_at
         FROM locations l`,
      )
      .all({ since })) as Array<{
      location_id: string;
      tests: number;
      avg_download: number | null;
      avg_upload: number | null;
      avg_ping: number | null;
      complaints: number;
      last_tested_at: string | null;
    }>;
  }

  async latestTests(): Promise<any[]> {
    return (await this.db
      .prepare(
        `SELECT t.* FROM speed_tests t
         JOIN (SELECT location_id, MAX(tested_at) m FROM speed_tests GROUP BY location_id) x
           ON x.location_id = t.location_id AND x.m = t.tested_at`,
      )
      .all()) as any[];
  }

  /** Inputs for the location health computation. */
  async recentScores(id: string, since: string): Promise<Array<{ baseScore: number; testedAt: string }>> {
    return (await this.db
      .prepare(
        'SELECT base_score AS "baseScore", tested_at AS "testedAt" FROM speed_tests WHERE location_id = ? AND tested_at >= ? ORDER BY tested_at DESC LIMIT 500',
      )
      .all(id, since)) as any;
  }
  async countFailures(id: string, since: string): Promise<number> {
    return ((await this.db.prepare('SELECT COUNT(*)::int AS n FROM test_failures WHERE location_id = ? AND occurred_at >= ?').get(id, since)) as any).n;
  }
  async countOpenComplaints(id: string, since: string): Promise<number> {
    return (
      (await this.db
        .prepare(`SELECT COUNT(*)::int AS n FROM complaints WHERE location_id = ? AND created_at >= ? AND status <> 'resolved'`)
        .get(id, since)) as any
    ).n;
  }
  async buildings(): Promise<string[]> {
    return ((await this.db.prepare('SELECT DISTINCT building FROM locations WHERE is_active = TRUE ORDER BY building').all()) as any[]).map((r) => r.building);
  }
}