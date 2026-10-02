import { loadConfig } from '../src/config';
import { openDatabase } from '../src/infrastructure/db/connection';
import { migrate } from '../src/infrastructure/db/migrate';

const cfg = loadConfig();
const db = openDatabase(cfg.dbPath);
const applied = migrate(db);
console.log(applied.length ? `Applied migrations: ${applied.join(', ')}` : 'Database is up to date.');
console.log(`Database: ${cfg.dbPath}`);
db.close();
