/**
 * @gcoredev/fastedge-test/vitest: a vitest `test` with FastEdge fixtures.
 *
 *   import { test } from '@gcoredev/fastedge-test/vitest';
 *   import { expect } from 'vitest';
 *
 *   test('counts requests', async ({ runner, stores }) => {
 *     const app = await runner('dist/app.wasm');
 *     await app.callFullFlow('built-in', 'GET', {}, '', {}, true);
 *     expect(stores.cache.get('hits')).toBe('1');
 *   });
 *
 * - `stores`: this test's own cache and Edge KV, in memory, seeded from `fixtures/stores/`.
 *   Gone when the test ends. To share across tests on purpose (an ordered journey), use
 *   `createStores()` in `beforeAll` and pass it as `RunnerConfig.stores`.
 * - `runner(wasm, config?)`: a loaded runner (path or buffer) on this test's stores, cleaned up
 *   when the test ends. CDN and HTTP runners of one test share the stores.
 */

import { test as base } from "vitest";
import { createRunner, createRunnerFromBuffer } from "../runner/standalone.js";
import type { IWasmRunner, RunnerConfig } from "../runner/IWasmRunner.js";
import { createStores, type TestStores } from "../stores/testStores.js";

export { createStores };
export type { TestStores };

export type FastEdgeFixtures = {
  stores: TestStores;
  runner: (wasm: string | Buffer, config?: RunnerConfig) => Promise<IWasmRunner>;
};

export const test = base.extend<FastEdgeFixtures>({
  // eslint-disable-next-line no-empty-pattern -- vitest reads fixture dependencies from the pattern
  stores: async ({}, use) => {
    const stores = await createStores();
    try {
      await use(stores);
    } finally {
      await stores.close();
    }
  },
  runner: async ({ stores }, use) => {
    const made: IWasmRunner[] = [];
    try {
      await use(async (wasm, config = {}) => {
        const withStores = { ...config, stores: config.stores ?? stores };
        const runner =
          typeof wasm === "string" ? await createRunner(wasm, withStores) : await createRunnerFromBuffer(wasm, withStores);
        made.push(runner);
        return runner;
      });
    } finally {
      await Promise.all(made.map((r) => r.cleanup()));
    }
  },
});
