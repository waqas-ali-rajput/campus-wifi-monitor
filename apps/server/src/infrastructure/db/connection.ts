import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool, types, type PoolClient, type QueryResultRow } from 'pg';

// node-postgres returns NUMERIC as a string to avoid precision loss. Every numeric
// column here is a measurement (speeds, scores, timings), so numbers are correct here.
types.setTypeParser(types.builtins.NUMERIC, (value: string) => Number.parseFloat(value));
// int8 (e.g. COUNT(*)) likewise fits safely in a JS number at our scale.
types.setTypeParser(types.builtins.INT8, (value: string) => Number.parseInt(value, 10));
// The whole codebase (DTOs, DTO comparisons, SQLite-era SQL) exchanges timestamps as
// ISO strings, so timestamptz is parsed back to that exact shape. This is what keeps
// the repository/service layer identical across the SQLite → Postgres migration.
// Flag columns are real booleans in Postgres, but the API contract (shared DTOs, web app)
// and the service code are built around SQLite's 0/1 integers. Returning 0/1 keeps every
// response byte-identical to the SQLite version. Writes accept 0/1 or true/false alike.
types.setTypeParser(types.builtins.BOOL, (value: string) => (value === 't' ? 1 : 0));
const toIso = (value: string) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toISOString();
};
types.setTypeParser(types.builtins.TIMESTAMPTZ, toIso);
// Plain `timestamp` has no zone; every value this app writes is UTC.
types.setTypeParser(types.builtins.TIMESTAMP, (value: string) => toIso(`${value}Z`));

export type QueryParam = string | number | boolean | null | Date;

export interface Db {
  query<T extends QueryResultRow = QueryResultRow>(text: string, params?: QueryParam[]): Promise<{ rows: T[]; rowCount: number }>;
  /** Runs `fn` inside a transaction. Any `query` on this same `Db` inside `fn` joins that transaction. */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}


/**
 * The transaction currently in scope, if any.
 *
 * Repositories are constructed once with a single `Db` and have no way to receive a
 * scoped client, so `db.tx(fn)` binds one here. Every `query` issued inside `fn` then
 * transparently runs on that client — which is what makes multi-repository writes
 * (test submission, complaint creation) genuinely atomic rather than best-effort.
 */
const txScope = new AsyncLocalStorage<PoolClient>();

/**
 * Connection factory. Uses a pooled `DATABASE_URL` so many serverless invocations
 * share one managed Postgres instead of a per-instance SQLite file.
 */
export function openDatabase(connectionString = process.env.DATABASE_URL, opts: { max?: number } = {}): Db {
  if (!connectionString) throw new Error('DATABASE_URL is not configured. Set it to your Neon connection string (see .env.example).');
  const max = opts.max ?? Number(process.env.PG_POOL_MAX ?? 10);
  const pool = new Pool({ connectionString, max, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 15_000 });
  // Neon closes idle connections (and suspends idle computes). An error on an idle pooled
  // client is emitted on the pool; without a listener Node would crash the whole process.
  pool.on('error', (err) => console.error('[db] idle connection error (will reconnect):', err.message));

  const run = async <T extends QueryResultRow>(client: Pool | PoolClient, text: string, params: QueryParam[]) => {
    const raw = await client.query<T>(text, params);
    // A multi-statement script (migrations) yields one result per statement; report the last.
    const result = Array.isArray(raw) ? raw[raw.length - 1] : raw;
    const rows = (result?.rows ?? []) as T[];
    return { rows, rowCount: result?.rowCount ?? rows.length };
  };

  const db: Db = {
    async query<T extends QueryResultRow = QueryResultRow>(text: string, params: QueryParam[] = []) {
      const scoped = txScope.getStore();
      return run<T>(scoped ?? pool, text, params);
    },
    async transaction<T>(fn: () => Promise<T>): Promise<T> {
      // A nested tx joins the outer transaction; Postgres has no real nesting.
      if (txScope.getStore()) return fn();
      const client: PoolClient = await pool.connect();
      try {
        await client.query('BEGIN');
        const out = await txScope.run(client, fn);
        await client.query('COMMIT');
        return out;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
  return db;
}