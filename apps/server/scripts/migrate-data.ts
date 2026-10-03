/**
 * One-time copy of an existing SQLite database into Postgres (Neon), preserving every ID so
 * foreign keys, links and sessions keep working.
 *
 *   DATABASE_URL=postgresql://… npm run migrate:data
 *   SQLITE_PATH=backups/old.db npm run migrate:data      (default: data/campus-wifi.db)
 *
 * - Applies the Postgres schema first (same as `npm run migrate`).
 * - Runs in ONE transaction: either everything is copied or nothing is.
 * - Refuses to run if the Postgres database already holds app data, so it can never mix two
 *   datasets. Pass --force to wipe the Postgres data first.
 * - Settings saved in SQLite replace the defaults the server writes on first start.
 */
import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadConfig, ROOT } from '../src/config';
import { bulkInsert } from '../src/infrastructure/db/bulk';
import { openDatabase } from '../src/infrastructure/db/connection';
import { migrate } from '../src/infrastructure/db/migrate';

/** SQLite stores flags as 0/1 and timestamps as ISO text; Postgres wants boolean / timestamptz. */
const bool = (v: unknown) => v === 1 || v === true || v === '1';
const ts = (v: unknown) => (v == null || v === '' ? null : new Date(String(v)).toISOString());

type Col = string | [name: string, convert: (v: unknown) => unknown];
/** Foreign-key order. `settings` is handled separately (upsert). */
const TABLES: Array<{ table: string; cols: Col[]; order?: string }> = [
  { table: 'users', cols: ['user_id', 'name', 'email', 'password_hash', 'role', 'account_status', ['created_at', ts]] },
  {
    table: 'locations',
    cols: ['location_id', 'location_name', 'building', 'floor', 'description', 'current_status', 'current_score', ['current_stale', bool], 'map_x', 'map_y', 'latitude', 'longitude', ['is_active', bool], ['created_at', ts]],
  },
  {
    table: 'speed_tests',
    cols: ['test_id', 'user_id', 'location_id', 'download_speed', 'upload_speed', 'ping', 'jitter', 'packet_loss', 'base_score', 'health_score', 'health_status', ['during_maintenance', bool], ['is_seed', bool], 'client_meta', ['tested_at', ts]],
  },
  { table: 'test_failures', cols: ['failure_id', 'user_id', 'location_id', 'reason', 'detail', ['occurred_at', ts]] },
  {
    table: 'complaints',
    cols: ['complaint_id', 'user_id', 'location_id', 'complaint_type', 'description', 'related_test_id', 'status', 'assigned_staff', 'ai_category', 'ai_confidence', ['is_seed', bool], ['created_at', ts], ['updated_at', ts], ['resolved_at', ts]],
  },
  // rowid order becomes `seq`, which breaks created_at ties in the complaint timeline exactly as before.
  { table: 'complaint_events', cols: ['event_id', 'complaint_id', 'actor_id', 'kind', 'from_status', 'to_status', 'note', ['created_at', ts]], order: 'rowid' },
  {
    table: 'outages',
    cols: ['outage_id', 'location_id', 'status', 'cause_rule', 'message', 'complaint_count', 'failure_count', 'explanation', 'category', ['detected_at', ts], ['resolved_at', ts], 'resolved_by'],
  },
  { table: 'maintenance_windows', cols: ['maintenance_id', 'location_id', 'title', 'notes', ['starts_at', ts], ['ends_at', ts], 'created_by', ['announced', bool], ['created_at', ts]] },
  { table: 'notifications', cols: ['notification_id', 'user_id', 'type', 'title', 'body', 'entity_type', 'entity_id', ['is_read', bool], ['created_at', ts]] },
  { table: 'insights', cols: ['insight_id', 'kind', 'location_id', 'severity', 'message', 'data_json', ['is_active', bool], ['created_at', ts], ['updated_at', ts]] },
  { table: 'activity_logs', cols: ['log_id', 'actor_id', 'action', 'entity_type', 'entity_id', 'meta_json', ['created_at', ts]] },
  { table: 'internet_tests', cols: ['test_id', 'user_id', 'provider', 'campus_name', 'scope', 'download_mbps', 'upload_mbps', 'ping_ms', 'jitter_ms', ['tested_at', ts]] },
];

