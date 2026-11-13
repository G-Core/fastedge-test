/**
 * Isolated test stores (phase 2): createStores, runTestSuite's per-test stores, and the
 * @gcoredev/fastedge-test/vitest fixtures, with the Rust cdn-stores app.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRunnerFromBuffer } from '../../../../runner/standalone';
import type { IWasmRunner } from '../../../../runner/IWasmRunner';
import { createStores, type TestStores } from '../../../../stores/testStores';
import { runTestSuite } from '../../../../test-framework/suite-runner';
import { test } from '../../../../test-framework/vitest';

const WASM = resolve(__dirname, '../../../../../wasm/cdn-apps/rust/stores/stores.wasm');
let wasm: Buffer;

const op = async (r: IWasmRunner, headers: Record<string, string>) =>
  (await r.callFullFlow('built-in', 'GET', headers, '', {}, true)).finalResponse.body;
const incr = (r: IWasmRunner) => op(r, { 'x-op': 'incr', 'x-key': 'n' });

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), 'test-stores-int-'));
  mkdirSync(join(root, 'fixtures/stores/kv'), { recursive: true });
  writeFileSync(join(root, 'fixtures/stores/kv/users.json'), JSON.stringify({ strings: { 'user:1': 'alice' } }));
  process.env.FASTEDGE_STORES_ROOT = root;
  wasm = await readFile(WASM);
});
afterAll(() => {
  delete process.env.FASTEDGE_STORES_ROOT;
});

describe('createStores with runners', () => {
  it('runners on one instance share it; another instance is separate; helpers see app writes', async () => {
    const [s1, s2] = [await createStores(), await createStores()];
    const runners = await Promise.all([
      createRunnerFromBuffer(wasm, { stores: s1 }),
      createRunnerFromBuffer(wasm, { stores: s1 }),
      createRunnerFromBuffer(wasm, { stores: s2 }),
    ]);
    try {
      expect(await incr(runners[0])).toBe('1');
      expect(await incr(runners[1])).toBe('2');
      expect(await incr(runners[2])).toBe('1');
      expect(s1.cache.get('n')).toBe('2');
      s1.cache.set('greeting', 'hi');
      expect(await op(runners[0], { 'x-op': 'get', 'x-key': 'greeting' })).toBe('len:2:hi');
      expect(await op(runners[0], { 'x-op': 'kv-get', 'x-store': 'users', 'x-key': 'user:1' })).toBe('alice');
    } finally {
      await Promise.all(runners.map((r) => r.cleanup()));
      await Promise.all([s1.close(), s2.close()]);
    }
  });
});

describe('runTestSuite', () => {
  it('gives every test its own stores', async () => {
    const seen: string[] = [];
    const result = await runTestSuite({
      wasmBuffer: wasm,
      tests: [1, 2].map((i) => ({
        name: `test ${i}`,
        run: async (runner, { stores }) => {
          seen.push(await incr(runner));
          expect(stores!.cache.get('n')).toBe('1');
        },
      })),
    });
    expect(result.failed).toBe(0);
    expect(seen).toEqual(['1', '1']);
  });

  it('a suite-wide instance is shared on purpose', async () => {
    const shared: TestStores = await createStores();
    const seen: string[] = [];
    try {
      await runTestSuite({
        wasmBuffer: wasm,
        runnerConfig: { stores: shared },
        tests: [1, 2].map((i) => ({ name: `step ${i}`, run: async (runner) => void seen.push(await incr(runner)) })),
      });
    } finally {
      await shared.close();
    }
    expect(seen).toEqual(['1', '2']);
  });
});

describe('vitest fixtures', () => {
  test('stores and runner, first test', async ({ runner, stores }) => {
    const app = await runner(wasm);
    expect(await incr(app)).toBe('1');
    stores.advanceClock(1000);
    expect(stores.cache.get('n')).toBe('1');
  });

  test('a second test starts clean', async ({ runner, stores }) => {
    expect(stores.cache.get('n')).toBeNull();
    const [a, b] = [await runner(wasm), await runner(wasm)];
    expect(await incr(a)).toBe('1');
    expect(await incr(b)).toBe('2');
  });
});
