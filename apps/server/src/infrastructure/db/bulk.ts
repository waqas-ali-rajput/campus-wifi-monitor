import type { Db } from './connection';

type Row = Record<string, unknown>;

/**
 * Multi-row INSERT in chunks (Postgres allows 65,535 bind parameters per statement).
 * Seeding and the SQLite → Postgres copy write thousands of rows; one round trip per row
 * takes minutes against a remote Neon database, a handful of chunked statements take seconds.
 * Columns come from the first row; every row must have the same keys.
 */
export async function bulkInsert(db: Db, table: string, rows: Row[], onConflict = '') {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]!);
  const perChunk = Math.max(1, Math.floor(60000 / cols.length));
  for (let i = 0; i < rows.length; i += perChunk) {
    const chunk = rows.slice(i, i + perChunk);
    const values: unknown[] = [];
    const tuples = chunk.map((row) => `(${cols.map((col) => `$${values.push(row[col] ?? null)}`).join(',')})`);
    await db.query(`INSERT INTO ${table}(${cols.join(',')}) VALUES ${tuples.join(',')} ${onConflict}`, values as never);
  }
}
