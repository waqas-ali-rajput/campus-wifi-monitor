import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { openDatabase, type Db } from '../src/infrastructure/db/connection';

/**
 * Integration tests run against a real Postgres. They use TEST_DATABASE_URL — deliberately not
 * DATABASE_URL, because the tests seed with --force semantics. Each run gets its own throwaway
 * schema, so a shared database (e.g. a Neon dev branch) is never touched outside it.
 * Use a direct (non "-pooler") connection string: the schema is selected via a startup option.
 */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

export async function openTestDatabase(): Promise<{ db: Db; drop: () => Promise<void> }> {
  if (!TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is not set.');
  const schema = `test_${randomBytes(5).toString('hex')}`;
  const admin = new Client({ connectionString: TEST_DATABASE_URL });
  await admin.connect();
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();

  const url = new URL(TEST_DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${schema},public`);
  const db = openDatabase(url.toString(), { max: 4 });
  return {
    db,
    drop: async () => {
      await db.close();
      const c = new Client({ connectionString: TEST_DATABASE_URL });
      await c.connect();
      await c.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await c.end();
    },
  };
}
