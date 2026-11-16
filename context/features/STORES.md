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
- Needs the fastedge-run release in `.fastedge-cli-version` (v0.23.0 or later); an older binary
  ignores the variable and HTTP apps keep its in-memory cache. The end-to-end tests are
  `integration/http-apps/stores/`.

## CDN apps (proxy-wasm)

- **On by default.** `createRunner` / `createRunnerFromBuffer` connect (and own the
  connection; `cleanup()` releases it). The debugger server connects once, on the first CDN
  load, and keeps it; if the service cannot start it logs `Stores are off: ...` and goes on.
  `RunnerConfig.stores: false` (or `stores: false` in the `/api/load` body) turns them off.
- **`dc`** (`RunnerConfig.dc`, `/api/load` `dc`, default `local`): the cache bucket.
- **Stores root:** `FASTEDGE_STORES_ROOT`, else the nearest ancestor with `.git`, else the app
  folder (WORKSPACE_PATH / cwd). Sibling app folders in one repo share the service.
- Host functions follow the edge's signatures, encodings and statuses. The worker blocks on each call
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
| admin | `snapshot` | `dc?` (default `local`) | `{ now, dc, dcs, cache: [{key, size, expiresAt}], kv: [{store, strings, zsets, bloom}] }`: sizes, no values |
| admin | `inspect` | `key` and `dc` or `store` | one value: `{ type: "string", size, value (base64), truncated, expiresAt? }`, `{ type: "zset", count, members: [{..., score}] }` or `{ type: "bloom", count, items }`; first 4 KB / 200 items; null if gone |
| admin | `reset` | | cache emptied (every `dc`), KV re-seeded from the fixtures |
| admin | `kv-put` | `store, key, data` (fixture format holding just `key`) | `null`; replaces the key whatever its type; creates the store |
| admin | `kv-delete` | `store, key` | `null` |
| admin | `kv-store-create` / `kv-store-delete` | `store` | `null` |
| admin | `kv-export` | | `{ [store]: fixture file text }` (keys sorted; UTF-8 text, else `{ base64 }`) |

`snapshot`, `inspect`, `reset` and the Storage Explorer ops (`kv-*`) were added without a protocol bump (additive ops): an older running
service refuses them with `bad-request`, which the debugger reports as "close other fastedge-test
instances, then restart this debugger" (its own lease keeps the old service alive); runners keep
working with it.

## Storage panel (debugger)

`GET /api/stores?dc=` (default: the loaded app's `dc`, returned as `appDc`; `{ enabled: false }`
when no app is loaded or it has stores off, without connecting to the service; Reset and Advance
clock are then 409), `GET /api/stores/value?key=&dc=|store=`, `POST /api/stores/reset`, `POST /api/stores/advance-clock { ms }`. UI:
`frontend/src/components/common/StoresPanel/` in both views: cache entries of one `dc` with a TTL
countdown and a `dc` switcher, Edge KV keys by type, Reset, Advance clock (+1 min / h / day).
Click a row for its value (fetched then; UTF-8 text, pretty JSON, or base64 for binary). Read-only. Refreshes when opened, on a `dc` switch, and after each request.

The fastedge-run client (FastEdge-lib `src/stores_service.rs`) implements the other side.

## Storage Explorer (debugger)

`/api/storage/*` (`server/storageExplorer.ts`): manage the stores with or without an app loaded
(starts the service when needed). Edits live in the service until it restarts or resets (both
reload the fixtures); Save to fixtures keeps them.

| Endpoint | Body / query | Does |
|---|---|---|
| `GET /api/storage` | `?dc=` (default `local`) | snapshot |
| `GET /api/storage/value` | `?key=` and `dc=` or `store=` | one value (as `inspect`) |
| `POST /api/storage/kv/put` | `{ store, key, type: "string", value }`, `{ ..., type: "zset", members }`, `{ ..., type: "bloom", items }` | replace one key |
| `POST /api/storage/kv/delete` | `{ store, key }` | |
| `POST /api/storage/kv/store`, `/kv/store/delete` | `{ store }` | create / delete a store |
| `POST /api/storage/cache/put`, `/cache/delete` | `{ dc, key, value, ttlMs? }`, `{ dc, key }` | |
| `POST /api/storage/cache/expire` | `{ dc, key, ttlMs }` | new TTL from now, value kept (above the max = the max); `{ updated: false }` if gone |
| `POST /api/storage/import` | `{ store, data, replace? }` | `data`: fixture format, or a plain object key → value (non-strings as JSON text) |
| `POST /api/storage/reset`, `/advance-clock` | `{ ms }` | |
| `GET /api/storage/fixtures/diff` | | `{ root, changes: [{ store, file, status: new / changed / deleted, current, proposed, hash }] }`: Edge KV fixture files vs the service; same data in another layout is not a change |
| `POST /api/storage/fixtures/save` | `{ files: [{ file, hash }] }` | writes / deletes exactly those files; 409 if one changed since the diff |

