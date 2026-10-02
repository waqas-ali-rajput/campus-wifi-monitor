import { existsSync, rmSync } from 'node:fs';
import { loadConfig } from '../src/config';
import { createContainer } from '../src/container';
import { seed } from './seed';

const cfg = loadConfig();
for (const suffix of ['', '-wal', '-shm']) {
  const f = cfg.dbPath + suffix;
  if (existsSync(f)) rmSync(f);
}
console.log('Deleted the database. Migrating and seeding…');
const c = createContainer(cfg);
seed(c);
c.sse.close();
c.db.close();
