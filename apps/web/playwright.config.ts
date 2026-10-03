import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const executablePath = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

/**
 * Runs against `npm start` with a freshly seeded database in quick speed-test mode.
 * `npm run reset` WIPES the database, so this uses E2E_DATABASE_URL (a throwaway Neon branch or
 * local Postgres) and refuses to start without it rather than touching DATABASE_URL.
 */
const e2eDb = process.env.E2E_DATABASE_URL;
if (!e2eDb) throw new Error('Set E2E_DATABASE_URL to a disposable Postgres database (it is wiped and re-seeded).');
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  use: { baseURL: 'http://localhost:3100', launchOptions: { executablePath } },
  webServer: {
    command: 'npx tsx ../server/scripts/reset.ts && node ../server/dist/index.js', // fresh seeded DB, then the built app
    url: 'http://localhost:3100/api/health',
    reuseExistingServer: false,
    env: { PORT: '3100', DATABASE_URL: e2eDb, SPEEDTEST_QUICK: 'true', DISABLE_RATE_LIMIT: 'true', LOG_LEVEL: 'warn' },
  },
});
