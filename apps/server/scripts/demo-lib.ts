import { loadConfig } from '../src/config';
import { createContainer } from '../src/container';

export function demoContainer() {
  const c = createContainer(loadConfig({}));
  const students = (c.db.prepare(`SELECT user_id, name FROM users WHERE role = 'user' AND account_status = 'active' ORDER BY email`).all() as any[]);
  if (!students.length) {
    console.error('No student accounts found. Run "npm run seed" first.');
    process.exit(1);
  }
  return { c, students };
}

export function argLocation(c: ReturnType<typeof demoContainer>['c'], fallback = 'Library Floor 2') {
  const i = process.argv.indexOf('--location');
  const name = i >= 0 ? process.argv.slice(i + 1).filter((a) => !a.startsWith('--')).join(' ') : fallback;
  const loc = c.repos.locations.byName(name);
  if (!loc) {
    console.error(`Unknown location "${name}". Known: ${c.repos.locations.all().map((l) => l.location_name).join(', ')}`);
    process.exit(1);
  }
  return loc;
}
