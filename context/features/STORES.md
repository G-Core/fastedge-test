# Stores: the local storage service (cache and Edge KV)

**Status (November 2026):** core, HTTP API, service manager and the CDN host functions are
in place; CDN and HTTP apps use the stores by default. Not yet done
(`proxy_cache_*`, `proxy_kv_store_*`), and pointing fastedge-run at it. Until then nothing
in the runner uses it.

## What it is

One process per workspace holds the edge cache and Edge KV in SQLite (`node:sqlite`, so
`engines` is `>=22.13`). CDN apps (via the worker runner) and HTTP apps (fastedge-run with
`FASTEDGE_STORES_SERVICE=<url>,<token>[,<dc>]`) use the same data, as on the edge, where the
cache is shared per account per POP by HTTP and CDN apps.

| File | Role |
|---|---|
| `server/stores/StoresCore.ts` | All store semantics on SQLite: cache (8 ops), Edge KV reads (5 ops), the clock, seeding |
| `server/stores/StoresServer.ts` | HTTP API on 127.0.0.1: token + `Host` check, `/v1/cache`, `/v1/kv`, `/v1/admin` |
| `server/stores/fixtures.ts` | Loads `fixtures/stores/kv/*.json` and `fixtures/stores/cache/*.json` |
| `server/stores/service.ts` | The service process (embedded, started with `node -`) |
| `server/stores/StoresManager.ts` | `connectStores(root)`: find or start the service, hold a lease; `resolveStoresRoot` |
| `server/runner/StoresHost.ts` | CDN host functions `proxy_cache_*` (8) and `proxy_kv_store_*` (6) |
| `server/runner/storesBridge.ts` | Synchronous calls from the CDN worker (Atomics.wait); the parent makes the HTTP call |

## HTTP apps (fastedge-run)

- With stores on, `HttpWasmRunner` starts fastedge-run with
  `FASTEDGE_STORES_SERVICE=<url>,<token>,<dc>` (read at each spawn, so a restarted service is
  picked up on the next load or dotenv change).
- fastedge-run asks the service for its seeded stores (`admin kv-stores`) and attaches each one
  **unless** `--kv-stores` or dotenv already names it, so a `redis://` entry in `.env.kv_stores`
  still wins.
- Needs fastedge-run from FastEdge-lib `feat/stores-forward` (not released yet). The released
  binary ignores the variable: HTTP apps keep its in-memory cache until `.fastedge-cli-version`
  moves to a release with it. The end-to-end tests (`integration/http-apps/stores/`) run only with
  `FASTEDGE_TEST_STORES_E2E=1 FASTEDGE_RUN_PATH=<that build>`.

## CDN apps (proxy-wasm)

- **On by default.** `createRunner` / `createRunnerFromBuffer` connect (and own the
  connection; `cleanup()` releases it). The debugger server connects once, on the first CDN
  load, and keeps it; if the service cannot start it logs `Stores are off: ...` and goes on.
  `RunnerConfig.stores: false` (or `stores: false` in the `/api/load` body) turns them off.
- **`dc`** (`RunnerConfig.dc`, `/api/load` `dc`, default `local`): the cache bucket.
- **Stores root:** `FASTEDGE_STORES_ROOT`, else the nearest ancestor with `.git`, else the app
  folder (WORKSPACE_PATH / cwd). Sibling app folders in one repo share the service.
