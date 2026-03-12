import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Vitest config for CDN app (proxy-wasm) integration tests
 * These tests can run in parallel as they don't spawn external processes
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['server/__tests__/integration/cdn-apps/**/*.test.ts'],
    // CDN tests can run in parallel (no heavy process spawning)
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['server/**/*.ts'],
      exclude: [
        'server/**/*.test.ts',
        'server/**/*.d.ts',
        'server/server.ts',
        'server/__tests__/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './server'),
    },
  },
});
