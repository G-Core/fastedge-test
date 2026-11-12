/**
 * Storage core: the edge cache and Edge KV on one SQLite database.
 *
 * All store semantics live here (TTL, incr, glob matching, the clock), so the CDN runner
 * and fastedge-run behave the same. Requests and replies follow the service contract
 * (`/v1/cache`, `/v1/kv`): binary values are base64, i64/u64 travel as decimal strings
 * (numbers are accepted too), replies are `{ ok: true, value }` or `{ ok: false, error }`.
 *
 * Edge behaviour matched (measured on preprod 2026-11-05, FastEdge cache-backend redis.rs):
 * - default TTL = max TTL (4 days); a larger TTL is clamped; `set` with a negative TTL is
 *   a bad argument; `expire` with a negative TTL gets the default (u64 wrap on the edge);
 * - `incr`: decimal i64 only, overflow and non-integers are internal errors; a key that
 *   exists keeps its TTL. A missing key is created with the default TTL, so `purge` sees
 *   it: the intended behaviour, the edge currently leaves it without TTL or index entry;
 * - `purge` clears the whole `dc` bucket (account-wide on the edge); `purge-prefix` is a
 *   literal prefix, no glob;
 * - an empty value is stored and read back as empty, not missing.
 */

import type { DatabaseSync, StatementSync } from "node:sqlite";

export const DEFAULT_MAX_TTL_MS = 345_600_000; // 4 days, cache_max_ttl on the edge
const I64_MIN = -(2n ** 63n);
const I64_MAX = 2n ** 63n - 1n;
const SCHEMA_VERSION = "1";

export type Reply = { ok: true; value: unknown } | { ok: false; error: string };
type Body = Record<string, unknown>;

/** A malformed request (missing field, unknown op): the caller's bug, not a store result. */
export class BadRequest extends Error {}

const ok = (value: unknown = null): Reply => ({ ok: true, value });
const fail = (error: string): Reply => ({ ok: false, error });

export class StoresCore {
  private clockOffsetMs = 0;
  private q: Record<string, StatementSync>;

  constructor(
    private db: DatabaseSync,
    private maxTtlMs: number = DEFAULT_MAX_TTL_MS,
  ) {
    // WAL + synchronous=NORMAL: no fsync per write (the default journal costs ~3 ms per
    // write); a killed process loses nothing committed.
    db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;");
    db.exec(`
      CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
      CREATE TABLE IF NOT EXISTS cache (dc TEXT, key TEXT, value BLOB NOT NULL,
        expires_at INTEGER NOT NULL, PRIMARY KEY (dc, key)) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS kv_string (store TEXT, key TEXT, value BLOB NOT NULL,
        PRIMARY KEY (store, key)) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS kv_zset (store TEXT, key TEXT, member BLOB, score REAL NOT NULL,
        PRIMARY KEY (store, key, member)) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS kv_bloom (store TEXT, key TEXT, item TEXT,
        PRIMARY KEY (store, key, item)) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS kv_store (name TEXT PRIMARY KEY) WITHOUT ROWID;
    `);
    const version = db.prepare("SELECT v FROM meta WHERE k = 'schema'").get() as { v: string } | undefined;
    if (version && version.v !== SCHEMA_VERSION) {
      throw new Error(`stores database has schema ${version.v}, this version needs ${SCHEMA_VERSION}; delete the file to reset it`);
    }
    db.prepare("INSERT OR IGNORE INTO meta (k, v) VALUES ('schema', ?)").run(SCHEMA_VERSION);

    const p = (sql: string) => db.prepare(sql);
    this.q = {
      live: p("SELECT value, expires_at FROM cache WHERE dc = ? AND key = ? AND expires_at > ?"),
      put: p(`INSERT INTO cache (dc, key, value, expires_at) VALUES (?, ?, ?, ?)
              ON CONFLICT (dc, key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`),
      expireAt: p("UPDATE cache SET expires_at = ? WHERE dc = ? AND key = ?"),
      del: p("DELETE FROM cache WHERE dc = ? AND key = ?"),
      dropExpired: p("DELETE FROM cache WHERE dc = ? AND expires_at <= ?"),
      purge: p("DELETE FROM cache WHERE dc = ?"),
      // A literal prefix compare: no glob, as on the edge (probe P6).
      purgePrefix: p("DELETE FROM cache WHERE dc = ?1 AND substr(key, 1, length(?2)) = ?2"),
      kvGet: p("SELECT value FROM kv_string WHERE store = ? AND key = ?"),
      zrange: p(`SELECT member, score FROM kv_zset WHERE store = ? AND key = ? AND score BETWEEN ? AND ?
                 ORDER BY score, member`),
      scan: p(`SELECT key FROM kv_string WHERE store = ?1 AND key GLOB ?2
               UNION SELECT key FROM kv_zset WHERE store = ?1 AND key GLOB ?2
               UNION SELECT key FROM kv_bloom WHERE store = ?1 AND key GLOB ?2 ORDER BY key`),
      zscan: p(`SELECT member, score FROM kv_zset WHERE store = ? AND key = ? AND CAST(member AS TEXT) GLOB ?
                ORDER BY score, member`),
      bf: p("SELECT 1 FROM kv_bloom WHERE store = ? AND key = ? AND item = ?"),
      // The Redis type of a key: 'string', 'zset', 'bloom' or none.
      type: p(`SELECT 'string' AS t FROM kv_string WHERE store = ?1 AND key = ?2
               UNION ALL SELECT 'zset' FROM kv_zset WHERE store = ?1 AND key = ?2
               UNION ALL SELECT 'bloom' FROM kv_bloom WHERE store = ?1 AND key = ?2 LIMIT 1`),
      store: p("SELECT 1 FROM kv_store WHERE name = ?"),
      stores: p("SELECT name FROM kv_store ORDER BY name"),
    };
  }

