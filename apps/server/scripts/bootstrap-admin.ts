/**
 * One-time bootstrap for a fresh deployment (`npm run bootstrap-admin`).
 *
 * Creates the demo staff accounts (admin, manager, IT) plus one student, each
 * with its own password supplied via environment variables. Existing accounts
 * are never modified, so re-running cannot reset a real password.
 *
 * Usage (from Render Shell or your terminal):
 *   BOOTSTRAP_ADMIN_PASSWORD=... BOOTSTRAP_MANAGER_PASSWORD=... \
 *   BOOTSTRAP_IT_PASSWORD=... BOOTSTRAP_STUDENT_PASSWORD=... npm run bootstrap-admin
 *
 * Missing passwords cause the command to exit without creating anything, so no
 * account can end up with a guessable credential.
 */
import { loadConfig } from '../src/config';
import { createContainer } from '../src/container';
import { hashPassword } from '../src/infrastructure/security/security';

interface BootstrapAccount {
  env: string;
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'it_staff' | 'user';
}

const ACCOUNTS: BootstrapAccount[] = [
  {
    env: 'BOOTSTRAP_ADMIN_PASSWORD',
    id: 'u-admin',
    name: 'Imran Qureshi',
    email: 'admin@campus.local',
    role: 'admin',
  },
  {
    env: 'BOOTSTRAP_MANAGER_PASSWORD',
    id: 'u-manager',
    name: 'Nadia Hussain',
    email: 'manager@campus.local',
    role: 'manager',
  },
  {
    env: 'BOOTSTRAP_IT_PASSWORD',
    id: 'u-it1',
    name: 'Kamran Javed',
    email: 'it1@campus.local',
    role: 'it_staff',
  },
  {
    env: 'BOOTSTRAP_IT2_PASSWORD',
    id: 'u-it2',
    name: 'Saima Akhtar',
    email: 'it2@campus.local',
    role: 'it_staff',
  },
  {
    env: 'BOOTSTRAP_STUDENT_PASSWORD',
    id: 'u-student01',
    name: 'Ayesha Khan',
    email: 'student01@campus.local',
    role: 'user',
  },
];

const missing = ACCOUNTS.filter((a) => !process.env[a.env]);
if (missing.length) {
  console.error(`Missing required password variables: ${missing.map((m) => m.env).join(', ')}`);
  console.error('Nothing was created. Set a unique password for each account and run again.');
  process.exit(1);
}

async function main() {
  const cfg = loadConfig();
  const c = await createContainer(cfg);

  for (const account of ACCOUNTS) {
    if (await c.repos.users.byEmail(account.email)) {
      console.log(`Skipped ${account.email} (already exists) — password unchanged.`);
      continue;
    }
    await c.repos.users.insert({
      user_id: account.id,
      name: account.name,
      email: account.email,
      password_hash: hashPassword(process.env[account.env]!),
      role: account.role,
      created_at: new Date().toISOString(),
    });
    console.log(`Created ${account.role}: ${account.email}`);
  }

  console.log('\nDone. Change these passwords in the app, or delete the accounts you do not need.');
  c.sse.close();
  await c.db.close();
}

main().catch((err) => {
  console.error('Bootstrap failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
