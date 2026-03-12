import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['server/__tests__/integration/**/*.test.ts'],
    fileParallelism: false, // Run test files sequentially (HTTP WASM tests spawn heavy processes with 12MB binaries)
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
