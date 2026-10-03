import type { CompatDb } from '../../../infrastructure/db/compat';

export interface Range {
  from: string;
  to: string;
  location_id?: string;
  building?: string;
}

function filt(r: Range, alias = 't', timeCol = 'tested_at') {
  const where = [`${alias}.${timeCol} >= @from`, `${alias}.${timeCol} <= @to`];
  if (r.location_id) where.push(`${alias}.location_id = @location_id`);
  if (r.building) where.push('l.building = @building');
  return where.join(' AND ');
}
const params = (r: Range) => ({ from: r.from, to: r.to, location_id: r.location_id ?? null, building: r.building ?? null });

export class AnalyticsRepo {
  constructor(private db: CompatDb) {}

  async byLocation(r: Range) {
    return (await this.db
      .prepare(
        `SELECT l.location_id, l.location_name, l.building, l.current_status, l.current_score,
           COUNT(t.test_id)::int AS tests,
           ROUND(AVG(t.download_speed)::numeric, 1)::float8 AS avg_download,
           ROUND(AVG(t.upload_speed)::numeric, 1)::float8 AS avg_upload,
           ROUND(AVG(t.ping)::numeric, 1)::float8 AS avg_ping,
           ROUND(AVG(t.packet_loss)::numeric, 2)::float8 AS avg_loss,
           ROUND(AVG(t.health_score)::numeric, 1)::float8 AS avg_score,
           (SELECT COUNT(*)::int FROM complaints c WHERE c.location_id = l.location_id AND c.created_at >= @from AND c.created_at <= @to) AS complaints
         FROM locations l LEFT JOIN speed_tests t ON t.location_id = l.location_id AND ${filt(r)}
         WHERE l.is_active = TRUE ${r.building ? 'AND l.building = @building' : ''} ${r.location_id ? 'AND l.location_id = @location_id' : ''}
         GROUP BY l.location_id ORDER BY avg_score DESC NULLS LAST, l.location_name`,
      )
      .all(params(r))) as any;
  }

  async complaintsByBuilding(r: Range) {
    return (await this.db
      .prepare(
        `SELECT l.building, c.complaint_type, COUNT(*)::int AS n FROM complaints c JOIN locations l ON l.location_id = c.location_id
         WHERE ${filt(r, 'c', 'created_at')} GROUP BY l.building, c.complaint_type ORDER BY l.building`,
      )
      .all(params(r))) as Array<{ building: string; complaint_type: string; n: number }>;
  }

  async compareBuildings(r: Range) {
    return (await this.db
      .prepare(
        `SELECT l.building, COUNT(DISTINCT l.location_id)::int AS locations, COUNT(t.test_id)::int AS tests,
           ROUND(AVG(t.download_speed)::numeric, 1)::float8 AS avg_download,
           ROUND(AVG(t.upload_speed)::numeric, 1)::float8 AS avg_upload,
           ROUND(AVG(t.ping)::numeric, 1)::float8 AS avg_ping,
           ROUND(AVG(t.packet_loss)::numeric, 2)::float8 AS avg_loss,
           ROUND(AVG(t.health_score)::numeric, 1)::float8 AS avg_score,
           COALESCE(SUM(CASE WHEN t.health_status IN ('poor','critical') THEN 1 ELSE 0 END), 0)::int AS poor_tests,
           (SELECT COUNT(*)::int FROM complaints c JOIN locations l2 ON l2.location_id = c.location_id
              WHERE l2.building = l.building AND c.created_at >= @from AND c.created_at <= @to) AS complaints,
           (SELECT COUNT(*)::int FROM complaints c JOIN locations l2 ON l2.location_id = c.location_id
              WHERE l2.building = l.building AND c.status <> 'resolved') AS open_complaints
         FROM locations l LEFT JOIN speed_tests t ON t.location_id = l.location_id AND t.tested_at >= @from AND t.tested_at <= @to
         WHERE l.is_active = TRUE GROUP BY l.building ORDER BY avg_score DESC NULLS LAST, l.building`,
      )
      .all(params(r))) as any;
  }

