import react from '@vitejs/plugin-react-swc';
import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

// Public test scope: the exported tree only. Excludes the private-only
// modules (self-host server and client, MCP, the closed-loop worklist) and
// their tests, so the same command passes in the private repo (no Postgres,
// no self-host infra) and in the exported public repo, where the excluded
// files are absent and the exclude patterns simply match nothing.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'scripts/guards/**/*.test.mjs',
      'scripts/collect/**/*.test.mjs',
      'scripts/telemetry/aggregate.test.mjs',
      'scripts/telemetry/extract.test.mjs',
      'scripts/telemetry/resolve.test.mjs',
    ],
    exclude: [
      'node_modules',
      'dist',
      'src/server/**',
      'src/mcp/**',
      'src/data/recommend.test.ts',
      'src/data/interventions.test.ts',
      'src/data/LocalServerDataSource.test.ts',
      'src/data/DataSource.parity.test.ts',
      'src/data/index.test.ts',
      'src/services/SelfHostAuthService.test.ts',
    ],
    setupFiles: ['./src/__tests__/setup.ts'],
  },
});
