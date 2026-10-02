import type { SpeedTestDTO } from '@campus/shared';
import type { Db } from '../../../infrastructure/db/connection';

export interface TestFilters {
  location_id?: string;
  building?: string;
  from?: string;
  to?: string;
  status?: string;
  user_id?: string;
  page: number;
  pageSize: number;
}

const SELECT = `SELECT t.test_id, t.user_id, t.location_id, t.download_speed, t.upload_speed, t.ping, t.jitter, t.packet_loss,
  t.base_score, t.health_score, t.health_status, t.during_maintenance, t.is_seed, t.tested_at,
  l.location_name, l.building, u.name AS user_name
  FROM speed_tests t JOIN locations l ON l.location_id = t.location_id JOIN users u ON u.user_id = t.user_id`;

export class TestRepo {
  constructor(private db: Db) {}

  insert(t: {
    test_id: string;
    user_id: string;
    location_id: string;
    download_speed: number;
    upload_speed: number;
    ping: number;
    jitter: number;
    packet_loss: number;
    base_score: number;
    health_score: number;
    health_status: string;
    during_maintenance: number;
    is_seed: number;
    client_meta: string;
    tested_at: string;
  }) {
    this.db
      .prepare(
        `INSERT INTO speed_tests(test_id, user_id, location_id, download_speed, upload_speed, ping, jitter, packet_loss, base_score,
          health_score, health_status, during_maintenance, is_seed, client_meta, tested_at)
         VALUES (@test_id, @user_id, @location_id, @download_speed, @upload_speed, @ping, @jitter, @packet_loss, @base_score,
          @health_score, @health_status, @during_maintenance, @is_seed, @client_meta, @tested_at)`,
      )
      .run(t);
  }

  insertFailure(f: { failure_id: string; user_id: string; location_id: string; reason: string; detail: string; occurred_at: string }) {
    this.db
      .prepare(
        `INSERT INTO test_failures(failure_id, user_id, location_id, reason, detail, occurred_at)
         VALUES (@failure_id, @user_id, @location_id, @reason, @detail, @occurred_at)`,
      )
      .run(f);
  }

  byId(id: string): SpeedTestDTO | undefined {
    return this.db.prepare(`${SELECT} WHERE t.test_id = ?`).get(id) as SpeedTestDTO | undefined;
  }

  lastByUser(userId: string): SpeedTestDTO | undefined {
    return this.db.prepare(`${SELECT} WHERE t.user_id = ? ORDER BY t.tested_at DESC LIMIT 1`).get(userId) as SpeedTestDTO | undefined;
  }

  latestForUserAtLocation(userId: string, locationId: string, since: string): SpeedTestDTO | undefined {
    return this.db
      .prepare(`${SELECT} WHERE t.user_id = ? AND t.location_id = ? AND t.tested_at >= ? ORDER BY t.tested_at DESC LIMIT 1`)
      .get(userId, locationId, since) as SpeedTestDTO | undefined;
  }

  list(f: TestFilters) {
    const where: string[] = [];
    const p: Record<string, unknown> = {};
    if (f.location_id) (where.push('t.location_id = @location_id'), (p.location_id = f.location_id));
    if (f.building) (where.push('l.building = @building'), (p.building = f.building));
    if (f.from) (where.push('t.tested_at >= @from'), (p.from = f.from));
    if (f.to) (where.push('t.tested_at <= @to'), (p.to = f.to));
    if (f.status) (where.push('t.health_status = @status'), (p.status = f.status));
    if (f.user_id) {
      where.push('t.user_id = @user_id', 't.is_seed = 0', "json_extract(t.client_meta, '$.simulated') IS NOT 1");
      p.user_id = f.user_id;
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (this.db.prepare(`SELECT COUNT(*) n FROM speed_tests t JOIN locations l ON l.location_id = t.location_id ${w}`).get(p) as any).n;
    const items = this.db
      .prepare(`${SELECT} ${w} ORDER BY t.tested_at DESC LIMIT @limit OFFSET @offset`)
      .all({ ...p, limit: f.pageSize, offset: (f.page - 1) * f.pageSize }) as SpeedTestDTO[];
    return { items, page: f.page, pageSize: f.pageSize, total };
  }

  /** Raw rows for analytics/insights (bounded by time). */
  rowsSince(since: string, f: { location_id?: string; building?: string; to?: string } = {}) {
    const where = ['t.tested_at >= @since'];
    const p: Record<string, unknown> = { since };
    if (f.location_id) (where.push('t.location_id = @location_id'), (p.location_id = f.location_id));
    if (f.building) (where.push('l.building = @building'), (p.building = f.building));
    if (f.to) (where.push('t.tested_at <= @to'), (p.to = f.to));
    return this.db
      .prepare(
        `SELECT t.location_id, l.location_name, l.building, t.download_speed, t.upload_speed, t.ping, t.packet_loss, t.health_score,
           t.base_score, t.health_status, t.tested_at
         FROM speed_tests t JOIN locations l ON l.location_id = t.location_id
         WHERE ${where.join(' AND ')} ORDER BY t.tested_at`,
      )
      .all(p) as Array<{
      location_id: string;
      location_name: string;
      building: string;
      download_speed: number;
      upload_speed: number;
      ping: number;
      packet_loss: number;
      health_score: number;
      base_score: number;
      health_status: string;
      tested_at: string;
    }>;
  }

  failuresSince(since: string, locationId?: string) {
    return this.db
      .prepare(`SELECT * FROM test_failures WHERE occurred_at >= ? ${locationId ? 'AND location_id = ?' : ''} ORDER BY occurred_at DESC`)
      .all(...[since, ...(locationId ? [locationId] : [])]) as any[];
  }
}
