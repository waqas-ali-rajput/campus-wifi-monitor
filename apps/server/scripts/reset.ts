/** npm run reset — wipes every table in DATABASE_URL and re-seeds the demo data. Destructive! */
import { loadConfig } from '../src/config';
import { createContainer } from '../src/container';
import { seed } from './seed';

async function main() {
  const c = await createContainer(loadConfig());
  try {
    console.log('Deleting all data and re-seeding…');
    await seed(c, { force: true });
  } finally {
    c.sse.close();
    await c.db.close();
  }
}

main().catch((err) => {
  console.error('Reset failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
