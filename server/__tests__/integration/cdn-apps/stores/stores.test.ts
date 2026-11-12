/**
 * CDN apps' cache and Edge KV through the storage service (createRunner, stores on by default).
 * The stores root is a temp dir (FASTEDGE_STORES_ROOT) with KV fixtures.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRunnerFromBuffer } from '../../../../runner/standalone';
import type { IWasmRunner, RunnerConfig } from '../../../../runner/IWasmRunner';

const WASM = resolve(__dirname, '../../../../../wasm/cdn-apps/rust/stores/stores.wasm');
let wasm: Buffer;
const runners: IWasmRunner[] = [];

async function runner(config: RunnerConfig = {}) {
  const r = await createRunnerFromBuffer(wasm, config);
  runners.push(r);
  return r;
}

/** Run one store op (onRequestHeaders answers locally) and return the body. */
async function op(r: IWasmRunner, headers: Record<string, string>) {
  const result = await r.callFullFlow('built-in', 'GET', headers, '', {}, true);
  return result.finalResponse.body;
}

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), 'cdn-stores-'));
  mkdirSync(join(root, 'fixtures/stores/kv'), { recursive: true });
  writeFileSync(
    join(root, 'fixtures/stores/kv/users.json'),
    JSON.stringify({
      strings: { 'user:1': 'alice', 'user:2': 'bob', cfg: 'x' },
      zsets: { lb: [['alice', 10], ['bob', 7.5], ['amy', 9]] },
      bloom: { ips: ['1.2.3.4'] },
    }),
  );
  process.env.FASTEDGE_STORES_ROOT = root;
  wasm = await readFile(WASM);
});

afterAll(async () => {
  await Promise.all(runners.map((r) => r.cleanup()));
  delete process.env.FASTEDGE_STORES_ROOT;
});

describe('CDN stores: cache', () => {
  it('two runners share one cache bucket; another dc is separate', async () => {
    const [a, b, other] = await Promise.all([runner(), runner(), runner({ dc: 'ams' })]);
    expect(await op(a, { 'x-op': 'incr', 'x-key': 'shared' })).toBe('1');
    expect(await op(b, { 'x-op': 'incr', 'x-key': 'shared' })).toBe('2');
    expect(await op(other, { 'x-op': 'incr', 'x-key': 'shared' })).toBe('1');
  });

  it('set/get/exists/delete, empty values and TTL rules', async () => {
    const r = await runner();
    expect(await op(r, { 'x-op': 'get', 'x-key': 'k1' })).toBe('none');
    expect(await op(r, { 'x-op': 'set', 'x-key': 'k1', 'x-value': 'hello' })).toBe('ok');
    expect(await op(r, { 'x-op': 'get', 'x-key': 'k1' })).toBe('len:5:hello');
    expect(await op(r, { 'x-op': 'set', 'x-key': 'k1', 'x-value': '' })).toBe('ok');
    expect(await op(r, { 'x-op': 'get', 'x-key': 'k1' })).toBe('len:0:');
    expect(await op(r, { 'x-op': 'exists', 'x-key': 'k1' })).toBe('true');
    // TTL 0 = the default (not "expire now")
    expect(await op(r, { 'x-op': 'set', 'x-key': 'k0', 'x-value': 'v', 'x-ttl': '0' })).toBe('ok');
    expect(await op(r, { 'x-op': 'exists', 'x-key': 'k0' })).toBe('true');
    // u64::MAX is -1 as i64: BadArgument, which the SDK names AccessDenied (P4)
    expect(await op(r, { 'x-op': 'set', 'x-key': 'kn', 'x-value': 'v', 'x-ttl': '18446744073709551615' })).toBe(
      'err:AccessDenied',
    );
    expect(await op(r, { 'x-op': 'delete', 'x-key': 'k1' })).toBe('ok');
    expect(await op(r, { 'x-op': 'exists', 'x-key': 'k1' })).toBe('false');
  });

  it('incr errors, expire, purge-prefix and purge', async () => {
    const r = await runner({ dc: 'purge-test' });
    await op(r, { 'x-op': 'set', 'x-key': 'txt', 'x-value': 'abc' });
    expect(await op(r, { 'x-op': 'incr', 'x-key': 'txt' })).toBe('err:InternalError');
    expect(await op(r, { 'x-op': 'incr', 'x-key': 'n', 'x-delta': '-3' })).toBe('-3');
    expect(await op(r, { 'x-op': 'expire', 'x-key': 'missing', 'x-ttl': '1000' })).toBe('false');
    expect(await op(r, { 'x-op': 'expire', 'x-key': 'n', 'x-ttl': '18446744073709551615' })).toBe('true');
    await op(r, { 'x-op': 'set', 'x-key': 'pg*a', 'x-value': '1' });
    await op(r, { 'x-op': 'set', 'x-key': 'pgxa', 'x-value': '1' });
    expect(await op(r, { 'x-op': 'purge-prefix', 'x-prefix': 'pg*' })).toBe('1');
    expect(await op(r, { 'x-op': 'purge' })).toBe('3');
    expect(await op(r, { 'x-op': 'exists', 'x-key': 'n' })).toBe('false');
  });

  it('every hook of a full flow reaches the cache', async () => {
    const r = await runner();
    await r.callFullFlow('built-in', 'POST', { 'x-hooks': 'hooks:1' }, 'body', {}, true);
    expect(await op(r, { 'x-op': 'get', 'x-key': 'hooks:1' })).toBe('len:1:4');
  });
});

describe('CDN stores: Edge KV', () => {
  it('reads a fixture store', async () => {
    const r = await runner();
    const kv = (h: Record<string, string>) => op(r, { 'x-store': 'users', ...h });
    expect(await kv({ 'x-op': 'kv-get', 'x-key': 'user:1' })).toBe('alice');
    expect(await kv({ 'x-op': 'kv-get', 'x-key': 'nope' })).toBe('none');
    expect(await kv({ 'x-op': 'kv-scan', 'x-pattern': 'user:*' })).toBe('user:1,user:2');
    expect(await kv({ 'x-op': 'kv-zrange', 'x-key': 'lb', 'x-min': '8' })).toBe('amy=9,alice=10');
    expect(await kv({ 'x-op': 'kv-zscan', 'x-key': 'lb', 'x-pattern': 'a*' })).toBe('amy=9,alice=10');
    expect(await kv({ 'x-op': 'kv-bf', 'x-key': 'ips', 'x-item': '1.2.3.4' })).toBe('true');
    expect(await kv({ 'x-op': 'kv-bf', 'x-key': 'ips', 'x-item': '9.9.9.9' })).toBe('false');
  });

  it('a store without a fixture is not attached; a wrong-type key is a bad argument', async () => {
    const r = await runner();
    expect(await op(r, { 'x-op': 'kv-open', 'x-store': 'missing' })).toBe('err:AccessDenied');
    expect(await op(r, { 'x-op': 'kv-get', 'x-store': 'users', 'x-key': 'lb' })).toBe('err:Other("unexpected status: 2")');
  });
});

describe('CDN stores: off', () => {
  it('the app still loads; store calls fail with InternalFailure and log why', async () => {
    const r = await runner({ stores: false });
    const result = await r.callFullFlow('built-in', 'GET', { 'x-op': 'incr', 'x-key': 'n' }, '', {}, true);
    expect(result.finalResponse.body).toBe('err:InternalError');
    const logs = result.hookResults.onRequestHeaders.logs.map((l) => l.message);
    expect(logs.some((m) => m.includes('stores are off'))).toBe(true);
  });
});
