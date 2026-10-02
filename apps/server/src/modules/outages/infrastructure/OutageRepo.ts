import type { ComplaintSignal, FailureSignal, HealthStatus, OutageDTO } from '@campus/shared';
import type { Db } from '../../../infrastructure/db/connection';

const SELECT = `SELECT o.*, l.location_name, l.building, u.name AS resolved_by_name FROM outages o
  JOIN locations l ON l.location_id = o.location_id
  LEFT JOIN users u ON u.user_id = o.resolved_by`;

export class OutageRepo {
  constructor(private db: Db) {}

  active(): OutageDTO[] {
    return this.db.prepare(`${SELECT} WHERE o.status = 'active' ORDER BY o.detected_at DESC`).all() as OutageDTO[];
  }
  activeFor(locationId: string): OutageDTO | undefined {
    return this.db.prepare(`${SELECT} WHERE o.status = 'active' AND o.location_id = ?`).get(locationId) as OutageDTO | undefined;
  }
  byId(id: string): OutageDTO | undefined {
    return this.db.prepare(`${SELECT} WHERE o.outage_id = ?`).get(id) as OutageDTO | undefined;
  }
  list(status?: 'active' | 'resolved', limit = 100): OutageDTO[] {
    return this.db
      .prepare(`${SELECT} ${status ? 'WHERE o.status = ?' : ''} ORDER BY o.detected_at DESC LIMIT ${limit}`)
      .all(...(status ? [status] : [])) as OutageDTO[];
  }
  insert(o: {
    outage_id: string;
    location_id: string;
    cause_rule: string;
    message: string;
    complaint_count: number;
    failure_count: number;
    explanation: string;
    category: string | null;
    detected_at: string;
  }) {
    this.db
      .prepare(
        `INSERT INTO outages(outage_id, location_id, status, cause_rule, message, complaint_count, failure_count, explanation, category, detected_at)
         VALUES (@outage_id, @location_id, 'active', @cause_rule, @message, @complaint_count, @failure_count, @explanation, @category, @detected_at)`,
      )
      .run(o);
  }
  resolve(id: string, at: string, by: string | null) {
    this.db.prepare(`UPDATE outages SET status = 'resolved', resolved_at = ?, resolved_by = ? WHERE outage_id = ? AND status = 'active'`).run(at, by, id);
  }

  complaintSignals(locationId: string, since: string): ComplaintSignal[] {
    return this.db
      .prepare(
        `SELECT user_id AS userId, complaint_type AS complaintType, ai_category AS aiCategory, ai_confidence AS aiConfidence, created_at AS createdAt
         FROM complaints WHERE location_id = ? AND created_at >= ?`,
      )
      .all(locationId, since) as ComplaintSignal[];
  }
  failureSignals(locationId: string, since: string): FailureSignal[] {
    return this.db
      .prepare(`SELECT user_id AS userId, reason, occurred_at AS occurredAt FROM test_failures WHERE location_id = ? AND occurred_at >= ?`)
      .all(locationId, since) as FailureSignal[];
  }
  latestStatuses(locationId: string, n: number, since = ''): HealthStatus[] {
    return (
      this.db
        .prepare('SELECT health_status FROM speed_tests WHERE location_id = ? AND tested_at > ? ORDER BY tested_at DESC LIMIT ?')
        .all(locationId, since, n) as any[]
    ).map((r) => r.health_status);
  }
  lastResolvedAt(locationId: string): string {
    const r = this.db.prepare(`SELECT MAX(resolved_at) m FROM outages WHERE location_id = ? AND status = 'resolved'`).get(locationId) as any;
    return r?.m ?? '';
  }
  scoresSince(locationId: string, since: string): Array<{ score: number; at: string }> {
    return this.db
      .prepare('SELECT health_score AS score, tested_at AS at FROM speed_tests WHERE location_id = ? AND tested_at > ? ORDER BY tested_at DESC LIMIT 20')
      .all(locationId, since) as Array<{ score: number; at: string }>;
  }
  /** Users who tested or complained at a location since `since`. */
  affectedUsers(locationId: string, since: string): string[] {
    return (
      this.db
        .prepare(
          `SELECT user_id FROM speed_tests WHERE location_id = @l AND tested_at >= @s
           UNION SELECT user_id FROM complaints WHERE location_id = @l AND created_at >= @s`,
        )
        .all({ l: locationId, s: since }) as any[]
    ).map((r) => r.user_id);
  }
}