Values are the fixture format (UTF-8 string or `{ base64 }`) and are checked by the fixture
parser, so the explorer holds only what a fixture can (no empty KV value). Store names: letters,
digits, `. _ -` (they are file names). Only Edge KV is saved to fixtures; cache edits stay live.

**Importing a portal store (agents; shapes checked on preprod 2026-11-16):** list the store with
the FastEdge API, `GET /fastedge/v1/kv/{store_id}/data` (`limit` ≤ 200, `offset`) →
`{ count, entries: [{ key, datatype, payload? }] }`, and map each entry by `datatype`:
- `kv`: `payload: { value, encoding }` → `strings[key]` = `value` (`{ base64: value }` when
  `encoding` is `base64`);
- `sorted_set` / `bloom_filter`: no payload in the list; read the key,
  `GET /fastedge/v1/kv/{store_id}/data/{key}` (paginated the same way) →
  `{ payload: [{ value, encoding, score }] }` → `zsets[key] = [[value, score], ...]`, or
  `{ payload: [{ value, encoding }] }` → `bloom[key] = [value, ...]`.

A value with encoding `masked` or `sha256` cannot be recovered: skip it and say so. BYOD stores
keep their data elsewhere and cannot be imported this way. Write `fixtures/stores/kv/<store>.json`,
or `POST /api/storage/import` the same data.

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

## Tests: isolated stores

Tests get their own stores, never the shared service (`server/stores/testStores.ts`):
- `createStores({ fixtures?, dc? })`: an in-memory service inside the test process (no
  detached process, lock or lease), seeded from `fixtures/stores/`. Helpers run in-process:
  `cache.get/set/delete`, `seed({ kv, cache })` (fixture formats; named stores replaced),
  `advanceClock`, `reset` (back to the fixtures), `close`.
- `RunnerConfig.stores` takes an instance: the runner uses it and does not own it. CDN and HTTP
  runners given the same instance share it. The worker runner strips it before `postMessage`.
- `runTestSuite`: a fresh instance per test, passed as `run(runner, { stores })`; a suite-wide
  instance in `runnerConfig.stores` is shared on purpose; `stores: false` turns them off.
- `@gcoredev/fastedge-test/vitest` (ESM, `vitest` optional peer): `test` with `stores` and
  `runner(wasm, config?)` fixtures, per test; runners are cleaned up and stores closed after.
  Wider sharing is explicit: `createStores()` in `beforeAll`.

## Storage trace

Every cache / KV call can carry `trace: { requestId, app, hook? }`; the service records it in a
bounded log (5,000 calls, values not recorded, only sizes) and answers
`POST /v1/admin { op: "traces", requestId, hook? }` (`server/stores/trace.ts`).

- **CDN apps:** `ProxyWasmRunner` tags calls with one request id per `callFullFlow` (per hook for
  a bare `callHook`) and the hook name, and after each hook puts the calls into
  `HookResult.storeCalls`. The debugger shows them in the hook panel's **Storage** tab.
  Stores off: no `storeCalls`.
- **HTTP apps:** `HttpWasmRunner.execute` sends a W3C `traceparent` (or keeps the caller's) and
  fetches that request's calls into `HttpResponse.storeCalls`; the debugger's HTTP view has a
  **Storage** tab of the Logging panel. fastedge-run reads the traceparent from the engine's per-request `http`
  span (a tracing layer, FastEdge-lib `src/request_trace.rs`) and adds `trace` to each service
  call. Needs that fastedge-run; with the released one, `storeCalls` is empty.

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