  async complaintRows(r: Range) {
    return (await this.db
      .prepare(
        `SELECT c.location_id, l.location_name, l.building, c.complaint_type, c.created_at FROM complaints c
         JOIN locations l ON l.location_id = c.location_id WHERE ${filt(r, 'c', 'created_at')}`,
      )
      .all(params(r))) as Array<{ location_id: string; location_name: string; building: string; complaint_type: string; created_at: string }>;
  }

  async staffActivity(r: Range) {
    return (await this.db
      .prepare(
        `SELECT u.user_id, u.name, u.email, u.account_status,
           (SELECT COUNT(*)::int FROM complaints c WHERE c.assigned_staff = u.user_id) AS assigned_total,
           (SELECT COUNT(*)::int FROM complaints c WHERE c.assigned_staff = u.user_id AND c.status = 'assigned') AS assigned_open,
           (SELECT COUNT(*)::int FROM complaints c WHERE c.assigned_staff = u.user_id AND c.status = 'in_progress') AS in_progress,
           (SELECT COUNT(*)::int FROM complaints c WHERE c.assigned_staff = u.user_id AND c.status = 'resolved') AS resolved,
           (SELECT ROUND((AVG(EXTRACT(EPOCH FROM (c.resolved_at - c.created_at)) / 3600))::numeric, 1)::float8
              FROM complaints c
              WHERE c.assigned_staff = u.user_id AND c.status = 'resolved') AS avg_resolution_hours,
           (SELECT COUNT(*)::int FROM activity_logs a WHERE a.actor_id = u.user_id AND a.created_at >= @from AND a.created_at <= @to) AS actions,
           (SELECT MAX(a.created_at) FROM activity_logs a WHERE a.actor_id = u.user_id) AS last_action_at
         FROM users u WHERE u.role = 'it_staff' ORDER BY resolved DESC, u.name`,
      )
      .all(params(r))) as any;
  }

  async kpis(since: string) {
    return (await this.db
      .prepare(
        `SELECT COUNT(*)::int AS tests, AVG(download_speed) AS d, AVG(upload_speed) AS u, AVG(ping) AS p, AVG(packet_loss) AS l
         FROM speed_tests WHERE tested_at >= ?`,
      )
      .get(since)) as { tests: number; d: number | null; u: number | null; p: number | null; l: number | null };
  }

  async complaintCounts(since: string) {
    return (await this.db
      .prepare(
        `SELECT SUM(CASE WHEN status <> 'resolved' THEN 1 ELSE 0 END)::int AS open,
                SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END)::int AS resolved,
                SUM(CASE WHEN status = 'resolved' AND resolved_at >= ? THEN 1 ELSE 0 END)::int AS resolved_today
         FROM complaints`,
      )
      .get(since)) as { open: number | null; resolved: number | null; resolved_today: number | null };
  }

  async recentEvents(limit: number) {
    // Postgres equivalent of printf('%.1f Mbps down · %d ms ping'): CAST(real AS INTEGER) truncated in SQLite, hence trunc().
    return (await this.db
      .prepare(
        `SELECT * FROM (
           SELECT 'test' AS kind, t.test_id AS id, t.tested_at AS at, l.location_name, t.health_status AS status,
              ROUND(t.download_speed::numeric, 1)::text || ' Mbps down · ' || trunc(t.ping)::int::text || ' ms ping' AS detail
              FROM speed_tests t JOIN locations l ON l.location_id = t.location_id
            UNION ALL
            SELECT 'outage', o.outage_id, o.detected_at, l.location_name, 'critical', o.message FROM outages o JOIN locations l ON l.location_id = o.location_id
            UNION ALL
            SELECT 'recovered', o.outage_id, o.resolved_at, l.location_name, 'good', 'Network returns to normal' FROM outages o
              JOIN locations l ON l.location_id = o.location_id WHERE o.resolved_at IS NOT NULL
            UNION ALL
            SELECT 'complaint', c.complaint_id, c.created_at, l.location_name, c.status, c.complaint_type FROM complaints c
              JOIN locations l ON l.location_id = c.location_id
          ) events ORDER BY at DESC, kind, id DESC LIMIT ?`,
      )
      .all(limit)) as any;
  }
}