  /** The only clock: HTTP and CDN apps see expiry move together. */
  now(): number {
    return Date.now() + this.clockOffsetMs;
  }

  advanceClock(ms: number): number {
    this.clockOffsetMs += ms;
    return this.clockOffsetMs;
  }

  cache(body: Body): Reply {
    const dc = text(body, "dc");
    const now = this.now();
    const live = (key: string) =>
      this.q.live.get(dc, key, now) as { value: Uint8Array; expires_at: number } | undefined;

    switch (body.op) {
      case "get": {
        const row = live(text(body, "key"));
        return ok(row ? Buffer.from(row.value).toString("base64") : null);
      }
      case "set": {
        const ttl = body.ttlMs === null || body.ttlMs === undefined ? null : int(body, "ttlMs");
        if (ttl !== null && ttl < 0n) return fail("bad-argument");
        this.q.put.run(dc, text(body, "key"), bytes(body, "value"), now + this.clamp(ttl));
        return ok();
      }
      case "delete":
        this.q.del.run(dc, text(body, "key"));
        return ok();
      case "exists":
        return ok(live(text(body, "key")) !== undefined);
      case "incr": {
        const key = text(body, "key");
        const delta = int(body, "delta");
        const row = live(key);
        const current = row ? Buffer.from(row.value).toString("latin1") : "0";
        // Redis INCRBY: the value must be a canonical decimal i64.
        if (!/^(0|-?[1-9]\d{0,18})$/.test(current)) return fail("internal-error");
        const next = BigInt(current) + delta;
        if (BigInt(current) > I64_MAX || BigInt(current) < I64_MIN || next > I64_MAX || next < I64_MIN) {
          return fail("internal-error");
        }
        this.q.put.run(dc, key, Buffer.from(next.toString()), row ? row.expires_at : now + this.maxTtlMs);
        return ok(next.toString());
      }
      case "expire": {
        const key = text(body, "key");
        const ttl = int(body, "ttlMs");
        if (!live(key)) return ok(false);
        // Negative = a huge u64 on the edge, clamped to the default.
        this.q.expireAt.run(now + this.clamp(ttl < 0n ? null : ttl), dc, key);
        return ok(true);
      }
      case "purge":
        this.q.dropExpired.run(dc, now);
        return ok(String(this.q.purge.run(dc).changes));
      case "purge-prefix":
        this.q.dropExpired.run(dc, now);
        return ok(String(this.q.purgePrefix.run(dc, text(body, "prefix")).changes));
      default:
        throw new BadRequest(`unknown cache op: ${String(body.op)}`);
    }
  }

  /**
   * Edge KV is read-only to apps. `open` succeeds only for a seeded store (one with a fixture),
   * as the edge allows only the stores attached to the app; the other ops answer for any store.
   * An op on a key of another type is `wrong-type` (Redis WRONGTYPE).
   */
  kv(body: Body): Reply {
    const store = text(body, "store");
    const wrongType = (key: string, want: string) => {
      const row = this.q.type.get(store, key) as { t: string } | undefined;
      return row !== undefined && row.t !== want;
    };
    switch (body.op) {
      case "open":
        return this.q.store.get(store) ? ok(true) : fail("access-denied");
      case "get": {
        if (wrongType(text(body, "key"), "string")) return fail("wrong-type");
        const row = this.q.kvGet.get(store, text(body, "key")) as { value: Uint8Array } | undefined;
        return ok(row ? Buffer.from(row.value).toString("base64") : null);
      }
      case "zrange-by-score":
        if (wrongType(text(body, "key"), "zset")) return fail("wrong-type");
        return ok(scored(this.q.zrange.all(store, text(body, "key"), score(body, "min"), score(body, "max"))));
      case "scan":
        return ok((this.q.scan.all(store, redisGlob(text(body, "pattern"))) as { key: string }[]).map((r) => r.key));
      case "zscan":
        if (wrongType(text(body, "key"), "zset")) return fail("wrong-type");
        return ok(scored(this.q.zscan.all(store, text(body, "key"), redisGlob(text(body, "pattern")))));
      case "bf-exists":
        if (wrongType(text(body, "key"), "bloom")) return fail("wrong-type");
        return ok(this.q.bf.get(store, text(body, "key"), text(body, "item")) !== undefined);
      default:
        throw new BadRequest(`unknown kv op: ${String(body.op)}`);
    }
  }

