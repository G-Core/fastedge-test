/**
 * HTTP apps (fastedge-run) and CDN apps share the cache and Edge KV through the storage service.
 *
 * Needs a fastedge-run that forwards to the service (FastEdge-lib `feat/stores-forward`, not
 * released yet): run with FASTEDGE_TEST_STORES_E2E=1 and FASTEDGE_RUN_PATH=<that build>.
 * Remove the gate when .fastedge-cli-version moves to a release with it.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRunnerFromBuffer } from '../../../../runner/standalone';
import type { IWasmRunner } from '../../../../runner/IWasmRunner';

const WASM = resolve(__dirname, '../../../../../wasm');
const runners: IWasmRunner[] = [];
let root: string;

async function runner(file: string, config: Parameters<typeof createRunnerFromBuffer>[1] = {}) {
  const r = await createRunnerFromBuffer(await readFile(join(WASM, file)), config);
  runners.push(r);
  return r;
}
const http = async (r: IWasmRunner, query: string) =>
  (await r.execute({ path: `/?${query}`, method: 'GET', headers: {} })).body;
const cdn = async (r: IWasmRunner, headers: Record<string, string>) =>
  (await r.callFullFlow('built-in', 'GET', headers, '', {}, true)).finalResponse.body;

describe.skipIf(!process.env.FASTEDGE_TEST_STORES_E2E)('HTTP + CDN apps share the stores', () => {
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'http-stores-'));
    mkdirSync(join(root, 'fixtures/stores/kv'), { recursive: true });
    writeFileSync(
      join(root, 'fixtures/stores/kv/users.json'),
      JSON.stringify({
        strings: { 'user:1': 'alice', 'user:2': 'bob' },
        zsets: { lb: [['alice', 10], ['amy', 9]] },
        bloom: { ips: ['1.2.3.4'] },
      }),
    );
    writeFileSync(join(root, 'fixtures/stores/kv/geo.json'), JSON.stringify({ strings: { k: 'fixture' } }));
    // A store named in .env.kv_stores keeps its own backend (here an unreachable Redis).
    writeFileSync(join(root, '.env.kv_stores'), 'geo=redis://127.0.0.1:1\n');
    process.env.FASTEDGE_STORES_ROOT = root;
  });

  afterAll(async () => {
    await Promise.all(runners.map((r) => r.cleanup()));
    delete process.env.FASTEDGE_STORES_ROOT;
  });

  it('an HTTP app and a CDN filter count on one cache', async () => {
    const h = await runner('http-apps/rust/wasi/stores.wasm', { runnerType: 'http-wasm' });
    const c = await runner('cdn-apps/rust/stores/stores.wasm');
    expect(await http(h, 'op=incr&key=shared')).toBe('1');
    expect(await cdn(c, { 'x-op': 'incr', 'x-key': 'shared' })).toBe('2');
    expect(await http(h, 'op=incr&key=shared')).toBe('3');
    expect(await http(h, 'op=set&key=from-http&value=hi')).toBe('ok');
    expect(await cdn(c, { 'x-op': 'get', 'x-key': 'from-http' })).toBe('len:2:hi');
  });

  it('an HTTP app reads the fixture KV stores; unlisted stores are denied', async () => {
    const h = await runner('http-apps/rust/wasi/stores.wasm', { runnerType: 'http-wasm' });
    expect(await http(h, 'op=kv-get&store=users&key=user:1')).toBe('alice');
    expect(await http(h, 'op=kv-scan&store=users&pattern=user:*')).toBe('user:1,user:2');
    expect(await http(h, 'op=kv-zrange&store=users&key=lb&min=9.5')).toBe('alice=10');
    expect(await http(h, 'op=kv-bf&store=users&key=ips&item=1.2.3.4')).toBe('true');
    expect(await http(h, 'op=kv-get&store=nope&key=k')).toBe('err:Error::AccessDenied');
    // The edge's messages (probe P7)
    expect(await http(h, 'op=kv-get&store=users&key=lb')).toBe(
      'err:Error::Other("ERR: Invalid argument: WRONGTYPE Operation against a key holding the wrong kind of value")',
    );
    expect(await http(h, 'op=kv-zrange&store=users&key=lb&min=5&max=1')).toBe('err:Error::Other("ERR: min > max")');
    expect(await http(h, 'op=kv-scan&store=users&pattern=user%5D')).toBe('err:Error::InternalError');
  });

  it('a .env.kv_stores entry wins over the fixture store of the same name', async () => {
    const h = await runner('http-apps/rust/wasi/stores.wasm', {
      runnerType: 'http-wasm',
      dotenv: { enabled: true, path: root },
    });
    expect(await http(h, 'op=kv-get&store=geo&key=k')).not.toBe('fixture');
  });

  it('dc separates HTTP buckets too', async () => {
    const h = await runner('http-apps/rust/wasi/stores.wasm', { runnerType: 'http-wasm', dc: 'ams' });
    expect(await http(h, 'op=incr&key=shared')).toBe('1');
  });
});
