import type { Db } from '../../../infrastructure/db/connection';

export class SettingsRepo {
  constructor(private db: Db) {}
  get<T>(key: string): T | null {
    const r = this.db.prepare('SELECT value_json FROM settings WHERE key = ?').get(key) as { value_json: string } | undefined;
    return r ? (JSON.parse(r.value_json) as T) : null;
  }
  set(key: string, value: unknown, at: string) {
    this.db
      .prepare(
        `INSERT INTO settings(key, value_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
      )
      .run(key, JSON.stringify(value), at);
  }
  all(): Array<{ key: string; value: unknown; updated_at: string }> {
    return (this.db.prepare('SELECT * FROM settings ORDER BY key').all() as any[]).map((r) => ({
      key: r.key,
      value: JSON.parse(r.value_json),
      updated_at: r.updated_at,
    }));
  }
}
