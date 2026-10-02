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
  private dataVersion = -1;
  private pushed = new Set<string>();
  private lastExternalCheck: string;

  constructor(
    private c: Container,
    private log: { error: (o: unknown, m?: string) => void; info: (o: unknown, m?: string) => void },
  ) {
    this.lastMaintCheck = c.clock.now().toISOString();
    this.lastExternalCheck = this.lastMaintCheck;
  }

  /**
   * Demo scripts (npm run simulate*) write to the same SQLite file from another process.
   * PRAGMA data_version changes only when *another* connection commits, so we use it to push
   * live updates (SSE) for those external writes, including the notifications they created.
   */
  watchExternalWrites() {
    const v = (this.c.db.pragma('data_version', { simple: true }) as number) ?? 0;
    // look back a little to cover writes that committed just after the previous check
    const since = new Date(Date.parse(this.lastExternalCheck) - 10_000).toISOString();
    this.lastExternalCheck = this.c.clock.now().toISOString();
    if (this.dataVersion === -1) {
      this.dataVersion = v;
      return;
    }
    if (v === this.dataVersion) return;
    this.dataVersion = v;
    const sse = this.c.sse;
    const rows = this.c.db.prepare('SELECT * FROM notifications WHERE created_at > ? ORDER BY created_at').all(since) as any[];
    for (const n of rows) {
      if (this.pushed.has(n.notification_id)) continue;
      this.pushed.add(n.notification_id);
      sse.publish('notification', n, { userIds: [n.user_id] });
    }
    if (this.pushed.size > 5000) this.pushed.clear();
    const opened = this.c.db.prepare('SELECT outage_id, location_id, message FROM outages WHERE detected_at > ?').all(since) as any[];
    for (const o of opened) sse.publish('outage.opened', o);
    const resolved = this.c.db.prepare('SELECT outage_id, location_id, message FROM outages WHERE resolved_at > ?').all(since) as any[];
    for (const o of resolved) sse.publish('outage.resolved', o);
    sse.publish('dashboard.updated', { external: true });
    sse.publish('complaint.updated', { external: true }, { roles: ['it_staff', 'manager', 'admin', 'user'] });
    sse.publish('insight.updated', { external: true }, { roles: ['it_staff', 'manager', 'admin'] });
  }

  jobs(): Job[] {
    const S = this.c.services;
    return [
      { name: 'watchExternalWrites', everyMs: 2_000, run: () => this.watchExternalWrites() },
      { name: 'refreshLocationStatuses', everyMs: 60_000, run: () => void S.locations.refreshAll() },
      { name: 'evaluateOutages', everyMs: 60_000, run: () => S.outages.evaluateAll() },
      {
        name: 'announceMaintenance',
        everyMs: 60_000,
        run: () => {
          S.maintenance.announcePending();
          const now = this.c.clock.now().toISOString();
          if (this.c.repos.maintenance.endedBetween(this.lastMaintCheck, now).length) S.locations.refreshAll();
          this.lastMaintCheck = now;
        },
      },
      { name: 'refreshInsights', everyMs: 5 * 60_000, run: () => S.insights.refreshAll() },
      { name: 'purge', everyMs: 24 * 3600_000, run: () => void this.c.repos.notifications.purgeReadBefore(daysAgo(this.c.clock.now(), 30)) },
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
      const t = setInterval(() => void this.safe(j), j.everyMs);
      t.unref();
      this.timers.push(t);
    }
  }

  stop() {
    this.timers.forEach(clearInterval);
    this.timers = [];
  }
}
