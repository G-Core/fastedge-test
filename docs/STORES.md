# Stores

How the local cache and Edge KV behave in `@gcoredev/fastedge-test`, how to seed and inspect them, and how to use them in tests.

## Overview

CDN apps (`proxy_cache_*`, `proxy_kv_store_*`) and HTTP apps (run through `fastedge-run`) use the same local cache and Edge KV. A value an app writes in one hook, or a fixture you load, is visible to every app that uses the same storage service.

| Store   | Scope                                                                    | Writable by apps | Seeded from                  |
| ------- | ------------------------------------------------------------------------ | ---------------- | ---------------------------- |
| Cache   | One bucket per `dc` (edge location)                                      | Yes              | `fixtures/stores/cache/<dc>.json` |
| Edge KV | Every runner and debugger using the same storage service, by store name  | No (read-only)   | `fixtures/stores/kv/<store>.json` |

Cache bucket selection, in order of precedence:

1. The `dc` set on the test config or runner.
2. The `dc` of the `edge` request context.
3. The `dc` passed to `createStores()`.
4. `"local"`.

The bucket is fixed when the app loads. Cache keys are scoped by `dc` only: the same key in two buckets is two separate entries.

Apps open a KV store by name. A store exists locally when it has a fixture (or was created in the Storage Explorer). Opening any other name fails the same way an unattached store fails on the edge (`AccessDenied` in the SDKs).

If stores are turned off (`stores: false`, or the service cannot start), the store functions still link, every call returns `InternalFailure`, and the first call in a hook logs `[host] stores are off: ...`.

## Where the Data Lives

The package runs one storage service per **stores root**. Every debugger server and every test process that resolves to the same root connects to the same service, so they share one cache, one set of KV stores and one clock.

The stores root for an app folder is resolved in this order:

1. The `FASTEDGE_STORES_ROOT` environment variable, if set.
2. The nearest ancestor folder containing `.git`. Sibling app folders in one repository therefore share their stores.
3. The app folder itself.

| Variable                | Type     | Effect                                                                  |
| ----------------------- | -------- | ----------------------------------------------------------------------- |
| `FASTEDGE_STORES_ROOT`  | `string` | Overrides the stores root. Fixtures load from `<root>/fixtures/stores/` |
| `WORKSPACE_PATH`        | `string` | Starting folder for the root lookup in `createStores()` when `FASTEDGE_APP_ROOT` is unset, before the process working directory |

How the service is shared:

