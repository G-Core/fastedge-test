/**
 * StoresManager: one service per stores root, shared by clients, gone after the last lease,
 * restarted (same port and token) after a crash. Spawns real service processes.
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { connectStores, call, type StoresConnection } from '../../../stores/StoresManager';
import { storesDir, type Descriptor } from '../../../stores/layout';

const opened: StoresConnection[] = [];
const connect = async (root: string) => {
  const c = await connectStores(root, { leaseTtlMs: 600 });
  opened.push(c);
  return c;
};
const descriptor = (root: string) =>
  JSON.parse(readFileSync(join(storesDir(root), 'service.json'), 'utf8')) as Descriptor;
const incr = (c: StoresConnection) =>
  call({ port: Number(new URL(c.url).port), token: c.token }, '/v1/cache', { op: 'incr', dc: 'local', key: 'n', delta: '1' });
const gone = async (root: string, ms = 5000) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(50)) {
    if (!existsSync(join(storesDir(root), 'service.json'))) return true;
  }
  return false;
};

beforeAll(() => {
  process.env.FASTEDGE_STORES_GRACE_MS = '300'; // inherited by the spawned services
});
afterEach(async () => {
  await Promise.all(opened.splice(0).map((c) => c.close()));
});

describe('StoresManager', () => {
  it('clients of one root share one service and its data', async () => {
    const root = mkdtempSync(join(tmpdir(), 'stores-mgr-'));
    const [a, b, c] = await Promise.all([connect(root), connect(root), connect(root)]);
    expect(new Set([a.url, b.url, c.url]).size).toBe(1);
    expect(await incr(a)).toBe('1');
    expect(await incr(b)).toBe('2');
    expect(readFileSync(join(storesDir(root), '.gitignore'), 'utf8')).toBe('*\n');
  });

  it('another root gets its own service', async () => {
    const a = await connect(mkdtempSync(join(tmpdir(), 'stores-mgr-')));
    const b = await connect(mkdtempSync(join(tmpdir(), 'stores-mgr-')));
    expect(a.url).not.toBe(b.url);
  });

  it('the service exits after the last client closes', async () => {
    const root = mkdtempSync(join(tmpdir(), 'stores-mgr-'));
    const a = await connect(root);
    const b = await connect(root);
    await a.close();
    await sleep(800);
    expect(existsSync(join(storesDir(root), 'service.json'))).toBe(true);
    await b.close();
    expect(await gone(root)).toBe(true);
  });

  it('a killed service is restarted on the same port and token; data persists', async () => {
    const root = mkdtempSync(join(tmpdir(), 'stores-mgr-'));
    const a = await connect(root);
    expect(await incr(a)).toBe('1');
    const before = descriptor(root);
    process.kill(before.pid, 'SIGKILL');
    for (const end = Date.now() + 5000; Date.now() < end; await sleep(50)) {
      const now = existsSync(join(storesDir(root), 'service.json')) ? descriptor(root) : before;
      if (now.pid !== before.pid) break;
    }
    const after = descriptor(root);
    expect(after.pid).not.toBe(before.pid);
    expect([after.port, after.token]).toEqual([before.port, before.token]);
    expect(await incr(a)).toBe('2');
  });

  it('loads fixtures, and reports a bad fixture with the service log', async () => {
    const root = mkdtempSync(join(tmpdir(), 'stores-mgr-'));
    mkdirSync(join(root, 'fixtures/stores/kv'), { recursive: true });
    writeFileSync(join(root, 'fixtures/stores/kv/s.json'), JSON.stringify({ strings: { k: 'v' } }));
    const a = await connect(root);
    const port = Number(new URL(a.url).port);
    expect(await call({ port, token: a.token }, '/v1/kv', { op: 'get', store: 's', key: 'k' })).toBe('dg==');
    await a.close();
    expect(await gone(root)).toBe(true);

    writeFileSync(join(root, 'fixtures/stores/kv/s.json'), '{"zsets": 1}');
    await expect(connectStores(root, { startTimeoutMs: 5000 })).rejects.toThrow(/start failed.*fixtures\/stores\/kv\/s.json zsets/s);
  });
});
