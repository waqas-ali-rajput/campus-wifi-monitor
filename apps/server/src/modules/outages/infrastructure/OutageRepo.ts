import type { ComplaintSignal, FailureSignal, HealthStatus, OutageDTO } from '@campus/shared';
import type { CompatDb } from '../../../infrastructure/db/compat';

/** SQLite compared ISO text, so '' meant "since forever"; Postgres needs a real timestamp. */
const EPOCH = '1970-01-01T00:00:00.000Z';

const SELECT = `SELECT o.*, l.location_name, l.building, u.name AS resolved_by_name FROM outages o
  JOIN locations l ON l.location_id = o.location_id
  LEFT JOIN users u ON u.user_id = o.resolved_by`;

export class OutageRepo {
  constructor(private db: CompatDb) {}

  async active(): Promise<OutageDTO[]> {
    return (await this.db.prepare(`${SELECT} WHERE o.status = 'active' ORDER BY o.detected_at DESC`).all()) as OutageDTO[];
  }
  async activeFor(locationId: string): Promise<OutageDTO | undefined> {
    return (await this.db.prepare(`${SELECT} WHERE o.status = 'active' AND o.location_id = ?`).get(locationId)) as OutageDTO | undefined;
  }
  async byId(id: string): Promise<OutageDTO | undefined> {
    return (await this.db.prepare(`${SELECT} WHERE o.outage_id = ?`).get(id)) as OutageDTO | undefined;
  }
  async list(status?: 'active' | 'resolved', limit = 100): Promise<OutageDTO[]> {
    return (await this.db
      .prepare(`${SELECT} ${status ? 'WHERE o.status = ?' : ''} ORDER BY o.detected_at DESC LIMIT ${limit}`)
      .all(...(status ? [status] : []))) as OutageDTO[];
  }
  async insert(o: {
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
    await this.db
      .prepare(
        `INSERT INTO outages(outage_id, location_id, status, cause_rule, message, complaint_count, failure_count, explanation, category, detected_at)
         VALUES (@outage_id, @location_id, 'active', @cause_rule, @message, @complaint_count, @failure_count, @explanation, @category, @detected_at)`,
      )
      .run(o);
  }
  async resolve(id: string, at: string, by: string | null) {
    await this.db.prepare(`UPDATE outages SET status = 'resolved', resolved_at = ?, resolved_by = ? WHERE outage_id = ? AND status = 'active'`).run(at, by, id);
  }

  async complaintSignals(locationId: string, since: string): Promise<ComplaintSignal[]> {
    return (await this.db
      .prepare(
        `SELECT user_id AS "userId", complaint_type AS "complaintType", ai_category AS "aiCategory", ai_confidence AS "aiConfidence", created_at AS "createdAt"
         FROM complaints WHERE location_id = ? AND created_at >= ?`,
      )
      .all(locationId, since)) as ComplaintSignal[];
  }
  async failureSignals(locationId: string, since: string): Promise<FailureSignal[]> {
    return (await this.db
      .prepare(`SELECT user_id AS "userId", reason, occurred_at AS "occurredAt" FROM test_failures WHERE location_id = ? AND occurred_at >= ?`)
      .all(locationId, since)) as FailureSignal[];
  }
  async latestStatuses(locationId: string, n: number, since = ''): Promise<HealthStatus[]> {
    return (
      (await this.db
        .prepare('SELECT health_status FROM speed_tests WHERE location_id = ? AND tested_at > ? ORDER BY tested_at DESC LIMIT ?')
        .all(locationId, since || EPOCH, n)) as any[]
    ).map((r) => r.health_status);
  }
  async lastResolvedAt(locationId: string): Promise<string> {
    const r = (await this.db.prepare(`SELECT MAX(resolved_at) AS m FROM outages WHERE location_id = ? AND status = 'resolved'`).get(locationId)) as any;
    return r?.m ?? '';
  }
  async scoresSince(locationId: string, since: string): Promise<Array<{ score: number; at: string }>> {
    return (await this.db
      .prepare('SELECT health_score AS score, tested_at AS at FROM speed_tests WHERE location_id = ? AND tested_at > ? ORDER BY tested_at DESC LIMIT 20')
      .all(locationId, since || EPOCH)) as Array<{ score: number; at: string }>;
  }
  /** Users who tested or complained at a location since `since`. */
  async affectedUsers(locationId: string, since: string): Promise<string[]> {
    return (
      (await this.db
        .prepare(
          `SELECT user_id FROM speed_tests WHERE location_id = @l AND tested_at >= @s
           UNION SELECT user_id FROM complaints WHERE location_id = @l AND created_at >= @s`,
        )
        .all({ l: locationId, s: since })) as any[]
    ).map((r) => r.user_id);
  }
}