import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const executablePath = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

/** Runs against `npm start` with a fresh seeded DB in quick speed-test mode. */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  use: { baseURL: 'http://localhost:3100', launchOptions: { executablePath } },
  webServer: {
    command: 'npx tsx ../server/scripts/reset.ts && node ../server/dist/index.js', // fresh seeded DB, then the built app
    url: 'http://localhost:3100/api/health',
    reuseExistingServer: false,
    env: { PORT: '3100', DB_PATH: './data/e2e.db', SPEEDTEST_QUICK: 'true', DISABLE_RATE_LIMIT: 'true', LOG_LEVEL: 'warn' },
  },
});
