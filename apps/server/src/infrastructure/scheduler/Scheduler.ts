import type { Container } from '../../container';
import { daysAgo } from '../../shared/time';

interface Job {
  name: string;
  everyMs: number;
  run: () => void | Promise<void>;
}

/** In-process interval jobs (§11.5). Each job is idempotent and isolated by try/catch. */
export class Scheduler {
  private timers: NodeJS.Timeout[] = [];
  private lastMaintCheck: string;
  private fingerprint: string | null | undefined = undefined;
  private lastExternalCheck: string;

  constructor(
    private c: Container,
    private log: { error: (o: unknown, m?: string) => void; info: (o: unknown, m?: string) => void },
  ) {
    this.lastMaintCheck = c.clock.now().toISOString();
    this.lastExternalCheck = this.lastMaintCheck;
  }

  /**
   * Demo scripts (npm run simulate*) and other server instances write to the same Postgres
   * database. A cheap "latest change" fingerprint tells us when something changed, and we then
   * push live updates (SSE) for those writes, including the notifications they created.
   * Notifications already pushed by this process are skipped by the SSE hub.
   */
  async watchExternalWrites() {
    const db = this.c.db;
    const { rows } = await db.query<{ v: string | null }>(
      `SELECT GREATEST(
         (SELECT MAX(tested_at) FROM speed_tests),
         (SELECT MAX(updated_at) FROM complaints),
         (SELECT MAX(GREATEST(detected_at, COALESCE(resolved_at, detected_at))) FROM outages),
         (SELECT MAX(created_at) FROM notifications),
         (SELECT MAX(occurred_at) FROM test_failures)
       )::text AS v`,
    );
    const v = rows[0]?.v ?? null;
    // look back a little to cover writes that committed just after the previous check
    const since = new Date(Date.parse(this.lastExternalCheck) - 10_000).toISOString();
    this.lastExternalCheck = this.c.clock.now().toISOString();
    if (this.fingerprint === undefined) {
      this.fingerprint = v;
      return;
    }
    if (v === this.fingerprint) return;
    this.fingerprint = v;
    const sse = this.c.sse;
    const notes = await db.query<any>('SELECT * FROM notifications WHERE created_at > $1 ORDER BY created_at', [since]);
    for (const n of notes.rows) sse.publish('notification', n, { userIds: [n.user_id] });
    const opened = await db.query('SELECT outage_id, location_id, message FROM outages WHERE detected_at > $1', [since]);
    for (const o of opened.rows) sse.publish('outage.opened', o);
    const resolved = await db.query('SELECT outage_id, location_id, message FROM outages WHERE resolved_at > $1', [since]);
    for (const o of resolved.rows) sse.publish('outage.resolved', o);
    sse.publish('dashboard.updated', { external: true });
    sse.publish('complaint.updated', { external: true }, { roles: ['it_staff', 'manager', 'admin', 'user'] });
    sse.publish('insight.updated', { external: true }, { roles: ['it_staff', 'manager', 'admin'] });
  }

  jobs(): Job[] {
    const S = this.c.services;
    return [
      { name: 'watchExternalWrites', everyMs: 5_000, run: () => this.watchExternalWrites() },
      { name: 'refreshLocationStatuses', everyMs: 60_000, run: async () => void (await S.locations.refreshAll()) },
      { name: 'evaluateOutages', everyMs: 60_000, run: () => S.outages.evaluateAll() },
      {
        name: 'announceMaintenance',
        everyMs: 60_000,
        run: async () => {
          await S.maintenance.announcePending();
          const now = this.c.clock.now().toISOString();
          if ((await this.c.repos.maintenance.endedBetween(this.lastMaintCheck, now)).length) await S.locations.refreshAll();
          this.lastMaintCheck = now;
        },
      },
      { name: 'refreshInsights', everyMs: 5 * 60_000, run: () => S.insights.refreshAll() },
      { name: 'purge', everyMs: 24 * 3600_000, run: async () => void (await this.c.repos.notifications.purgeReadBefore(daysAgo(this.c.clock.now(), 30))) },
    ];
  }

  async runOnce(name: string) {
    const j = this.jobs().find((x) => x.name === name);
    if (j) await this.safe(j);
  }

  private async safe(j: Job) {
    try {
      await j.run();
    } catch (err) {
      this.log.error({ err, job: j.name }, 'Scheduler job failed');
    }
  }

  start() {
    for (const j of this.jobs()) {
      let running = false;
      const t = setInterval(() => {
        // Jobs now await network round-trips; never stack a second run on a slow one.
        if (running) return;
        running = true;
        void this.safe(j).finally(() => (running = false));
      }, j.everyMs);
      t.unref();
      this.timers.push(t);
    }
  }

  stop() {
    this.timers.forEach(clearInterval);
    this.timers = [];
  }
}