  /** The seeded (attached) Edge KV stores. */
  kvStores(): string[] {
    return (this.q.stores.all() as { name: string }[]).map((r) => r.name);
  }

  /** Replace every Edge KV store with the given seeds (KV tables are a copy of the fixtures). */
  seedKv(stores: Record<string, KvSeed>): void {
    this.transaction(() => {
      for (const table of ["kv_string", "kv_zset", "kv_bloom", "kv_store"]) this.db.exec(`DELETE FROM ${table}`);
      const putStore = this.db.prepare("INSERT INTO kv_store (name) VALUES (?)");
      const putString = this.db.prepare("INSERT INTO kv_string (store, key, value) VALUES (?, ?, ?)");
      const putMember = this.db.prepare("INSERT OR REPLACE INTO kv_zset (store, key, member, score) VALUES (?, ?, ?, ?)");
      const putItem = this.db.prepare("INSERT OR IGNORE INTO kv_bloom (store, key, item) VALUES (?, ?, ?)");
      for (const [store, seed] of Object.entries(stores)) {
        putStore.run(store);
        for (const [key, value] of Object.entries(seed.strings)) putString.run(store, key, value);
        for (const [key, members] of Object.entries(seed.zsets)) {
          for (const [member, s] of members) putMember.run(store, key, member, s);
        }
        for (const [key, items] of Object.entries(seed.bloom)) {
          for (const item of items) putItem.run(store, key, item);
        }
      }
    });
  }

  /** Write cache entries (fixtures); `ttlMs` null = the default TTL. */
  seedCache(dc: string, entries: Record<string, { value: Uint8Array; ttlMs: number | null }>): void {
    const now = this.now();
    this.transaction(() => {
      for (const [key, { value, ttlMs }] of Object.entries(entries)) {
        this.q.put.run(dc, key, value, now + this.clamp(ttlMs === null ? null : BigInt(ttlMs)));
      }
    });
  }

  private clamp(ttlMs: bigint | null): number {
    return ttlMs === null || ttlMs > BigInt(this.maxTtlMs) ? this.maxTtlMs : Number(ttlMs);
  }

  private transaction(work: () => void): void {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      work();
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}

export type KvSeed = {
  strings: Record<string, Uint8Array>;
  zsets: Record<string, [Uint8Array, number][]>;
  bloom: Record<string, string[]>;
};

function text(body: Body, field: string): string {
  const v = body[field];
  if (typeof v !== "string") throw new BadRequest(`${field} must be a string`);
  return v;
}

function int(body: Body, field: string): bigint {
  const v = body[field];
  if ((typeof v === "string" && /^-?\d+$/.test(v)) || (typeof v === "number" && Number.isSafeInteger(v))) {
    return BigInt(v);
  }
  throw new BadRequest(`${field} must be an integer`);
}

function bytes(body: Body, field: string): Buffer {
  return Buffer.from(text(body, field), "base64");
}

/** A score bound: a number, or a decimal / `inf` / `-inf` string (Rust prints f64 that way). */
function score(body: Body, field: string): number {
  const v = body[field];
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const inf = /^([+-]?)inf(inity)?$/i.exec(v);
    const n = inf ? (inf[1] === "-" ? -Infinity : Infinity) : Number(v);
    if (!Number.isNaN(n) && v.trim() !== "") return n;
  }
  throw new BadRequest(`${field} must be a number`);
}

function scored(rows: unknown[]): [string, number][] {
  return (rows as { member: Uint8Array; score: number }[]).map((r) => [
    Buffer.from(r.member).toString("base64"),
    r.score,
  ]);
}

/**
 * Redis glob (`*`, `?`, `[..]`, `[^..]`, `\` escapes) → SQLite GLOB (same syntax, no escape
 * character): a literal `*`, `?` or `[` becomes a one-character set, and a literal `]` goes
 * first in its set. Edge escaping is not measured yet (probe P7).
 */
export function redisGlob(pattern: string): string {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "\\" && i + 1 < pattern.length) {
      const next = pattern[++i];
      out += "*?[".includes(next) ? `[${next}]` : next;
    } else if (c === "[") {
      const negate = pattern[i + 1] === "^";
      if (negate) i++;
      let body = "";
      let bracket = false;
      while (++i < pattern.length && pattern[i] !== "]") {
        const ch = pattern[i] === "\\" && i + 1 < pattern.length ? pattern[++i] : pattern[i];
        if (ch === "]") bracket = true;
        else body += ch;
      }
      // ponytail: a literal `^` first in a set (from `[\^..]`) would read as negation; moved last.
      if (body.length > 1 && body[0] === "^") body = body.slice(1) + "^";
      out += `[${negate ? "^" : ""}${bracket ? "]" : ""}${body}]`;
    } else {
      out += c;
    }
  }
  return out;
}