- Host functions follow the engine's signatures, encodings and statuses
  (`crates/proxywasm/src/host/cache.rs`, `key_value.rs`). The worker blocks on each call
  (deadline 5 s; the parent's HTTP timeout is 4 s); a failure is `InternalFailure`, never retried.
- **Stores off:** the functions still link; every call returns `InternalFailure` and the first
  call in a hook logs `[host] stores are off: ...`.
- Edge KV `open` succeeds only for a store with a fixture (an attached store on the edge);
  otherwise `BadArgument` (the SDK's `AccessDenied`). A key of another type → `BadArgument`
  (Redis WRONGTYPE).

## Service process

- One service per **stores root**. Files in `<root>/.fastedge-debug/stores/`: `stores.db`,
  `service.json` (pid, port, token, protocol; mode 0600), `service.lock`, `service.log`, and a
  `.gitignore` of `*`. Not `.fastedge/`: that is the JS SDK's project folder.
- `connectStores(root)`: reads `service.json` and checks the service answers with the same
  protocol; otherwise takes `service.lock` (exclusive create; a lock older than 20 s is taken
  over) and starts the service detached, with the code on stdin (`node -`, also works under
  VS Code's Electron). Start errors (e.g. a bad fixture) come back from `service.log`.
- Leases: each client renews every ttl/3 (default ttl 30 s). The service exits when no lease
  is live, after a 15 s start grace (`FASTEDGE_STORES_GRACE_MS`).
- Crash: the next renewal restarts it on the **same port and token** (from the stale
  `service.json`), so fastedge-run processes pointed at it keep working. A call in flight
  during the crash fails; nothing is retried.
- Calls use node:http, not fetch: `mockOrigins()` replaces the global fetch dispatcher.
- A different protocol version already running for the root is a clear error, not a restart.

## API (protocol 1)

`POST /v1/<cache|kv|admin>`, `authorization: Bearer <token>`, JSON body `{ "op": ..., ... }`.
Reply `{ "ok": true, "value": ... }` or `{ "ok": false, "error": "<code>" }` (200). Malformed
request: 400 `bad-request`. Wrong token, foreign `Host`, unknown path: empty 401/403/404.
Binary values are base64; i64/u64 are decimal strings (numbers accepted).

| Kind | Op | Body | Value |
|---|---|---|---|
| cache | `get` | `dc, key` | base64 or `null` |
| cache | `set` | `dc, key, value, ttlMs` (`null` = default) | `null`; negative TTL → `bad-argument` |
| cache | `delete` | `dc, key` | `null` |
| cache | `exists` | `dc, key` | bool |
| cache | `incr` | `dc, key, delta` | new value (string); non-integer / overflow → `internal-error` |
| cache | `expire` | `dc, key, ttlMs` | bool (false = missing) |
| cache | `purge` | `dc` | count (string) |
| cache | `purge-prefix` | `dc, prefix` | count (string) |
| kv | `open` | `store` | `true`; `access-denied` without a fixture |
| kv | `get` | `store, key` | base64 or `null`; `wrong-type` on a zset/bloom key |
| kv | `zrange-by-score` | `store, key, min, max` (`"inf"`/`"-inf"` allowed) | `[[base64, score]]` |
| kv | `scan` | `store, pattern` | `[key]` (sorted) |
| kv | `zscan` | `store, key, pattern` | `[[base64, score]]` |
| kv | `bf-exists` | `store, key, item` | bool |
| admin | `info` | | `{ protocol: 1 }` |
| admin | `kv-stores` | | seeded store names |
| admin | `advance-clock` | `ms` | new offset |

The fastedge-run client (FastEdge-lib `src/stores_service.rs`) implements the other side.

## Edge semantics matched

Measured on preprod (2026-11-05) and read from the FastEdge cache backend:
- default TTL = max TTL = 4 days; a larger TTL is clamped; `expire` with a negative TTL gets
  the default; `expire` on a missing key is `false`;
- `incr` takes canonical decimal i64 only; an existing key keeps its TTL;
- a stored empty value reads back empty, not missing;
- `purge` clears the whole `dc` bucket; `purge-prefix` is a literal prefix (no glob);
- KV `scan` uses the edge's glob (measured 2026-11-13, P7): `*`, `?`, `[..]`, `[^..]` (`!` is a
  literal), ranges (reversed too), `\` escapes; translated to SQLite `GLOB`. The edge rejects
  (error, not a match) a `]` outside a set, a `[` inside one (even escaped), an unclosed set,
  `[x-]` and a trailing `\`; `[]` matches nothing;
- KV `zscan` matches only the **literal prefix** before the first wildcard (`a*z` returns every
  member starting with `a`), sorted by member, not score; the pattern is still validated;
- `zrange_by_score` with min > max is an error (`Other("ERR: min > max")`, CDN `BadArgument`);
- wrong type: `Other("ERR: Invalid argument: WRONGTYPE ...")`, CDN `BadArgument`;
- one clock for every runner: `advance-clock` moves expiry for HTTP and CDN apps together.

## Known differences from the edge

- **`incr` on a missing key** gets the default TTL and is purgeable. On the edge it currently
  gets no TTL and escapes `purge` until a server restart (engine bug, being reported).
- **Bloom filters are exact sets:** no false positives.
- **Restart on another port:** a crashed service restarts on its old port; if another process
  took that port meanwhile, it listens on a new one. CDN runners follow; a running fastedge-run
  keeps the old address until its runner reloads.
- **Cache keys** are scoped by `dc` only, not by account (one service = one account).
- A KV store is attached when it has a fixture; there is no app-level store configuration yet.

## Fixtures

```
fixtures/stores/kv/<store>.json   { "strings": { key: value }, "zsets": { key: [[member, score]] }, "bloom": { key: [item] } }
fixtures/stores/cache/<dc>.json   { key: { "value": "text" } | { "base64": "..." }, optional "ttl_ms" }
```

Edge KV values cannot be empty (the edge API refuses them); cache values can.

A value or zset member is a UTF-8 string or `{ "base64": "..." }`. KV fixtures replace all KV
data when loaded (KV is read-only to apps, so the tables are a copy of the fixtures). Cache
fixtures overwrite their keys with a fresh TTL and leave other cached entries alone. Errors
name the file and field.

## Tests

`server/__tests__/unit/stores/`: conformance cases from the preprod probes (P2–P6), Redis KV
semantics, glob translation checked in SQLite, fixtures, the HTTP checks (token, `Host`,
bad requests), and the manager (real service processes).
`server/__tests__/integration/cdn-apps/stores/`: the Rust CDN app
`test-applications/cdn-apps/rust/cdn-stores` against the service: shared bucket, `dc`
separation, TTL rules, incr errors, purge, all four hooks, KV fixture reads, unattached store,
wrong type, stores off.