- The first client starts the service as a detached process. Later clients find it through its descriptor file (`service.json`) and join it.
- A lock file (`service.lock`) makes simultaneous starters agree on one service. A log file (`service.log`) records start-up failures. These files are written by the package into a folder it manages for the stores root.
- Each client holds a lease and renews it. The service exits when the last lease is gone.
- If the service dies while clients are connected, the next renewal restarts it on the same port with the same token. A running `fastedge-run` process keeps working at the old address.
- Edits made at runtime (through the Storage Explorer or an app) live in the service until it restarts or is reset. [Save them as fixtures](#save-to-fixtures) to keep them.
- If another `fastedge-test` version speaks a different service protocol on the same root, startup fails with a message naming the process to stop.

Test stores created with `createStores()` do not use this shared service. See [Stores in Tests](#stores-in-tests).

## Seeding with Fixtures

Fixtures are JSON files under `<stores root>/fixtures/stores/`. They load when the service starts, when you reset from the Storage Explorer, and when `createStores()` creates or resets an instance.

```
fixtures/stores/kv/<store>.json     one file per Edge KV store; the file name is the store name
fixtures/stores/cache/<dc>.json     one file per cache bucket; the file name is the dc
```

A value or sorted-set member is a UTF-8 string, or `{ "base64": "..." }` for binary data. Base64 must be well-formed; an invalid value is a load error that names the file and key.

### Edge KV fixture

```json
{
  "strings": {
    "greeting": "hello",
    "logo": { "base64": "iVBORw0KGgo=" }
  },
  "zsets": {
    "leaderboard": [["alice", 120], ["bob", 95.5]]
  },
  "bloom": {
    "seen-ids": ["a1", "b2", "c3"]
  }
}
```

| Section   | Shape                                          | Notes                                                    |
| --------- | ---------------------------------------------- | -------------------------------------------------------- |
| `strings` | `{ [key: string]: Value }`                     | Values cannot be empty: the edge API refuses them        |
| `zsets`   | `{ [key: string]: [Value, number][] }`         | Pairs of `[member, score]`                               |
| `bloom`   | `{ [key: string]: string[] }`                  | Items are plain strings; stored as an exact set          |

`Value` is `string | { base64: string }`. All three sections are optional.

KV is read-only to apps, so KV fixtures **replace all KV data** when loaded. Stores or keys not in a fixture are gone after a load or reset.

### Cache fixture

```json
{
  "session:42": { "value": "active", "ttl_ms": 60000 },
  "avatar:42": { "base64": "iVBORw0KGgo=" }
}
```

| Field    | Type                              | Notes                                                           |
| -------- | --------------------------------- | --------------------------------------------------------------- |
| `value`  | `string`                          | UTF-8 text. Cache values may be empty                           |
| `base64` | `string`                          | Binary value, used instead of `value`                           |
| `ttl_ms` | `number` (non-negative integer)   | Optional. Omitted means the default TTL, counted from load time |

Cache fixtures **overwrite their keys** with a fresh TTL and leave other cached entries alone.

### Load errors

A malformed file (invalid JSON, wrong shape, empty KV string, negative or non-integer `ttl_ms`, invalid base64) is an error that names the file and the offending key. Nothing partial is loaded silently.

## Time and Expiry

Cache TTLs run on one service clock shared by every runner and debugger on the same storage service. Advancing it moves expiry for HTTP and CDN apps together.

- The default TTL and the maximum TTL are both 4 days. A larger TTL is clamped. `set` with TTL 0 uses the default; a negative TTL is `BadArgument`.
- `expire` with a negative TTL applies the default TTL; `expire` on a missing key returns `false`.
- `incr` accepts canonical decimal `i64` values only. An existing key keeps its TTL.
- Pausing the clock stops it, so the clock then moves only when you advance it. This makes expiry deterministic in manual and automated checks.

Ways to move the clock:

| Where                            | How                                                    |
| -------------------------------- | ------------------------------------------------------ |
| Storage Explorer                 | The Clock group: pause or resume, and advance buttons  |
| REST API                         | Clock routes in [API.md](./API.md)                     |
| Tests                            | `stores.advanceClock(ms)` and `stores.pauseClock(paused?)` on a `createStores()` instance |

## Storage Trace

For each request, the service records every cache and Edge KV call the app makes, in order, with the result. Values are not recorded, only their size.

| Field     | Type                       | Description                                                                |
| --------- | -------------------------- | -------------------------------------------------------------------------- |
| `app`     | `"cdn" \| "http"`          | Kind of app that made the call                                             |
| `hook`    | `string` (optional)        | CDN hook that made the call                                                |
| `kind`    | `"cache" \| "kv"`          | Which store                                                                |
| `op`      | `string`                   | Operation, for example `get` or `set`                                      |
| `dc`      | `string` (optional)        | Cache bucket, on cache calls                                               |
| `store`   | `string` (optional)        | Edge KV store, on KV calls                                                 |
| `key`     | `string` (optional)        | Key                                                                        |
| `pattern` | `string` (optional)        | Glob pattern, on `scan` and `zscan`                                        |
| `prefix`  | `string` (optional)        | Prefix, on `purge-prefix`                                                  |
| `result`  | `string`                   | `ok`, or the service error such as `wrong-type` or `invalid-pattern`       |
| `value`   | `string` (optional)        | A count, a flag, `missing` for a missed `get`, or the size of a value or list (`12 bytes`, `3 items`) |
| `at`      | `number`                   | Wall-clock time in milliseconds since the epoch                            |

The trace appears in each hook's result and in `storeCalls` on the request's results. See [TEST_FRAMEWORK.md](./TEST_FRAMEWORK.md) and [RUNNER.md](./RUNNER.md) for the result types, and [WEBSOCKET.md](./WEBSOCKET.md) for the debugger events. The service keeps the most recent 5000 traced calls and drops the oldest.

## Storage Explorer

The Storage Explorer is a page of the debugger. It works with or without an app loaded and shows the data of the connected storage service.

- **Edge KV tab:** lists the stores with their key counts. Each key is shown with its type (`string`, `zset`, `bloom`) and size; expand a key to see its value. You can:
  - add a key (a string value, optionally base64; a sorted set as one `score member` per line; a bloom filter as one item per line);
  - edit a key in place (a value that is cut off or binary cannot be edited there: replace it with the same key);
  - delete a key;
  - create or delete a whole store;
  - import a JSON file or pasted JSON, either in the fixture format or as a plain object of key → value (non-string values are stored as JSON text), optionally replacing the store's keys.
- **Cache tab:** shows the entries of one `dc` bucket with size and remaining TTL. A selector lists the known buckets, including the loaded app's own, and takes any other `dc`. You can add an entry (with optional TTL and base64), change an entry's TTL, and delete an entry.
- **Clock:** pause or resume the clock and advance it.
- **Reset:** returns to the fixture files. Every cache bucket is emptied and Edge KV is re-seeded. Unsaved KV edits are lost.
- **Refresh:** reloads the view from the service.

A store created in the Explorer is available to a loaded HTTP app after it reloads, which happens when you return to the Debugger page.

### Save to fixtures

Save writes the current Edge KV data to `fixtures/stores/kv/<store>.json` files. It first shows a line diff per file with a status (new, changed or deleted). New and changed files start selected; deletions are opt-in. Keys are written sorted, and a value is written as plain text when it is valid UTF-8 and as `{ "base64": "..." }` otherwise. Cache entries are not saved.

The save writes only what the diff showed. If the data changed since you opened the diff, the save is refused and you reopen the diff.

## Stores in Tests

By default, each test gets its own isolated stores: an in-memory storage service inside the test process, with no detached process, lock or lease. It is seeded from `fixtures/stores/` and dropped when the test ends. Tests cannot see each other's cache writes, and the debugger's service is not touched.

| Option                | Effect                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------- |
| default               | A fresh instance per test, seeded from `fixtures/stores/`, passed as `context.stores`    |
| `runnerConfig.stores` | Use the instance you give (shared by every runner given it); `false` turns stores off    |
| `stores: false`       | `context.stores` is `null`                                                               |

The `createStores()` options, the `TestStores` methods and the `stores` field types are defined in [TEST_FRAMEWORK.md](./TEST_FRAMEWORK.md#createstores) and [TEST_CONFIG.md](./TEST_CONFIG.md). In brief, a `TestStores` instance can read, write and delete cache entries directly, add data in the fixture formats (`seed`), advance or pause the clock, `reset()` to the fixtures, and `close()`.

```typescript
import { defineTestSuite, runFlow } from "@gcoredev/fastedge-test/test";

export default defineTestSuite({
  wasmPath: "./build/app.wasm",
  tests: [
    {
      name: "serves the cached value until it expires",
      run: async (runner, { stores }) => {
        if (!stores) throw new Error("stores are off");

        // Seed the cache, then run a request through the app.
        stores.seed({
          cache: { local: { "page:/home": { value: "<h1>cached</h1>", ttl_ms: 1000 } } },
        });
        await runFlow(runner, { url: "https://example.com/home" });

        // The app has not changed the entry yet.
        if (stores.cache.get("page:/home") !== "<h1>cached</h1>") {
          throw new Error("expected the seeded entry");
        }

        // Move the shared clock past the TTL: the entry is gone.
        stores.advanceClock(2000);
        if (stores.cache.get("page:/home") !== null) {
          throw new Error("expected the entry to have expired");
        }
      },
    },
  ],
});
```

To share one instance between several runners (for example a CDN app and an HTTP app that exchange data through the cache), create it with `createStores()` and pass it as `runnerConfig.stores`. Call `close()` when done.

## Local KV and a Real KV Store

A local KV fixture and a real Edge KV store hold the same kind of data, so you can move data between them with the Gcore API. The base URL is `https://api.gcore.com/fastedge/v1`. These steps use the API directly; the package does not call it.

### Export a real store into a fixture

1. `GET /kv` lists the stores (`id`, `name`). The `name` is the file name of the fixture.
2. `GET /kv/{store_id}/data` lists the entries: `key`, `datatype` (`kv`, `sorted_set` or `bloom_filter`) and, for `kv`, a `payload` with `value` and `encoding`.
3. `GET /kv/{store_id}/data/{key}` reads one entry in full. Use it for sorted sets and bloom filters, whose contents the list does not carry.

| API `datatype` | Fixture section |
| -------------- | --------------- |
| `kv`           | `strings`       |
| `sorted_set`   | `zsets`         |
| `bloom_filter` | `bloom`         |

For a `kv` entry, `encoding` decides how to write the value:

| `encoding` | Fixture value                                       |
| ---------- | --------------------------------------------------- |
| `plain`    | the string as is                                    |
| `base64`   | `{ "base64": "..." }`                               |
| `masked`   | cannot be exported: the API does not return the value |
| `sha256`   | cannot be exported: the API returns a hash, not the value |

### Seed a real store from a fixture

`PUT /kv/{store_id}/data` takes an array of operations:

```json
[
  { "op": "add", "key": "greeting", "datatype": "kv", "payload": { "value": "hello", "encoding": "plain" } }
]
```

For `kv` entries the payload is `{ "value", "encoding" }`; use `"encoding": "base64"` for a `{ "base64": "..." }` fixture value. For sorted sets and bloom filters, write one entry in the Gcore portal or API, read it back with `GET /kv/{store_id}/data/{key}`, and copy that shape: the read shape mirrors the write shape.

### Attach the store to the app

On the edge, an app reads a store only when the store is attached to the app. Attach it on the app (`PUT /apps/{app_id}`), keyed by the name the app opens:

```json
{ "stores": { "<name>": { "id": 123 } } }
```

Locally there is no attachment: every store with a fixture is open to every app.

### Limits

- Edge KV values cannot be empty, on the edge or in a fixture.
- The cache cannot be seeded on the edge. Cache fixtures exist only for local runs.

## Differences from the Edge

- **Cache key scope:** on the edge, cache keys are scoped per account and `dc`. Locally they are scoped by `dc` only, because one service is one account.
- **`incr` on a missing key:** on the edge the new key has no TTL and survives `purge` until a server restart. Locally it gets the default TTL and can be purged.
- **Bloom filters:** the edge uses probabilistic filters, so false positives are possible. Locally a bloom filter is an exact set with no false positives.
- **Store attachment:** on the edge an app opens only the stores attached to it. Locally every app opens every store that has a fixture, including each app of a resource.
- **Service restart:** if the storage service restarts on a new port, CDN runners follow it. A running `fastedge-run` process keeps the old address until its runner reloads.
- **Service-level `dc`:** a debugger on a shared service sees every `dc` bucket that has data; the edge shows an app only its own location's cache.

## See Also

- [TEST_FRAMEWORK.md](./TEST_FRAMEWORK.md): `createStores()`, `TestStores` and test suites
- [TEST_CONFIG.md](./TEST_CONFIG.md): the `stores` and `dc` fields of the test config
- [RUNNER.md](./RUNNER.md): runner configuration and results
- [API.md](./API.md): stores and clock REST routes
- [WEBSOCKET.md](./WEBSOCKET.md): debugger events
