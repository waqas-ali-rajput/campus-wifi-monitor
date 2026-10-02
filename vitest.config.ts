import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@campus/shared': path.resolve(__dirname, 'packages/shared/src/index.ts') } },
  test: {
    include: ['packages/**/__tests__/**/*.test.ts', 'apps/server/tests/**/*.test.ts', 'apps/web/src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
  },
});
