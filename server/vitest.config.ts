import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@musematch/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The integration tests exercise the real auth middleware through the dev
    // identity path, and NODE_ENV=test silences logging and rate limiting.
    env: {
      NODE_ENV: 'test',
      DEV_AUTH_BYPASS: 'true',
    },
    // Route tests share one Postgres database, so they must not interleave.
    fileParallelism: false,
  },
});
