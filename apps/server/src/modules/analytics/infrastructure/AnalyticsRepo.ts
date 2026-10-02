import type { Db } from '../../../infrastructure/db/connection';

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
  constructor(private db: Db) {}

  byLocation(r: Range) {
    return this.db
      .prepare(
        `SELECT l.location_id, l.location_name, l.building, l.current_status, l.current_score,
           COUNT(t.test_id) AS tests,
           ROUND(AVG(t.download_speed), 1) AS avg_download, ROUND(AVG(t.upload_speed), 1) AS avg_upload,
           ROUND(AVG(t.ping), 1) AS avg_ping, ROUND(AVG(t.packet_loss), 2) AS avg_loss, ROUND(AVG(t.health_score), 1) AS avg_score,
           (SELECT COUNT(*) FROM complaints c WHERE c.location_id = l.location_id AND c.created_at >= @from AND c.created_at <= @to) AS complaints
         FROM locations l LEFT JOIN speed_tests t ON t.location_id = l.location_id AND ${filt(r)}
         WHERE l.is_active = 1 ${r.building ? 'AND l.building = @building' : ''} ${r.location_id ? 'AND l.location_id = @location_id' : ''}
         GROUP BY l.location_id ORDER BY avg_score DESC`,
      )
      .all(params(r));
  }

  complaintsByBuilding(r: Range) {
    return this.db
      .prepare(
        `SELECT l.building, c.complaint_type, COUNT(*) AS n FROM complaints c JOIN locations l ON l.location_id = c.location_id
         WHERE ${filt(r, 'c', 'created_at')} GROUP BY l.building, c.complaint_type ORDER BY l.building`,
      )
      .all(params(r)) as Array<{ building: string; complaint_type: string; n: number }>;
  }

  compareBuildings(r: Range) {
    return this.db
      .prepare(
        `SELECT l.building, COUNT(DISTINCT l.location_id) AS locations, COUNT(t.test_id) AS tests,
           ROUND(AVG(t.download_speed), 1) AS avg_download, ROUND(AVG(t.upload_speed), 1) AS avg_upload,
           ROUND(AVG(t.ping), 1) AS avg_ping, ROUND(AVG(t.packet_loss), 2) AS avg_loss, ROUND(AVG(t.health_score), 1) AS avg_score,
           SUM(CASE WHEN t.health_status IN ('poor','critical') THEN 1 ELSE 0 END) AS poor_tests,
           (SELECT COUNT(*) FROM complaints c JOIN locations l2 ON l2.location_id = c.location_id
              WHERE l2.building = l.building AND c.created_at >= @from AND c.created_at <= @to) AS complaints,
           (SELECT COUNT(*) FROM complaints c JOIN locations l2 ON l2.location_id = c.location_id
              WHERE l2.building = l.building AND c.status <> 'resolved') AS open_complaints
         FROM locations l LEFT JOIN speed_tests t ON t.location_id = l.location_id AND t.tested_at >= @from AND t.tested_at <= @to
         WHERE l.is_active = 1 GROUP BY l.building ORDER BY avg_score DESC`,
      )
      .all(params(r));
  }

  complaintRows(r: Range) {
    return this.db
      .prepare(
        `SELECT c.location_id, l.location_name, l.building, c.complaint_type, c.created_at FROM complaints c
         JOIN locations l ON l.location_id = c.location_id WHERE ${filt(r, 'c', 'created_at')}`,
      )
      .all(params(r)) as Array<{ location_id: string; location_name: string; building: string; complaint_type: string; created_at: string }>;
  }

  staffActivity(r: Range) {
    return this.db
      .prepare(
        `SELECT u.user_id, u.name, u.email, u.account_status,
           (SELECT COUNT(*) FROM complaints c WHERE c.assigned_staff = u.user_id) AS assigned_total,
           (SELECT COUNT(*) FROM complaints c WHERE c.assigned_staff = u.user_id AND c.status = 'assigned') AS assigned_open,
           (SELECT COUNT(*) FROM complaints c WHERE c.assigned_staff = u.user_id AND c.status = 'in_progress') AS in_progress,
           (SELECT COUNT(*) FROM complaints c WHERE c.assigned_staff = u.user_id AND c.status = 'resolved') AS resolved,
           (SELECT ROUND(AVG((julianday(c.resolved_at) - julianday(c.created_at)) * 24), 1) FROM complaints c
              WHERE c.assigned_staff = u.user_id AND c.status = 'resolved') AS avg_resolution_hours,
           (SELECT COUNT(*) FROM activity_logs a WHERE a.actor_id = u.user_id AND a.created_at >= @from AND a.created_at <= @to) AS actions,
           (SELECT MAX(a.created_at) FROM activity_logs a WHERE a.actor_id = u.user_id) AS last_action_at
         FROM users u WHERE u.role = 'it_staff' ORDER BY resolved DESC, u.name`,
      )
      .all(params(r));
  }

  kpis(since: string) {
    return this.db
      .prepare(
        `SELECT COUNT(*) AS tests, AVG(download_speed) AS d, AVG(upload_speed) AS u, AVG(ping) AS p, AVG(packet_loss) AS l
         FROM speed_tests WHERE tested_at >= ?`,
      )
      .get(since) as { tests: number; d: number | null; u: number | null; p: number | null; l: number | null };
  }

  complaintCounts(since: string) {
    return this.db
      .prepare(
        `SELECT SUM(CASE WHEN status <> 'resolved' THEN 1 ELSE 0 END) AS open,
                SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved,
                SUM(CASE WHEN status = 'resolved' AND resolved_at >= ? THEN 1 ELSE 0 END) AS resolved_today
         FROM complaints`,
      )
      .get(since) as { open: number | null; resolved: number | null; resolved_today: number | null };
  }

  recentEvents(limit: number) {
    return this.db
      .prepare(
        `SELECT * FROM (
           SELECT 'test' AS kind, t.test_id AS id, t.tested_at AS at, l.location_name, t.health_status AS status,
             printf('%.1f Mbps down · %d ms ping', t.download_speed, CAST(t.ping AS INTEGER)) AS detail
             FROM speed_tests t JOIN locations l ON l.location_id = t.location_id
           UNION ALL
           SELECT 'outage', o.outage_id, o.detected_at, l.location_name, 'critical', o.message FROM outages o JOIN locations l ON l.location_id = o.location_id
           UNION ALL
           SELECT 'recovered', o.outage_id, o.resolved_at, l.location_name, 'good', 'Network returns to normal' FROM outages o
             JOIN locations l ON l.location_id = o.location_id WHERE o.resolved_at IS NOT NULL
           UNION ALL
           SELECT 'complaint', c.complaint_id, c.created_at, l.location_name, c.status, c.complaint_type FROM complaints c
             JOIN locations l ON l.location_id = c.location_id
         ) ORDER BY at DESC LIMIT ?`,
      )
      .all(limit);
  }
}