async function main() {
  const force = process.argv.includes('--force');
  const cfg = loadConfig();
  const sqliteFile = path.resolve(ROOT, process.env.SQLITE_PATH ?? 'data/campus-wifi.db');
  if (!existsSync(sqliteFile)) throw new Error(`No SQLite database at ${sqliteFile}. Set SQLITE_PATH to point at it.`);

  const sqlite = new Database(sqliteFile, { readonly: true, fileMustExist: true });
  const pg = openDatabase(cfg.databaseUrl, { max: 1 });
  try {
    const applied = await migrate(pg);
    if (applied.length) console.log(`Applied schema: ${applied.join(', ')}`);

    const sqliteTables = new Set((sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as Array<{ name: string }>).map((r) => r.name));
    const counts: Array<[string, number]> = [];

    await pg.transaction(async () => {
      const existing = (await pg.query<{ n: number }>('SELECT (SELECT COUNT(*) FROM users) + (SELECT COUNT(*) FROM locations) AS n')).rows[0]!.n;
      if (existing > 0) {
        if (!force) throw new Error('The Postgres database already contains users/locations. Nothing was copied. Re-run with --force to wipe it and copy again.');
        for (const { table } of [...TABLES].reverse()) await pg.query(`DELETE FROM ${table}`);
        console.log('Wiped existing Postgres data (--force).');
      }

      for (const { table, cols, order } of TABLES) {
        if (!sqliteTables.has(table)) {
          console.log(`  ${table.padEnd(20)} not in SQLite file, skipped`);
          continue;
        }
        const names = cols.map((c) => (typeof c === 'string' ? c : c[0]));
        const available = new Set((sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name));
        const selected = names.filter((n) => available.has(n)); // older SQLite files may lack later columns
        const rows = sqlite.prepare(`SELECT ${selected.join(', ')} FROM ${table} ORDER BY ${order ?? 'rowid'}`).all() as Record<string, unknown>[];
        const converted = rows.map((r) => {
          const out: Record<string, unknown> = {};
          for (const c of cols) {
            const [name, fn] = typeof c === 'string' ? [c, undefined] : c;
            if (!available.has(name)) continue;
            out[name] = fn ? fn(r[name]) : r[name];
          }
          return out;
        });
        await bulkInsert(pg, table, converted);
        counts.push([table, converted.length]);
        console.log(`  ${table.padEnd(20)} ${converted.length} rows`);
      }
      // complaint_events.seq got explicit values; move its sequence past them.
      await pg.query(`SELECT setval(pg_get_serial_sequence('complaint_events', 'seq'), GREATEST((SELECT MAX(seq) FROM complaint_events), 1))`);

      // Settings: SQLite values win over the defaults written at startup.
      if (sqliteTables.has('settings')) {
        const settings = (sqlite.prepare('SELECT key, value_json, updated_at FROM settings').all() as Array<Record<string, unknown>>).map((s) => ({ ...s, updated_at: ts(s.updated_at) }));
        await bulkInsert(pg, 'settings', settings, 'ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = EXCLUDED.updated_at');
        console.log(`  ${'settings'.padEnd(20)} ${settings.length} rows`);
      }

      // Verify before committing: every table must hold exactly what SQLite had.
      for (const [table, n] of counts) {
        const got = (await pg.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM ${table}`)).rows[0]!.n;
        if (got !== n) throw new Error(`Row count mismatch in ${table}: SQLite ${n}, Postgres ${got}. Rolled back.`);
      }
    });
    console.log(`\nCopied ${sqliteFile} into Postgres. Row counts verified.`);
  } finally {
    sqlite.close();
    await pg.close();
  }
}

main().catch((err) => {
  console.error('Data migration failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
