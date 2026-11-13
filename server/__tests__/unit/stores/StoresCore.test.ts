/**
 * Conformance: the storage core against the edge's measured behaviour
 * (preprod probes P2–P6, 2026-11-05) and Redis KV semantics.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StoresCore, edgeGlob } from '../../../stores/StoresCore';
import { loadFixtures } from '../../../stores/fixtures';

const MAX = 345_600_000;
const b64 = (s: string) => Buffer.from(s).toString('base64');

let core: StoresCore;
const cache = (op: string, args: Record<string, unknown> = {}, dc = 'local') => core.cache({ op, dc, ...args });
const kv = (op: string, args: Record<string, unknown> = {}) => core.kv({ op, store: 's', ...args });
const ttlOf = (key: string, dc = 'local') =>
  (core as any).db.prepare('SELECT expires_at FROM cache WHERE dc = ? AND key = ?').get(dc, key).expires_at - core.now();

beforeEach(() => {
  // Frozen wall clock, so TTL checks are exact; the service clock moves only via advanceClock.
  vi.useFakeTimers({ toFake: ['Date'] });
  core = new StoresCore(new DatabaseSync(':memory:'));
});
afterEach(() => vi.useRealTimers());

describe('cache', () => {
  it('get/set/delete/exists round trip binary and empty values (P2: empty is not missing)', () => {
    expect(cache('get', { key: 'k' })).toEqual({ ok: true, value: null });
    cache('set', { key: 'k', value: Buffer.from([0, 255, 10]).toString('base64'), ttlMs: null });
    expect(cache('get', { key: 'k' })).toEqual({ ok: true, value: 'AP8K' });
    cache('set', { key: 'e', value: '', ttlMs: null });
    expect(cache('get', { key: 'e' })).toEqual({ ok: true, value: '' });
    expect(cache('exists', { key: 'e' }).value).toBe(true);
    cache('delete', { key: 'e' });
    expect(cache('exists', { key: 'e' }).value).toBe(false);
  });

  it('TTL: none = default, larger is clamped, negative set is a bad argument (P4)', () => {
    cache('set', { key: 'a', value: b64('x'), ttlMs: null });
    cache('set', { key: 'b', value: b64('x'), ttlMs: String(MAX * 10) });
    cache('set', { key: 'c', value: b64('x'), ttlMs: 1000 });
    expect(ttlOf('a')).toBe(MAX);
    expect(ttlOf('b')).toBe(MAX);
    expect(ttlOf('c')).toBe(1000);
    expect(cache('set', { key: 'd', value: b64('x'), ttlMs: '-1' })).toEqual({ ok: false, error: 'bad-argument' });
  });

  it('entries expire on the service clock', () => {
    cache('set', { key: 'k', value: b64('v'), ttlMs: 1000 });
    core.advanceClock(999);
    expect(cache('exists', { key: 'k' }).value).toBe(true);
    core.advanceClock(1);
    expect(cache('get', { key: 'k' }).value).toBeNull();
  });

  it('expire: missing → false; negative → default TTL, key kept; 1 ms → gone (P4)', () => {
    expect(cache('expire', { key: 'none', ttlMs: '1000' }).value).toBe(false);
    cache('set', { key: 'k', value: b64('v'), ttlMs: 1000 });
    expect(cache('expire', { key: 'k', ttlMs: '-1' }).value).toBe(true);
    expect(ttlOf('k')).toBe(MAX);
    expect(cache('expire', { key: 'k', ttlMs: '1' }).value).toBe(true);
    core.advanceClock(1);
    expect(cache('exists', { key: 'k' }).value).toBe(false);
  });

  it('incr: counts from 0, keeps an existing TTL, new key gets the default TTL', () => {
    expect(cache('incr', { key: 'n', delta: '1' }).value).toBe('1');
    expect(cache('incr', { key: 'n', delta: '-5' }).value).toBe('-4');
    expect(ttlOf('n')).toBe(MAX);
    cache('set', { key: 't', value: b64('10'), ttlMs: 5000 });
    expect(cache('incr', { key: 't', delta: 2 }).value).toBe('12');
    expect(ttlOf('t')).toBe(5000);
    expect(cache('get', { key: 't' }).value).toBe(b64('12'));
  });

  it('incr: a non-integer or overflow is an internal error (P3)', () => {
    cache('set', { key: 'a', value: b64('abc'), ttlMs: null });
    expect(cache('incr', { key: 'a', delta: '1' })).toEqual({ ok: false, error: 'internal-error' });
    cache('set', { key: 'max', value: b64('9223372036854775807'), ttlMs: null });
    expect(cache('incr', { key: 'max', delta: '1' })).toEqual({ ok: false, error: 'internal-error' });
    cache('set', { key: 'min', value: b64('-9223372036854775808'), ttlMs: null });
    expect(cache('incr', { key: 'min', delta: '1' }).value).toBe('-9223372036854775807');
    cache('set', { key: 'lead', value: b64('01'), ttlMs: null });
    expect(cache('incr', { key: 'lead', delta: '1' }).ok).toBe(false);
  });

  it('purge clears the whole dc bucket, other buckets kept (P5); incr keys included (P6b fixed)', () => {
    cache('set', { key: 'a', value: b64('1'), ttlMs: null });
    cache('incr', { key: 'n', delta: '1' });
    cache('set', { key: 'x', value: b64('1'), ttlMs: null }, 'other');
    expect(cache('purge')).toEqual({ ok: true, value: '2' });
    expect(cache('exists', { key: 'x' }, 'other').value).toBe(true);
  });

  it('purge-prefix is a literal prefix, no glob (P6); incr keys included', () => {
    for (const key of ['pg*', 'pgxa', 'pg[b]', 'q']) cache('set', { key, value: b64('1'), ttlMs: null });
    cache('incr', { key: 'pg*n', delta: '1' });
    expect(cache('purge-prefix', { prefix: 'pg*' })).toEqual({ ok: true, value: '2' });
    expect(cache('exists', { key: 'pgxa' }).value).toBe(true);
    expect(cache('exists', { key: 'pg[b]' }).value).toBe(true);
  });

  it('expired entries are not counted by purge', () => {
    cache('set', { key: 'old', value: b64('1'), ttlMs: 10 });
    core.advanceClock(10);
    expect(cache('purge').value).toBe('0');
  });

  it('rejects malformed requests', () => {
    expect(() => cache('get', {})).toThrow('key must be a string');
    expect(() => cache('nope', { key: 'k' })).toThrow('unknown cache op');
    expect(() => cache('incr', { key: 'k', delta: 1.5 })).toThrow('delta must be an integer');
  });
});

describe('kv', () => {
  beforeEach(() => {
    core.seedKv({
      s: {
        strings: { 'user:1': Buffer.from('alice'), 'a*b': Buffer.from('star'), cfg: Buffer.from([0, 1]) },
        zsets: {
          board: [
            [Buffer.from('bob'), 7.5],
            [Buffer.from('alice'), 10],
            [Buffer.from('carl'), 7.5],
          ],
        },
        bloom: { blocked: ['1.2.3.4'] },
      },
    });
  });

  it('open succeeds only for a seeded store; kvStores lists them', () => {
    expect(kv('open')).toEqual({ ok: true, value: true });
    expect(core.kv({ op: 'open', store: 'other' })).toEqual({ ok: false, error: 'access-denied' });
    expect(core.kvStores()).toEqual(['s']);
  });

  it('an op on a key of another type is wrong-type (Redis WRONGTYPE)', () => {
    expect(kv('get', { key: 'board' })).toEqual({ ok: false, error: 'wrong-type' });
    expect(kv('zrange-by-score', { key: 'cfg', min: '-inf', max: 'inf' })).toEqual({ ok: false, error: 'wrong-type' });
    expect(kv('zscan', { key: 'blocked', pattern: '*' })).toEqual({ ok: false, error: 'wrong-type' });
    expect(kv('bf-exists', { key: 'cfg', item: 'x' })).toEqual({ ok: false, error: 'wrong-type' });
    expect(kv('zrange-by-score', { key: 'missing', min: 0, max: 1 }).value).toEqual([]);
  });

  it('get returns base64 or null; another store is empty', () => {
    expect(kv('get', { key: 'cfg' }).value).toBe('AAE=');
    expect(kv('get', { key: 'missing' }).value).toBeNull();
    expect(core.kv({ op: 'get', store: 'other', key: 'user:1' }).value).toBeNull();
  });

  it('zrange-by-score: inclusive, ordered by score then member, inf bounds as strings', () => {
    expect(kv('zrange-by-score', { key: 'board', min: '-inf', max: 'inf' }).value).toEqual([
      [b64('bob'), 7.5],
      [b64('carl'), 7.5],
      [b64('alice'), 10],
    ]);
    expect(kv('zrange-by-score', { key: 'board', min: '8', max: 10 }).value).toEqual([[b64('alice'), 10]]);
  });

  it('scan covers every type with Redis globs and escapes', () => {
    expect(kv('scan', { pattern: '*' }).value).toEqual(['a*b', 'blocked', 'board', 'cfg', 'user:1']);
    expect(kv('scan', { pattern: 'b?ard' }).value).toEqual(['board']);
    expect(kv('scan', { pattern: 'a\\*b' }).value).toEqual(['a*b']);
    expect(kv('scan', { pattern: '[uc]*' }).value).toEqual(['cfg', 'user:1']);
  });

  it('zscan matches the literal prefix only, sorted by member (as the edge); bf-exists is an exact set', () => {
    expect(kv('zscan', { key: 'board', pattern: 'c*' }).value).toEqual([[b64('carl'), 7.5]]);
    expect(kv('zscan', { key: 'board', pattern: 'a*z' }).value).toEqual([[b64('alice'), 10]]);
    expect(kv('zscan', { key: 'board', pattern: '*' }).value).toEqual([
      [b64('alice'), 10],
      [b64('bob'), 7.5],
      [b64('carl'), 7.5],
    ]);
    expect(kv('zscan', { key: 'board', pattern: 'a[' })).toEqual({ ok: false, error: 'invalid-pattern' });
    expect(kv('bf-exists', { key: 'blocked', item: '1.2.3.4' }).value).toBe(true);
    expect(kv('bf-exists', { key: 'blocked', item: '1.2.3.5' }).value).toBe(false);
  });

  it('scan follows the edge glob rules (probe P7), in SQLite', () => {
    const keys = ['g*1', 'gx1', 'g?2', 'gy2', 'g[3]', 'g3', 'g\\4', 'g^5', 'g]6', 'g-7'];
    core.seedKv({ g: { strings: Object.fromEntries(keys.map((k) => [k, Buffer.from('1')])), zsets: {}, bloom: {} } });
    const scan = (pattern: string) => {
      const r = core.kv({ op: 'scan', store: 'g', pattern });
      return r.ok ? (r.value as string[]).join(',') : r.error;
    };
    expect(scan('g*1')).toBe('g*1,gx1');
    expect(scan('g\\*1')).toBe('g*1');
    expect(scan('g[*]1')).toBe('g*1');
    expect(scan('g\\?2')).toBe('g?2');
    expect(scan('g\\[3\\]')).toBe('g[3]');
    expect(scan('g\\\\4')).toBe('g\\4');
    expect(scan('g[^x]1')).toBe('g*1');
    expect(scan('g[!x]1')).toBe('gx1');
    expect(scan('g[z-a]1')).toBe('gx1');
    expect(scan('g[-x]1')).toBe('gx1');
    expect(scan('g[\\^]5')).toBe('g^5');
    expect(scan('g[\\]]6')).toBe('g]6');
    expect(scan('g[\\-]7')).toBe('g-7');
    expect(scan('g\\x1')).toBe('gx1');
    expect(scan('g[]1')).toBe('');
    expect(scan('')).toBe('');
    for (const bad of ['g[[]3]', 'g[\\[]3]', 'g[]]6', 'g]6', 'g[3', 'g\\', 'g[x-]1']) {
      expect(scan(bad), bad).toBe('invalid-pattern');
    }
  });

  it('edgeGlob gives the SQLite glob and the literal prefix', () => {
    expect(edgeGlob('a\\?b\\[c\\x*')).toEqual({ glob: 'a[?]b[[]cx*', prefix: 'a?b[cx' });
    expect(edgeGlob('[^a\\]\\-]')).toEqual({ glob: '[^]a-]', prefix: '' });
    expect(edgeGlob('x[]y').glob).toBeNull();
  });

  it('zrange-by-score with min > max is an error, as on the edge', () => {
    expect(kv('zrange-by-score', { key: 'board', min: 'inf', max: '-inf' })).toEqual({ ok: false, error: 'min-gt-max' });
  });
});

describe('fixtures', () => {
  it('seeds KV and cache from fixtures/stores, replacing old KV data', () => {
    const root = mkdtempSync(join(tmpdir(), 'stores-'));
    mkdirSync(join(root, 'fixtures/stores/kv'), { recursive: true });
    mkdirSync(join(root, 'fixtures/stores/cache'), { recursive: true });
    writeFileSync(join(root, 'fixtures/stores/kv/users.json'), JSON.stringify({
      strings: { 'user:1': 'alice', bin: { base64: 'AAE=' } },
      zsets: { lb: [['alice', 10]] },
      bloom: { ips: ['1.2.3.4'] },
    }));
    writeFileSync(join(root, 'fixtures/stores/cache/ams.json'), JSON.stringify({
      greeting: { value: 'hi', ttl_ms: 1000 },
      raw: { base64: 'AAE=' },
    }));
    core.seedKv({ old: { strings: { k: Buffer.from('v') }, zsets: {}, bloom: {} } });

    loadFixtures(core, root);

    expect(core.kv({ op: 'get', store: 'users', key: 'user:1' }).value).toBe(b64('alice'));
    expect(core.kv({ op: 'get', store: 'users', key: 'bin' }).value).toBe('AAE=');
    expect(core.kv({ op: 'bf-exists', store: 'users', key: 'ips', item: '1.2.3.4' }).value).toBe(true);
    expect(core.kv({ op: 'get', store: 'old', key: 'k' }).value).toBeNull();
    expect(cache('get', { key: 'greeting' }, 'ams').value).toBe(b64('hi'));
    expect(ttlOf('greeting', 'ams')).toBe(1000);
    expect(ttlOf('raw', 'ams')).toBe(MAX);
  });

  it('names the file and field of a bad fixture', () => {
    const root = mkdtempSync(join(tmpdir(), 'stores-'));
    mkdirSync(join(root, 'fixtures/stores/kv'), { recursive: true });
    writeFileSync(join(root, 'fixtures/stores/kv/bad.json'), JSON.stringify({ zsets: { lb: [['a', 'x']] } }));
    expect(() => loadFixtures(core, root)).toThrow('fixtures/stores/kv/bad.json zsets.lb[0]');
    writeFileSync(join(root, 'fixtures/stores/kv/bad.json'), JSON.stringify({ strings: { k: '' } }));
    expect(() => loadFixtures(core, root)).toThrow('strings.k: Edge KV values cannot be empty');
  });

  it('a project without fixtures loads nothing', () => {
    expect(() => loadFixtures(core, mkdtempSync(join(tmpdir(), 'stores-')))).not.toThrow();
  });
});
