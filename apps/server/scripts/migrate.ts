/** npm run migrate — applies migrations-postgres/*.sql to DATABASE_URL (idempotent). */
import { loadConfig } from '../src/config';
import { openDatabase } from '../src/infrastructure/db/connection';
import { migrate } from '../src/infrastructure/db/migrate';

async function main() {
  const cfg = loadConfig();
  const db = openDatabase(cfg.databaseUrl, { max: 1 });
  try {
    const applied = await migrate(db);
    console.log(applied.length ? `Applied migrations: ${applied.join(', ')}` : 'Database is up to date.');
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
