import type { QueryResultRow } from 'pg';
import type { Db, QueryParam } from './connection';

/**
 * Adapter that lets repositories keep their SQLite-era call style
 * (`db.prepare(sql).get/all/run` with `?` or `@name` placeholders) while
 * executing on Postgres.
 *
 * Why this exists: the repositories are the largest surface in the app, and the
 * behaviour they encode (filters, ordering, business rules) must not change
 * during the storage migration. Translating the call shape here means the
 * SQL dialect differences are fixed in exactly one place.
 *
 * Known translations applied here:
 *   `?` / `@name` / `:name`  -> positional `$1, $2, …`
 *   `@name` object bindings   -> ordered value array
 *   boolean-ish `= 1` / `= 0` -> `= TRUE` / `= FALSE`
 *   `.changes`                -> Postgres `rowCount`
 *
 * Dialect differences that cannot be translated mechanically (julianday, printf,
 * json_extract, rowid, COLLATE NOCASE, INSERT OR IGNORE) are rewritten in the
 * repositories themselves.
 */
type Bindings = Record<string, unknown>;
/** Arguments accepted by get/all/run: one named-bind object, one positional array, or spread values. */
type Args = unknown[];

export class Statement {
  constructor(
    private readonly db: Db,
    private readonly sql: string,
  ) {}

  private compile(bind?: Bindings | unknown[]): { text: string; values: QueryParam[] } {
    const named = new Map<string, QueryParam>();
    const values: QueryParam[] = [];
    let anonymousIndex = 0;

    // PostgreSQL casts (`::int`, `::text`) must not be read as `:name` bindings, so
    // only a colon that is not part of a `::` cast and is followed by an identifier
    // counts as a placeholder.
    const PLACEHOLDER = /\$(\d+)|@([A-Za-z_]\w*)|(?<!::)(?<!:):([A-Za-z_]\w*)|\?/g;
    const compiled = this.sql.replace(PLACEHOLDER, (_match, positional: string | undefined, at: string | undefined, colon: string | undefined) => {
      const key = at ?? colon;
      if (key) {
        if (named.has(key)) return `$${values.push(named.get(key)!)}`;
        if (!bind || Array.isArray(bind) || !(key in bind)) {
          throw new Error(`Missing bind value for @${key} in: ${this.sql}`);
        }
        const value = toParam(bind[key]);
        named.set(key, value);
        return `$${values.push(value)}`;
      }
      if (positional) {
        // Re-number any pre-existing $n so appended params cannot collide.
        return `$${positional}`;
      }
      if (bind === undefined) throw new Error('A ? placeholder has no bound value.');
      // A bare value (string/number/boolean/Date) is the single positional argument.
      if (!Array.isArray(bind) && !(bind && typeof bind === 'object' && !(bind instanceof Date))) {
        return `$${values.push(toParam(bind))}`;
      }
      if (!Array.isArray(bind)) throw new Error('Positional ? parameters require an array of values.');
      const value = bind[anonymousIndex++];
      return `$${values.push(toParam(value))}`;
    });

    return { text: normalizeDialect(compiled), values };
  }

  async get<T extends QueryResultRow = QueryResultRow>(...args: Args): Promise<T | undefined> {
    const { text, values } = this.compile(spread(args));
    const { rows } = await this.db.query<T>(text, values);
    return rows[0];
  }

  async all<T extends QueryResultRow = QueryResultRow>(...args: Args): Promise<T[]> {
    const { text, values } = this.compile(spread(args));
    const { rows } = await this.db.query<T>(text, values);
    return rows;
  }

  async run(...args: Args): Promise<{ changes: number }> {
    const { text, values } = this.compile(spread(args));
    const { rowCount } = await this.db.query(text, values);
    return { changes: rowCount };
  }
}

/**
 * Repositories call `.all(bindObject)` and also `.all(...values)` (spread).
 * Normalise both shapes into one argument for `compile`. An object is always a
 * named-bind map; arrays and bare values are positional.
 */
function toParam(v: unknown): QueryParam {
  if (v === undefined) return null;
  return v as QueryParam;
}

function spread(args: unknown[]): Bindings | unknown[] | undefined {
  if (args.length === 0) return undefined;
  const [first] = args;
  if (args.length === 1) return Array.isArray(first) ? first : (first as Bindings);
  return args;
}

/**
 * Postgres-only rewrites for SQLite dialect that survives in repository SQL.
 * Applied to every statement so behaviour stays consistent across call sites.
 */
function normalizeDialect(sql: string): string {
  let out = sql;
  // `INSERT OR IGNORE INTO …` → `INSERT INTO … ON CONFLICT DO NOTHING`
  if (/INSERT\s+OR\s+IGNORE\s+INTO/i.test(out)) {
    out = out.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO');
    if (!/ON\s+CONFLICT/i.test(out)) out = `${out.trimEnd().replace(/;$/, '')} ON CONFLICT DO NOTHING`;
  }
  // 0/1 flag columns are booleans in Postgres. `account_status`/`role` are text and keep their literals.
  return out
    .replace(/\b(current_stale|is_active|is_seed|during_maintenance|is_read|announced)\s*=\s*1\b/gi, '$1 = TRUE')
    .replace(/\b(current_stale|is_active|is_seed|during_maintenance|is_read|announced)\s*=\s*0\b/gi, '$1 = FALSE');
}

/** Postgres wrapper used by repositories: adds `.prepare()` back onto the Db. */
export interface CompatDb extends Db {
  prepare(sql: string): Statement;
  exec(sql: string): Promise<void>;
  /** Replaced by real transactions; kept so callers read naturally. */
  transaction<T>(fn: (tx: CompatDb) => Promise<T>): Promise<T>;
}

export function asCompat(db: Db): CompatDb {
  const compat: CompatDb = {
    query: (text, params) => db.query(text, params),
    prepare: (sql) => new Statement(db, sql),
    exec: async (sql) => {
      await db.query(sql);
    },
    // Queries issued anywhere inside `fn` join the transaction (see connection.ts).
    transaction: (fn) => db.transaction(() => fn(compat)),
    close: () => db.close(),
  };
  return compat;
}