import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStores, type TestStores } from '../../../stores/testStores';
import { call } from '../../../stores/StoresManager';

const opened: TestStores[] = [];
const open = async (...args: Parameters<typeof createStores>) => {
  const s = await createStores(...args);
  opened.push(s);
  return s;
};
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(opened.splice(0).map((s) => s.close()));
});

function fixturesRoot() {
  const root = mkdtempSync(join(tmpdir(), 'test-stores-'));
  mkdirSync(join(root, 'fixtures/stores/kv'), { recursive: true });
  mkdirSync(join(root, 'fixtures/stores/cache'), { recursive: true });
  writeFileSync(join(root, 'fixtures/stores/kv/users.json'), JSON.stringify({ strings: { 'user:1': 'alice' } }));
  writeFileSync(join(root, 'fixtures/stores/cache/local.json'), JSON.stringify({ warm: { value: 'yes' } }));
  return root;
}
const kvGet = (s: TestStores, store: string, key: string) =>
  call({ port: Number(new URL(s.url).port), token: s.token }, '/v1/kv', { op: 'get', store, key });

describe('createStores', () => {
  it('is seeded from fixtures and isolated from other instances', async () => {
    const root = fixturesRoot();
    const [a, b] = [await open({ fixtures: root }), await open({ fixtures: root })];
    expect(a.cache.get('warm')).toBe('yes');
    expect(await kvGet(a, 'users', 'user:1')).toBe(Buffer.from('alice').toString('base64'));
    a.cache.set('n', '1');
    expect(a.cache.get('n')).toBe('1');
    expect(b.cache.get('n')).toBeNull();
    expect(a.url).not.toBe(b.url);
  });

  it('seed adds stores and cache keys; reset goes back to the fixtures', async () => {
    const s = await open({ fixtures: fixturesRoot() });
    s.seed({ kv: { geo: { strings: { k: 'v' } } }, cache: { ams: { hot: { value: '1' } } } });
    expect(await kvGet(s, 'geo', 'k')).toBe(Buffer.from('v').toString('base64'));
    expect(await kvGet(s, 'users', 'user:1')).not.toBeNull(); // other stores kept
    expect(s.cache.get('hot', { dc: 'ams' })).toBe('1');
    s.reset();
    expect(s.cache.get('hot', { dc: 'ams' })).toBeNull();
    expect(s.cache.get('warm')).toBe('yes');
    await expect(call({ port: Number(new URL(s.url).port), token: s.token }, '/v1/kv', { op: 'open', store: 'geo' })).rejects.toThrow(
      'access-denied',
    );
  });

  it('advanceClock expires entries; dc and fixtures: false', async () => {
    const s = await open({ fixtures: false, dc: 'ams' });
    expect(s.dc).toBe('ams');
    vi.useFakeTimers({ toFake: ['Date'] }); // only the service clock moves
    s.cache.set('t', 'v', { ttlMs: 1000 });
    s.advanceClock(999);
    expect(s.cache.get('t')).toBe('v');
    s.advanceClock(1);
    expect(s.cache.get('t')).toBeNull();
    expect(s.cache.get('warm')).toBeNull();
  });
});
