import { loadConfig } from '../src/config';
import { createContainer, type Container } from '../src/container';

export async function demoContainer() {
  const c = await createContainer(loadConfig({}));
  const students = (
    await c.db.query<{ user_id: string; name: string }>(
      `SELECT user_id, name FROM users WHERE role = 'user' AND account_status = 'active' ORDER BY email`,
    )
  ).rows;
  if (!students.length) {
    console.error('No student accounts found. Run "npm run seed" first.');
    await c.db.close();
    process.exit(1);
  }
  return { c, students };
}

export async function argLocation(c: Container, fallback = 'Library Floor 2') {
  const i = process.argv.indexOf('--location');
  const name = i >= 0 ? process.argv.slice(i + 1).filter((a) => !a.startsWith('--')).join(' ') : fallback;
  const loc = await c.repos.locations.byName(name);
  if (!loc) {
    console.error(`Unknown location "${name}". Known: ${(await c.repos.locations.all()).map((l) => l.location_name).join(', ')}`);
    await c.db.close();
    process.exit(1);
  }
  return loc;
}

/** Runs a demo script and always releases the database pool. */
export function runDemo(main: () => Promise<void>) {
  main().catch((err) => {
    console.error('Failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
