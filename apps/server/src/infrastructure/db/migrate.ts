import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_HEALTH_CONFIG,
  DEFAULT_INSIGHTS_CONFIG,
  DEFAULT_OUTAGE_CONFIG,
} from '@campus/shared';
import type { Db } from './connection';

export function migrationsDir(): string {
  const candidates = [
    path.resolve(__dirname, '../../../migrations'), // src/infrastructure/db
    path.resolve(__dirname, '../migrations'), // dist/
    path.resolve(__dirname, 'migrations'),
  ];
  return candidates.find((c) => existsSync(c)) ?? candidates[0]!;
}

/** Applies NNN_name.sql files in order inside a transaction; tracked in _migrations. Idempotent. */
export function migrate(db: Db, dir = migrationsDir()): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`);
  const done = new Set(db.prepare('SELECT name FROM _migrations').all().map((r: any) => r.name as string));
  const files = readdirSync(dir)
    .filter((f) => /^\d{3}_.*\.sql$/.test(f))
    .sort();
  const applied: string[] = [];
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = readFileSync(path.join(dir, f), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO _migrations(name, applied_at) VALUES (?, ?)').run(f, new Date().toISOString());
    })();
    applied.push(f);
  }
  const now = new Date().toISOString();
  const ins = db.prepare('INSERT OR IGNORE INTO settings(key, value_json, updated_at) VALUES (?, ?, ?)');
  ins.run('health.config', JSON.stringify(DEFAULT_HEALTH_CONFIG), now);
  ins.run('outage.config', JSON.stringify(DEFAULT_OUTAGE_CONFIG), now);
  ins.run('insights.config', JSON.stringify(DEFAULT_INSIGHTS_CONFIG), now);
  return applied;
}
