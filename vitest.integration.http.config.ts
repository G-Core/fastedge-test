import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Vitest config for HTTP WASM (component model) integration tests
 * These tests run sequentially due to heavy process spawning (12MB WASM binaries)
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['server/__tests__/integration/http-apps/**/*.test.ts'],
    fileParallelism: false, // Run test files sequentially (HTTP WASM tests spawn heavy processes)
    testTimeout: 30000, // HTTP WASM tests spawn processes and need more time
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
