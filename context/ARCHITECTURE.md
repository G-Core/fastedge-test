# Architecture

How fastedge-test is built: the processes, the modules, how a request moves through them, and
where each piece of code lives. Read the section for the subsystem you are changing.

- What a wasm app observes (properties, header rules, origins, dotenv precedence, store
  semantics, differences from the edge) is in [BEHAVIOUR.md](BEHAVIOUR.md).
- Setup, tests, test apps, conventions and cross-platform rules are in
  [DEVELOPMENT.md](DEVELOPMENT.md).
- The public API, config schema, test framework and WebSocket protocol are in `docs/`
  ([API.md](../docs/API.md), [RUNNER.md](../docs/RUNNER.md),
  [TEST_FRAMEWORK.md](../docs/TEST_FRAMEWORK.md), [TEST_CONFIG.md](../docs/TEST_CONFIG.md),
  [WEBSOCKET.md](../docs/WEBSOCKET.md), [DEBUGGER.md](../docs/DEBUGGER.md)).

---

## 1. The system at a glance

One package, `@gcoredev/fastedge-test`, used three ways: the debugger server with its React UI
(CLI or VS Code), the headless runner API, and the test framework built on that API. All three
run the same runners.

The UI (browser or VS Code webview) talks to the debugger server over REST and one WebSocket. The
server runs each CDN app in a worker thread and each HTTP app in a `fastedge-run` child process.
Both reach one shared storage service process: CDN workers through a synchronous bridge to their
parent, `fastedge-run` directly over HTTP.

| Process / thread | Started by | Lives until | Code |
|---|---|---|---|
| Debugger server | `bin/fastedge-debug.js` or VS Code `fork()` | SIGINT / SIGTERM | `server/server.ts` |
| CDN worker thread | `WorkerProxyWasmRunner` constructor | `cleanup()` | `server/runner/WorkerProxyWasmRunner.ts`, `cdn-worker.ts` |
| `fastedge-run http` | `HttpWasmRunner.load()` | `cleanup()` or next `load()` | `server/runner/HttpWasmRunner.ts` |
| Storage service | first `connectStores(root)` | no live lease (after a start grace) | `server/stores/service.ts`, `StoresManager.ts` |

The same runner classes serve the debugger and the library. The only difference is the state
manager: the server gives runners a WebSocket-backed `StateManager`; headless runners have none
(`IStateManager | null`, or the exported no-op `NullStateManager`).

---

## 2. Where code lives

| Subsystem | Key files |
|---|---|
| Debugger HTTP server, routes, startup | `server/server.ts`; Storage Explorer routes `server/storageExplorer.ts` |
| Runner interface and types | `server/runner/IWasmRunner.ts`, `types.ts`, `IStateManager.ts` |
| Runner creation | `server/runner/WasmRunnerFactory.ts` (server), `standalone.ts` (library) |
| CDN runner and its host functions | `ProxyWasmRunner.ts`, `WorkerProxyWasmRunner.ts` + `cdn-worker.ts`, `HostFunctions.ts`, `StoresHost.ts`, `server/fastedge-host/` (section 6) |
| CDN flow, origins, resources, context | `cdnFlow.ts`, `origin.ts`, `resource.ts`, `requestContext.ts` (sections 7, 8, 12) |
| HTTP runner | `HttpWasmRunner.ts`, `PortManager.ts`, `server/utils/fastedge-cli.ts` (section 10) |
| Wasm type detection | `server/utils/wasmTypeDetector.ts`; legacy sync flag `legacy-wasm-detect.ts` |
| Storage service and bridge | `server/stores/`, `server/runner/storesBridge.ts` (section 11) |
| WebSocket | `server/websocket/` (section 13) |
| Zod schemas, test framework | `server/schemas/` (section 15), `server/test-framework/` |
| Paths, dotenv, temp files | `server/utils/pathValidator.ts`, `dotenv-loader.ts`, `temp-file-manager.ts`, `workspaceFiles.ts` |
| Bundling, UI | `esbuild/` (section 3), `frontend/src/` (section 13) |

---

## 3. Entry points, packaging and startup

### Three entry points

| Entry | What runs | Starts a server? |
|---|---|---|
| `bin/fastedge-debug.js` (`fastedge-debug` bin, `pnpm start`) | resolves the app root, sets `WORKSPACE_PATH`, then `import("../dist/server.js")` | yes |
| VS Code extension | `fork()`s its copy of `dist/server.js` with `WORKSPACE_PATH`, `VSCODE_INTEGRATION=true`, `FASTEDGE_DEBUG_TOKEN` | yes |
| Library (`.`, `./test`, `./vitest` exports) | `dist/lib/*` built from `server/runner/index.ts` and `server/test-framework/` | never |

`dist/server.js` calls `startServer()` unconditionally when loaded. Do not add a
`require.main === module` guard: the bundle is CommonJS loaded through a dynamic `import()`,
where that check is false, and the server would never start.

`WORKSPACE_PATH` is the root every server-side relative path hangs off (configs, `.fastedge-debug/`,
path confinement, the port file; `process.cwd()` when unset). The CLI and the extension resolve it
alike: the nearest ancestor with a `.fastedge-debug/`, else with `package.json` or `Cargo.toml`,
else the start directory (CLI: `--project-dir` / `-C`, else the first argument, else the cwd).

### Startup sequence (`startServer()`)

1. Probe ports from `PORT` (default 5179) upwards, 50 slots: a `GET /health` that is refused
   means free; anything that answers, or times out (500 ms), means taken.
2. Listen on `FASTEDGE_BIND_HOST` (default `127.0.0.1`).
3. Print to **stderr** only: an MCP server may start the debugger and own stdout as its stdio
   transport. Without an injected token, print `http://<host>:<port>/#token=<token>` (plus the
   Vite URL when `FASTEDGE_DEV_FRONTEND` is set).
4. Write `<WORKSPACE_PATH>/.fastedge-debug/.debug-port` as `<port>:<sha256(token)>`, mode 0600,
   refusing a symlinked leaf or a `.fastedge-debug` that resolves outside the workspace. It is
   deleted on exit (also on Windows, via `process.on("exit")`).

`/health` answers `{"status":"ok","service":"fastedge-debugger"}`; the extension checks
`service` before reusing a process on a port, so keep that field.

### Builds

| Output | Built by | Contents / notes |
|---|---|---|
| `dist/server.js` | `esbuild/bundle-server.js` | One CJS file, all dependencies bundled (no `node_modules` needed at runtime). `import.meta.url` is shimmed. Copies `schemas/` → `dist/schemas/` and `fastedge-run/` → `dist/fastedge-cli/`. The npm package ships only `schemas/`, so `/api/schema/:name` falls back to `../schemas/`. |
| `dist/frontend/` | Vite (`frontend/vite.config.ts`) | Served statically by the server, with a SPA fallback to `index.html`. |
| `dist/lib/` | `esbuild/bundle-lib.js` | ESM + CJS + `.d.ts` for `.` and `./test`; ESM only for `./vitest`. `node:*` imports stay external. |

`tsconfig.lib.json` leaves out `server/server.ts` and `server/websocket/`: nothing reachable from
`server/runner/` or `server/test-framework/` may import the server or the WebSocket layer.

### Code embedded as strings

The CDN worker and the storage service run code in another thread or process, but the bundle is a
single file. `server/embedded.ts` exposes `embeddedSource("cdn-worker" | "stores-service")`;
the esbuild bundles (server, lib, watch mode) replace that module through `embeddedPlugin`
(`esbuild/embedded.js`) with prebuilt CommonJS strings. Unbundled runs (vitest) build the strings
on first use with the esbuild dev dependency. A new file that must run in a worker or child
process follows the same pattern; a separate file next to the bundle would not ship.

### The `fastedge-run` binary

Binaries for linux-x64, darwin-arm64 and win32 live in `fastedge-run/` (version pinned in
`.fastedge-cli-version`) and are copied to `dist/fastedge-cli/` at build. `findFastEdgeRunCli()`
looks in order at: `FASTEDGE_RUN_PATH` (an error if set but missing); the package root's
`dist/fastedge-cli/` then `fastedge-run/`; `fastedge-cli/` next to or one level above the
running bundle (the VS Code extension copies `server.js` and `fastedge-cli/` without this
package's `package.json`); then `PATH`.

---

## 4. The debugger server

### Request pipeline

| Order | Applies to | Does |
|---|---|---|
| 1 | all | `express.json` (20 MB limit, so base64 wasm uploads fit) |
| 2 | static files | serves `dist/frontend/`; HTML gets the frontend CSP |
| 3 | `/api/*` | Host check: loopback names, or `FASTEDGE_EXPECTED_HOST` exactly or as a suffix (Codespaces). Blocks DNS rebinding. |
| 4 | `/api/*` | Session token in the `x-fastedge-token` header, compared in constant time. No query-string token on REST. |
| 5 | routes | Zod-validate the body; 400 with a flattened error on failure |
| last | `GET *` | SPA fallback |

The session token is `FASTEDGE_DEBUG_TOKEN` (the extension injects it) or 32 random bytes per
server lifetime. The UI reads it from the URL fragment (`#token=`, never sent to a server) and
sends it as a header and as a WebSocket subprotocol. `/health` needs no token.

### One loaded target

The server holds either one app (`currentRunner`) or one resource (`currentResource`), never
both. `POST /api/load` cleans up the previous runner and resource; `POST /api/resource/load`
does the same in reverse. `/api/send` runs the resource when one is loaded, else the app.

`/api/load` and `/api/resource/load` are wrapped in `serialized()`: loads run one at a time in
arrival order, so an older load (for example a UI reload after an edge-`dc` change) cannot
finish last and win. Requests (`/api/send`, `/api/execute`, `/api/call`) are not queued; each
carries its own context.

`/api/load`: check the dotenv folder and the wasm path (`<workspace>` expanded) against the
workspace, or decode `wasmBase64`; detect the type; clean up the previous target; create the
runner with the shared stores connection and the cache `dc` (`dc ?? edge dc ?? "local"`); load;
emit `wasm_loaded` with the runner port (HTTP) and resolved path (path loads).

### Route groups

The REST reference is [docs/API.md](../docs/API.md); update it when a route changes.

| Group | Routes | Notes |
|---|---|---|
| Load | `/api/load`, `/api/dotenv` (PATCH), `/api/resource/load` | `/api/dotenv` re-applies dotenv without reloading the wasm (sections 6 and 10) |
| Run | `/api/send` (CDN app or resource), `/api/execute` (HTTP app; also CDN without an origin), `/api/call` (one CDN hook) | Every run is broadcast over WebSocket |
| Config | `/api/config` (GET/POST), `/api/config/show-save-dialog`, `/api/config/save-as`, `/api/schema/:name` | `/api/config` reads and writes `<workspace>/.fastedge-debug/fastedge-config.test.json` and returns `{ valid, validationErrors }` |
| Resources | `/api/resource/config`, `/api/resource/save` | Content-hash `version` for overwrite checks |
| Stores | `/api/stores*` (loaded app's panel), `/api/storage/*` (Storage Explorer) | Section 11 |
| Workspace / VS Code | `/api/environment`, `/api/workspace-wasm`, `/api/reload-workspace-wasm`, `/api/client-count`, `/api/workspace/files`, `/api/request-context/presets` | Section 14 |

The server always captures every log line (trace level); the UI filters by level, so changing the
level never needs a re-run.

`X-Source` on a request (`ui`, `ai_agent`, `api`...) becomes the `source` of the events it causes;
the UI uses it to tell its own actions from others' (section 13).

### Shutdown

SIGINT / SIGTERM: clean up the current runner and resource (stopping their `fastedge-run`
processes), release the stores lease (so an unused service
exits without waiting for its TTL), close WebSockets, delete the port file, close the HTTP server.

---

## 5. Runners

`IWasmRunner` (`server/runner/IWasmRunner.ts`) is the one interface for both app types:
`load(bufferOrPath, config)`, `callHook`, `callFullFlow`, `execute`, `applyDotenv`,
`setRequestContext`, `setStateManager`, `cleanup`, `getType`. Methods that do not apply to a
type throw (`execute` on CDN, `callHook` / `callFullFlow` on HTTP).

| Type | Class used | Executes with |
|---|---|---|
| `proxy-wasm` (CDN) | `WorkerProxyWasmRunner` → `ProxyWasmRunner` in a worker | Node `WebAssembly` + WASI preview1 |
| `http-wasm` | `HttpWasmRunner` | a `fastedge-run http` child process |

Creation:

- **Server:** `WasmRunnerFactory.createRunner(type, dotenvEnabled, stores)`; one `PortManager`
  shared by every HTTP runner the server creates. The server holds one stores connection for its
  lifetime and passes it with `owned: false`.
- **Library:** `createRunner` / `createRunnerFromBuffer` (`standalone.ts`): detect the type unless
  `config.runnerType` overrides it; connect to the shared service (owned, released by `cleanup()`),
  use a given `createStores()` instance (not owned), or none (`stores: false`); load, cleaning up
  on failure. Each HTTP runner gets its own `PortManager`.
- `ProxyWasmRunner` itself stays usable in-process (some integration tests construct it directly);
  it then has no stores unless `setStores()` is called.

Loading by path or by buffer: a path is read once (CDN) or handed to `fastedge-run` as is (HTTP);
a buffer is compiled directly (CDN) or written to a temp file that `cleanup()` removes (HTTP). The
UI tries a path first when the browser exposes one and falls back to base64.

### Type detection

`detectWasmType()` compiles the module: a compile failure is a component (`http-wasm`); otherwise
an export containing `http-handler`, `process` or `incoming-handler`, or an import from
`wasi:http/` / `wasi:io/`, is `http-wasm`; anything else, `proxy_*` exports or not, is
`proxy-wasm`. Keep all detection in this file.

---

## 6. The CDN runner

### Worker wrapper

Every CDN runner the server or the library creates is a `WorkerProxyWasmRunner`: it hosts one
`ProxyWasmRunner` in a worker thread and forwards each `IWasmRunner` call to it. The reason is the
stores: proxy-wasm host functions must return a status synchronously, so a cache or KV call blocks
the thread that runs the hook until the storage service answers. Blocking the worker leaves the
parent's event loop free to make that HTTP call, to answer the bridge, and (with `createStores()`)
to run the in-process storage service itself.

| Message | Direction | Shape |
|---|---|---|
| call | parent → worker | `{ id, method, args }` |
| reply | worker → parent | `{ id, value }` or `{ id, error }` |
| state event | worker → parent | `{ event, args }`, posted as it happens, so it arrives before the reply of the call that caused it |
| fetch | both ways | `{ fetch: { id, url, init } }` / `{ abortFetch: id }` up; `{ fetchReply: { id, status, statusText, headers, body \| error } }` down |

- **`fetch` runs in the parent.** The worker replaces `globalThis.fetch` with a proxy, so the
  origin fetch and every `proxy_http_call` go through the parent's undici dispatcher. That is what
  lets `mockOrigins()` (a global undici `MockAgent`) intercept CDN traffic. The egress check still
  runs in the worker, before the request is posted. Aborts (`proxy_http_call` timeouts) are
  forwarded.
- **Errors cross as structured clones**: the message survives, `error.cause` does not. Error text
  built from `cause` only appears in-process.
- **`RunnerConfig.stores` is stripped before `postMessage`**: a `createStores()` instance cannot be
  cloned. The worker reaches the stores through the bridge (section 11) set up in the constructor.
- **Lifetime**: the worker is `unref`'d while idle and `ref`'d while a call is pending, so a runner
  nobody cleans up does not keep Node alive. `cleanup()` terminates it, closes the bridge and
  releases an owned stores lease; later calls reject.

### `ProxyWasmRunner`

**Load** compiles the module once (`WebAssembly.compile`) and keeps it; nothing is instantiated.
It then loads dotenv into a `SecretStore` and `Dictionary` (precedence rules:
[BEHAVIOUR.md](BEHAVIOUR.md#dotenv)) and rebuilds `HostFunctions` around them. `applyDotenv()`
resets both stores and reloads them without recompiling.

**Every hook call gets a fresh instance.** `runHook()`:

1. Instantiate the compiled module with fresh imports (section 6, imports).
2. Point `MemoryManager` at the new memory; run WASI `initialize` and `_start` if exported
   (failures are logged at debug, not thrown).
3. Load the call's headers, bodies (raw bytes; base64 when `isBase64`), properties, request and
   response metadata into `HostFunctions` and `PropertyResolver`.
4. Initialize in this order: `proxy_on_context_create(root, 0)`, `proxy_on_vm_start`,
   `proxy_on_plugin_start`, `proxy_on_configure`. **The root context must be created first**: the
   Rust SDK panics on `proxy_on_vm_start` without it and leaves an internal `RefCell` borrowed, so
   every later call panics too. Errors here are swallowed (logged at debug); abort messages and
   `proc_exit(255)` during init are suppressed. VM and plugin config default to
   `{"test_mode":true}` (plus `root_id` when a `root_id`-like property is set), null-terminated.
5. Create a stream context, snapshot the **input** state (headers, bodies, all properties).
6. Call the hook export; run the `proxy_http_call` PAUSE loop (below) on the same instance.
7. Drop the instance, snapshot the **output** state, return
   `{ returnCode, logs, input, output, properties, storeCalls?, localResponse?, customProperties }`.

Nothing survives between hooks except what the caller passes in the next `HookCall` (section 7):
parity with the edge, and what lets a resource run different apps on different hooks.

**Imports** (`createImports()`):

- `env`: `HostFunctions.createImports()` (the proxy-wasm ABI, FastEdge secrets and dictionary,
  no-op stubs for the rest of what the SDKs import) plus `storesImports()`.
- `wasi_snapshot_preview1`: Node's `WASI` with `fd_write` wrapped to capture stdout/stderr lines
  as logs (`MemoryManager.captureFdWrite()`; a leading `[INFO]` etc. sets the level, else debug)
  and `proc_exit` intercepted (logged, never exits).
- **The WASI env is the dictionary, and is never empty.** With an empty dictionary the runner
  seeds `{ __FASTEDGE_RUNNER__: "1" }`. Node's `environ_get` returns `INVAL` for an empty table,
  which aborts an AssemblyScript app's `_start` mid-init; its first `process.env` read then traps.
  The edge always provides an env.

**Per-call context** lives in `AsyncLocalStorage`, not on the runner, because calls overlap (a hook
awaits a `proxy_http_call` fetch while another request starts):

| Store | Holds |
|---|---|
| `flowRequestId` | one request id per `callFullFlow`, shared by its hooks (storage trace) |
| `trace` | `{ requestId, hook }` attached to every store call of the hook |
| `callContext` | the client / edge context of this call; the dictionary reads its edge defaults through it |

`callHook()` has three paths: inside a full flow (context already applied); with
`HookCall.requestId` (one hook of a flow driven from outside, i.e. a resource: only the edge
dictionary is applied); standalone (`/api/call`: apply the context to properties and headers).

### Host-side modules

| Module | Role |
|---|---|
| `HostFunctions.ts` | The ABI: header maps as `HeaderTuples` (order and duplicates kept), bodies as bytes, properties via `PropertyResolver` gated by `PropertyAccessControl`, logs, local response, `proxy_http_call` state. |
| `MemoryManager.ts` | Reads and writes guest memory. Allocates through the guest's `proxy_on_memory_allocate` or `malloc`; falls back to a host region it grows in 64 KiB pages. Results use the pointer-to-pointer pattern (guest passes addresses for `ptr` and `len`, host writes both, little-endian). |
| `HeaderManager.ts` | Header conversions and the proxy-wasm binary map format (section 9). |
| `PropertyResolver.ts` | Resolves property paths (`.`, `/` and `\0` separators all accepted): explicit properties over URL-derived `request.*` values over request/response metadata. |
| `PropertyAccessControl.ts` | Per-hook read/write rules for built-in properties and the request's custom properties (rules: [BEHAVIOUR.md](BEHAVIOUR.md#properties-cdn-apps)). |
| `server/fastedge-host/` | `SecretStore` (values with optional `effectiveAt` rotation), `Dictionary` (with a defaults layer for the edge context), and the factory for `proxy_get_secret`, `proxy_get_effective_at_secret`, `proxy_secret_get`, `proxy_dictionary_get`. |
| `StoresHost.ts` | Cache and Edge KV host functions over a `SyncStores`; with stores off they still link and return `InternalFailure`, logging once per hook. |
| `egressPolicy.ts` | `checkEgressAllowed(url)` before every origin fetch and `proxy_http_call`: resolves the host and refuses link-local, cloud-metadata and ULA addresses (loopback and RFC 1918 stay allowed for local mock origins). Redirects are never followed (`redirect: "manual"`), since a target would not be checked. |

`RunnerConfig.enforceProductionPropertyRules` and `HookCall.enforceProductionPropertyRules` are
carried through but not read: the access rules always apply.

### `proxy_http_call`: the PAUSE loop

`proxy_http_call` only records the call (`upstream`, headers decoded from the binary map format,
body, timeout) and writes a token id. The runner does the I/O in `runHook()`:

```
rc = hook(...)
while rc == 1 (Pause) and a call is pending:
    take the pending call
    url = :scheme (default https) :// (:authority or upstream) + :path (default /)
    egress check; fetch with pseudo-headers stripped, no body for GET/HEAD,
        AbortSignal.timeout(timeoutMs), redirect: manual
    on failure: log "[host] http_call failed ..." at warn, deliver 0 headers / empty body
    store the response (Set-Cookie kept as separate tuples via getSetCookie())
    proxy_on_http_call_response(context, token, numHeaders, bodySize, 0)   ← same instance
    if the app called proxy_close_stream: stop
    rc = hook(...) again                                                   ← same instance
drop the instance
```

**Invariant: the instance is dropped only after the loop.** Apps set state in
`on_http_call_response` and read it when the hook re-runs. Calls are sequential, one pending call
at a time. The call-response header map is read-only and its trailers are unimplemented, as on
the edge.

### `send_http_response`

`proxy_send_local_response` stores status, text, body and the extra headers (`HeaderTuples`) in
`HostFunctions`; `runHook()` returns it as `HookResult.localResponse` (body as base64). The flow
ends early in `cdnFlow.ts` (section 7).

---

## 7. The CDN request flow (`cdnFlow.ts`)

`runCdnFlow(host, call, url)` is the single implementation of "one request through the four
hooks and an origin", shared by a single app and a resource. The host decides who runs what:

| `CdnFlowHost` member | Single app (`ProxyWasmRunner.callFullFlowLegacy`) | Resource (`resource.ts`) |
|---|---|---|
| `runnerFor(hook)` | itself, for every hook | the app assigned to that hook, or none (pass-through) |
| `start(url)` | extract `request.*` properties from the URL | nothing (done once per request) |
| `origin` | the declared origin's handler, if one was given | the rule's or main's origin: URL, built-in, or an HTTP app |
| `onHookError` | not set: a trap propagates | `interruptOnError` → 531, else continue as if the hook had not run |
| `events` | the state manager | none |

Steps:

1. Substitute `built-in` with `http://fastedge-builtin.debug`; call `host.start()`; inject `host`
   from the URL when the request has none; emit `request_started`.
2. `onRequestHeaders`, `onRequestBody`. After each, a hook that returned 1 with a local response
   ends the flow (`finalLocalResponse()`: the hook's response headers append-merged with the extra
   headers given to `send_http_response`). Otherwise its output request headers, body and
   `isBase64` become the next input; response headers it set are collected.
3. Origin: `host.origin(...)` if set; else the built-in echo for a built-in URL; else
   `fetchOrigin()`. The origin URL is the post-hook `request.url` property, not the original URL.
4. Response headers = request-phase response headers **append-merged** with the origin's (a name on
   both sides becomes a `string[]`, request-phase value first). The runner sees only cumulative
   header state after each hook, so it cannot tell an `add_` from a `replace_`; append is right for
   the documented `add_` pattern.
5. `onResponseHeaders`, `onResponseBody`, with the modified request side; local responses end the
   flow here too. Only `onResponseBody`'s output body is final.
6. Return `{ hookResults, finalResponse, calculatedProperties }`; `contentType` is re-read from the
   final headers (a hook may have changed it).

State that moves between hooks is passed explicitly: headers, body and `isBase64`, the property
map (each result's `properties`), and the request's custom properties
(`HookCall.customProperties` → `HookResult.customProperties`). A hook starts with exactly those.
New state a later hook must see is added to `HookCall` / `HookResult` and carried here, or
resources (different apps per hook) lose it.

`fetchOrigin()` flattens request headers to single strings, strips HTTP/2 pseudo-headers (Node's
fetch rejects them as header names) and adds the proxy headers listed in
[BEHAVIOUR.md](BEHAVIOUR.md#headers-the-runner-adds). The response body is read whole; binary content types become
base64 with `isBase64: true`, so response hooks run once with the full body.

Failure paths: a fetch error becomes `finalResponse` status 0, `statusText: "Fetch Failed"`, the
message (with `cause` when in-process) as body, and error results for both response hooks. A trap
in a resource hook with `interruptOnError` becomes status 531 with an empty body.

---

## 8. Origins (`origin.ts`)

A CDN request's origin is a URL (including the `built-in` echo) or a declared `builtIn` origin:
a fixed response, a body file, or a served folder. Semantics, control headers and limits:
[BEHAVIOUR.md](BEHAVIOUR.md#origins).

Mechanism:

- `resolveOrigin(origin, baseDir, confine)` runs **when the config loads**: relative paths are
  resolved against the config file (or the workspace for `/api/send`), confined (in the debugger,
  to the workspace) and replaced with real paths. Requests check against these fixed real paths
  and never resolve the configured path again, so a folder swapped for a symlink later is not
  followed.
- `originHandler(origin, host)` returns the function `cdnFlow` calls as `host.origin`: a URL goes
  to `builtInResponse()` or `fetchOrigin()`; a `builtIn` origin answers locally.
- Serving files: the request path is decoded once and refused with dot segments, dotfiles,
  backslashes, colons or NUL; the file's real path must be inside the folder, and the descriptor
  opened (`O_NOFOLLOW`, then checked by fd path on Linux or inode elsewhere) must be that file.

---

## 9. Headers

Three shapes, each at its own boundary (`server/runner/types.ts`):

| Type | Shape | Used for |
|---|---|---|
| `HeaderMap` | `Record<string, string>` | simple input (`FlowOptions.requestHeaders`, `HttpRequest.headers`) |
| `HeaderTuples` | `[string, string][]` | canonical, lossless: the wasm-visible maps in `HostFunctions`, local response headers |
| `HeaderRecord` | `Record<string, string \| string[]>` | wire and result format (`HookCall`, `HookResult`, `finalResponse`, WebSocket events, schemas); multi-valued keys as arrays |
| `IncomingHttpHeaders` | Node's type | `HttpResponse.headers` (HTTP apps) |

Conversions live in `HeaderManager`: `recordToTuples` at input, `tuplesToRecord` (lossless) at
output, `appendMerge`, `firstValue` (where one scalar is needed: properties, content type),
`flattenToMap` (only for `fetch` request headers; never Set-Cookie), and the binary map format:

```
[count: u32 LE] ([key_len: u32][val_len: u32]) × count  (key bytes \0 value bytes \0) × count
```

`serializeTuples` / `deserializeBinaryToTuples` handle it; `proxy_http_call` headers arrive in this
binary form. Every place that reads a `fetch` response (`fetchOrigin`, the PAUSE loop,
`parseFetchHeaders` for HTTP apps) collects `Set-Cookie` with `Headers.getSetCookie()`, because
`forEach` keeps only the last one.

---

## 10. The HTTP runner (`HttpWasmRunner`)

An HTTP app runs in a long-lived `fastedge-run` process; the runner forwards requests to it.

**Load:** stop any previous process; find the CLI; use the path (or write the buffer to a temp
file); detect the legacy sync pattern (`process` export → `--wasi-http false`, else `true`); pick
the port; spawn

```
fastedge-run http -p <port> -w <wasm> --wasi-http <bool> [--dotenv [<path>]]
```

with `RUST_LOG=info` and, when stores are on, `FASTEDGE_STORES_SERVICE=<url>,<token>,<dc>`
(rebuilt at every spawn, so a restarted service is picked up). Before passing a dotenv folder, the
runner checks its leaf files do not link outside it, because `fastedge-run` reads them itself.

**Ports:** dynamic ports come from `PortManager` (8100-8199, round robin, each checked free at
the OS level, since several processes may each have a pool). `httpPort` pins a port: a busy pinned
port fails the load (no fallback; the point is a stable address), and a pinned port is never added
to or released into the pool. The UI sends `httpPort` in the `/api/load` body; the server does not
read it from a config file, because the UI can load any `*.test.json`.

**Readiness:** wait for a `Listening on` line in the captured output (10 s; 20 s under tests),
not an HTTP probe: a probe executes the app, which can hang on a first-request JIT or an open body
stream. Exit before readiness, or timeout, is an error carrying the last log lines.

**Logs:** each stdout/stderr chunk gets a level from its prefix (default info for stdout, error for
stderr), is kept in `this.logs` (for the readiness wait and `execute()`'s `logs`) and is emitted at
once as `http_wasm_log`, which also covers requests the live preview sends straight to the process.

**Execute:** `fetch("http://localhost:<port><path>")` with the context headers under the request's
own, `redirect: "manual"` (3xx returned as is), a 30 s timeout; binary content types become
base64. With stores on, the runner sets a W3C `traceparent` (keeping a valid caller trace id,
always with a new parent id) and afterwards asks the service for that request's store calls
(500 ms budget; empty on failure).

**Dotenv change:** `applyDotenv()` kills and respawns the process on the same port and wasm. It
must clear `this.logs` first; otherwise the old `Listening on` line satisfies the readiness wait at
once and the next request fails with `fetch failed`.

**Stop:** SIGINT (`fastedge-run`'s graceful signal), then after 2 s SIGKILL, or
`taskkill /F /T` on Windows; release a non-pinned port; delete a temp wasm.

HTTP apps are not subject to `checkEgressAllowed`: their outbound calls leave from the child
process.

---

## 11. Stores: the storage service

One service process per **stores root** holds the cache and Edge KV in SQLite (`node:sqlite`, so
Node ≥ 22.13). Every CDN runner (through the bridge) and every `fastedge-run` (through
`FASTEDGE_STORES_SERVICE`) under that root uses the same data, as on the edge, where HTTP and CDN
apps share the cache. Semantics and known differences: [BEHAVIOUR.md](BEHAVIOUR.md#stores-cache-and-edge-kv).

| File | Role |
|---|---|
| `server/stores/StoresCore.ts` | All store semantics on SQLite: cache ops, Edge KV reads, the clock, seeding, snapshot / inspect |
| `server/stores/StoresServer.ts` | HTTP API on 127.0.0.1: token and `Host` check, `/v1/cache`, `/v1/kv`, `/v1/admin`, leases, trace log |
| `server/stores/service.ts` | The detached process (embedded, started as `node -` with the code on stdin) |
| `server/stores/StoresManager.ts` | `resolveStoresRoot`, `connectStores` (find or start, hold a lease), `request()` |
| `server/stores/fixtures.ts` | Loads `fixtures/stores/kv/*.json` and `fixtures/stores/cache/*.json` |
| `server/stores/testStores.ts` | `createStores()`: an isolated service inside the test process |
| `server/stores/trace.ts` | Bounded log of traced calls (sizes, never values) |

**Stores root:** `FASTEDGE_STORES_ROOT`, else the nearest ancestor with `.git`, else the app
folder. Sibling apps in one repo therefore share one service and one set of fixtures. Files live in
`<root>/.fastedge-debug/stores/`: `stores.db`, `service.json` (pid, port, token, protocol;
mode 0600, written via rename), `service.lock`, `service.log`, and a `.gitignore` of `*`. (Not
`.fastedge/`, which is the JS SDK's project folder.)

**Finding or starting the service (`connectStores`):** read `service.json`; if the service answers
`info` with the same protocol, use it. Otherwise take `service.lock` (exclusive create; a lock
older than 20 s is taken over), re-check, and spawn the service detached with
`FASTEDGE_STORES_ROOT` / `_TOKEN` / `_PORT`. Start failures are read back from `service.log`. A
running service with a different protocol version is a clear error, not a restart.

**Leases:** each connection leases with a TTL (default 30 s) and renews every TTL/3. The service
exits when no lease is live, after a start grace (`FASTEDGE_STORES_GRACE_MS`, default 15 s). If a
renewal fails, the client restarts the service **on the same port and token** (taken from the
stale `service.json`), so `fastedge-run` processes already pointed at it keep working; if that
port is taken, it listens elsewhere and only CDN runners follow. Nothing is retried: a call in
flight during a crash fails.

**Client transport:** `node:http`, not `fetch` (`mockOrigins()` replaces the global fetch
dispatcher and would swallow store traffic); `agent: false`, so no keep-alive socket holds a
process open; 4 s default timeout.

### Protocol (version 1)

`POST /v1/<cache|kv|admin>` with `authorization: Bearer <token>` and a JSON body `{ op, ... }`.
Replies are 200 with `{ ok: true, value }` or `{ ok: false, error: "<code>" }`; a malformed request
is 400 `bad-request`; wrong token, foreign `Host` or unknown path get an empty 401 / 403 / 404.
Binary values are base64; i64 / u64 are decimal strings. A cache / KV body may carry
`trace: { requestId, app, hook? }`.

| Kind | Ops |
|---|---|
| `cache` | `get`, `set` (`ttlMs`, null = default), `delete`, `exists`, `incr`, `expire`, `purge`, `purge-prefix`; all take `dc` |
| `kv` | `open`, `get`, `zrange-by-score`, `scan`, `zscan`, `bf-exists`; all take `store` |
| `admin` | `info`, `lease`, `release`, `kv-stores`, `advance-clock`, `pause-clock`, `traces`, `snapshot`, `inspect`, `reset`, `kv-put`, `kv-delete`, `kv-store-create`, `kv-store-delete`, `kv-export` |

New ops are added without a protocol bump (additive); an older running service refuses them with
`bad-request`, which the debugger reports as "close other fastedge-test instances, then restart
this debugger". Bump `STORES_PROTOCOL` only for an incompatible change.

### CDN apps: the synchronous bridge

`createBridge()` makes two `MessageChannel`s and a shared 4-byte flag. In the worker,
`SyncStoresClient.call()` posts `{ id, kind, body }` (cache bodies get the runner's `dc`), then
`Atomics.wait`s on the flag and drains replies with `receiveMessageOnPort` until its id appears.
The parent (`serveBridge`) makes the HTTP call, posts the reply, sets the flag and notifies. Rules:
one call in flight per worker; late replies are dropped by id; the worker's deadline (5 s) is longer
than the parent's HTTP timeout (4 s), so the parent answers first; no retry, since a mutation may
have landed before a failure. A failure surfaces to the app as `InternalFailure`.

### HTTP apps

`fastedge-run` reads `FASTEDGE_STORES_SERVICE`, asks `admin kv-stores` for the seeded store names
once at start, and attaches each one unless `--kv-stores` or dotenv already names it. A store
created later is seen only after a reload (the UI does that reload). A `fastedge-run` build
without stores forwarding ignores the variable and keeps its own in-memory cache.

### Storage trace

CDN: each store call carries `{ requestId, hook, app: "cdn" }`; after each hook the runner fetches
that hook's calls (`admin traces`) into `HookResult.storeCalls`. HTTP: the request's `traceparent`
is the request id, which `fastedge-run` attaches to its service calls. The log keeps 5,000 calls.

### In the debugger and in tests

- The debugger server connects once, on the first load that wants stores, and keeps that
  connection; if the service cannot start it logs `Stores are off: ...` and runners go on without.
  `loadedStores` holds the loaded app's `dc` for the Storage panel routes (`/api/stores*`, 409
  with no app loaded); the Storage Explorer routes (`/api/storage/*`) work with no app loaded.
  Routes: [docs/API.md](../docs/API.md#stores).
- `createStores()` runs a `StoresCore` and `StoresServer` inside the test process (no detached
  process, lock or lease). Runners given it do not own it and share its data. `runTestSuite` and
  the `./vitest` fixtures make one per test unless the suite passes its own.

---

## 12. Request context, resources

### Client / edge context (`requestContext.ts`)

`client` and `edge` are a preset plus overrides. `cdnContext(context)` expands them into
properties, request headers and dictionary defaults for a CDN app; `httpContextHeaders(context)`
into request headers for an HTTP app. `withHeaders(context, explicit)` puts explicit headers on top
(case-insensitively). The dictionary takes the edge values as **defaults** (`Dictionary.setDefaults`)
so dotenv entries win. Values and precedence: [BEHAVIOUR.md](BEHAVIOUR.md#request-context).

Where it is held: a runner keeps a load-time context (`load(config)` / `setRequestContext()`); a
call may carry its own (`HookCall.context`, `callFullFlow(..., context)`, `HttpRequest.context`),
which replaces it for that call only. The server passes a body's context only when the body names
`client` or `edge` (`requestContextOf()`). In a CDN full flow the context is applied once at the
start; hooks inside the flow do not get it again (a hook may have removed a header). The cache
`dc` is fixed at load; the UI reloads the app when the edge `dc` or preset changes.

### Resources (`resource.ts`)

A resource runs one request through several apps: one CDN app per hook, and an origin that is a
URL, a built-in origin, or an HTTP app. Config format: [TEST_CONFIG.md](../docs/TEST_CONFIG.md);
edge rules it models: [BEHAVIOUR.md](BEHAVIOUR.md#resources).

`createResource(fileOrObject, { stores, root })`:

1. Parse with `ResourceConfigSchema`; check app references and rule regexes; resolve origins.
2. For each app, resolve its wasm and dotenv (from `wasm`, or from a referenced
   `fastedge-config.test.json`, whose `wasm.path` is relative to its project root: the nearest
   folder with `Cargo.toml` or `package.json`), confine paths to `root` when given, and
   `createRunner()` it with the resource's stores, `dc`, client and edge.
3. Check types: hooks need CDN apps, an app origin an HTTP app. On error, clean up all runners.

`resource.request()`:

- First reload any app whose wasm `mtime` changed (serialized; a failed reload fails that request
  and the next one tries again).
- Match the first rule whose regex matches the URL path; its `hooks`, when set, replace main's
  entirely; its `origin`, when set, replaces main's.
- Apply the resource's context once, build the starting properties (URL-derived, context, config,
  request), and call `runCdnFlow` with one `requestId` for the whole request. Each hook goes to its
  app's runner with `{ requestId, context }`, so traces and the edge dictionary line up across apps.
- An HTTP-app origin is called through `execute()` with pseudo-headers stripped and headers
  flattened; its store calls are returned with the origin.

Each app is its own runner (its own worker or `fastedge-run`). In the debugger every file must be
inside the workspace. The Resource page saves the file as written (no schema defaults filled in).
Its Request Context panel edits the file's top-level `client` and `edge` (one for every app, as
one POP runs all of a request's apps); the next send saves and reloads, since a runner's `dc` is
fixed at load.

---

## 13. Frontend

React 19 + Vite + Zustand, in `frontend/src/`. Component conventions:
[DEVELOPMENT.md](DEVELOPMENT.md).

### Structure

| Folder | Holds |
|---|---|
| `App.tsx` | Pages (Debugger / Storage Explorer tabs), the Multi-app toggle, loader and config buttons, **all WebSocket event handling**, dotenv and edge-`dc` reload effects |
| `views/` | `ProxyWasmView`, `HttpWasmView`, `ResourceView`, `StorageExplorerView`: one container per view; they compose components and talk to the store |
| `components/common/` | Shared by more than one view (request panel, response panel, logs, request context, stores panel, loader...) |
| `components/proxy-wasm/` | CDN only: `HookStagesPanel` (also exports `HookDetail`, reused by the Resource page), `OriginEditor`, `OriginSection` |
| `api/index.ts` | REST client (`apiFetch` adds the token header) |
| `hooks/` | `useWasm`, `useWebSocket`, `useWorkspaceFiles`, `websocket-types.ts` (mirror of `server/websocket/types.ts`) |

The Debugger view is chosen by `wasmType` from the store. With the Multi-app toggle on,
`ResourceView` replaces the single-app view; both stay mounted (one hidden), so switching keeps
their state; the Storage Explorer page also keeps the Debugger mounted. `main.tsx` does not use
`StrictMode`: its double mount would open two WebSockets in development.

### State

One Zustand store, `useAppStore`, built from slices (`request`, `wasm`, `results`, `config`, `ui`,
`httpWasm`) with Immer, persist and devtools (dev builds only). `AppStore` and every slice type are
in `stores/types.ts`. Resource and Storage Explorer state is local to their views (and `App.tsx`
for the loaded resource), not in the store.

- **Calculated properties are never merged into `properties`.** The URL-derived `request.*` values
  from a run go to `calculatedProperties` and are shown read-only; merging them would send stale
  values back as explicit properties on the next request.
- `loadFromConfig()` / `exportConfig()` map between the store and a `fastedge-config.test.json`;
  the request shape (`url` or `path`) follows `wasmType`. A new field that belongs in configs is
  added there and in the server's `TestConfigSchema`.
- Persistence writes `{ request, config, ui }` (a subset) to localStorage under
  `proxy-runner-config`, debounced 500 ms. The config file, not localStorage, is how a setup is
  kept and shared.

### Talking to the server

- **REST:** `api/index.ts`. `uploadWasm()` tries `wasmPath` when the environment exposes a file
  path and falls back to `wasmBase64`. A path typed into the loader resolves against the server's
  working directory and must be inside the workspace.
- **WebSocket:** `useWebSocket` connects to `/ws` on the page's own port with the token as the
  `fastedge-token.<token>` subprotocol, replacing `localhost` with `127.0.0.1` (a browser trying
  `::1` first can stall for many seconds). Reconnects with backoff from 200 ms ×1.5 up to 3 s, 15
  attempts. In development Vite proxies `/api` and `/ws` to port 5179.
- **The UI follows the server, not its own requests.** Results are set from WebSocket events, so
  a request made by an agent, the extension or another tab shows up the same way. `wasm_loaded`
  from a source other than `ui` calls `setWasmLoaded()` (no second load); a `resource_loaded`
  turns the Multi-app toggle on and clears the app; a `wasm_loaded` does the reverse.

| Event | Emitted by | UI effect |
|---|---|---|
| `wasm_loaded` | `/api/load` | runner port for the live preview; sync store when loaded elsewhere; leave Multi-app |
| `request_started` | `cdnFlow` | set URL / method / headers (the canonical built-in URL comes back this way); clear results |
| `hook_executed` | `cdnFlow` | per-hook partial result |
| `request_completed` | `/api/send`, `/api/execute` (CDN) | hook results, final response, calculated properties |
| `request_failed` | run routes | error on every hook |
| `http_wasm_log` | `HttpWasmRunner` output | append to HTTP logs (never replace) |
| `http_wasm_request_completed` | `/api/execute` (HTTP) | response only; logs arrive as `http_wasm_log` |
| `properties_updated` | `POST /api/config` | `mergeProperties()` |
| `reload_workspace_wasm` | `/api/reload-workspace-wasm` | `loadWasm(path)` from the UI |
| `resource_loaded`, `resource_saved`, `resource_request_completed` | resource routes | Resource page state; a page showing a saved file reloads it or warns |
| `connection_status` | `WebSocketManager` | connection indicator, client count |

Event payloads: [docs/WEBSOCKET.md](../docs/WEBSOCKET.md).

### Feature mechanics

- **HTTP live preview.** The runner port reaches the UI on `wasm_loaded` (`httpRunnerPort`, null
  for CDN apps). Live mode points an iframe straight at `http://localhost:<runnerPort><path>`,
  with no sandbox and no proxy: proxying through the debugger would fight its own UI for `/`.
  The static preview is a sandboxed `srcDoc` without scripts. Live resets to off on every load.
  `fastedge-run` must stay alive between requests for this to work.
- **Config save.** `ConfigEditorModal` tries, in order: in the VS Code webview, a `postMessage` to
  the extension, which shows its dialog and writes the file; the File System Access API; the
  server's Electron dialog (`show-save-dialog` vends a path, `save-as` accepts only that path,
  once); a browser download. Loading in the webview also goes through the extension.
- **Storage.** `StoresPanel` refreshes on open, on a `dc` switch, after each request, and on the
  window event `fastedge:stores-changed` the Storage Explorer fires after each edit
  (`detail.storeList` set when stores were created or deleted: a loaded HTTP app then reloads).
- **Path suggestions** come from `GET /api/workspace/files`: a browser file picker gives contents,
  never a path.

---

## 14. VS Code integration

The extension bundles the release build (minus `dist/lib/`), forks `server.js`, and shows the UI
in a webview iframe with `#token=` in its URL. The server learns it is embedded from
`VSCODE_INTEGRATION=true` and `WORKSPACE_PATH`.

| Moment | Who calls `/api/load` | How the UI learns |
|---|---|---|
| Plain browser | the UI (`loadWasm`) | the response |
| Extension, first build | the extension, by path (`<workspace>/.fastedge-debug/app.wasm`) | `wasm_loaded` → `setWasmLoaded()` |
| Extension, rebuild | the UI, after `/api/reload-workspace-wasm` emits `reload_workspace_wasm` | the response |

Before its first load the extension polls `GET /api/client-count` until the UI's WebSocket is
connected (5 s cap): an event emitted before that would be lost and the UI would stay empty. The
UI does not load the workspace wasm on mount: that raced the extension's load and started two
`fastedge-run` processes. Drag-and-drop does not reach a webview (VS Code intercepts file drags);
the extension's commands load files there.

---

## 15. Files on disk, schemas

| Path (under the workspace) | Written by | Holds |
|---|---|---|
| `.fastedge-debug/fastedge-config.test.json` | `POST /api/config`, the UI | The single-app test config read by `GET /api/config` |
| `.fastedge-debug/fastedge-cdn-resource.test.json` | Resource page | Default resource file |
| `.fastedge-debug/app.wasm` | the VS Code extension's build | The workspace wasm |
| `.fastedge-debug/.debug-port` | the server | `<port>:<sha256(token)>` while running |
| `<stores root>/.fastedge-debug/stores/` | the storage service | Section 11 |
| `<stores root>/fixtures/stores/` | users, Storage Explorer "Save to fixtures" | Edge KV and cache fixtures |

The Zod schemas in `server/schemas/` are the source of truth for configs and API bodies.
`scripts/generate-schemas.ts` turns them into `schemas/*.schema.json` (checked in; served by
`/api/schema/:name` from an allowlist built at startup) with `toJSONSchema({ io: "input" })`, so a
field with a default is optional. Runner result types (`HookResult`, `FullFlowResult`, ...) come
from the TypeScript types via `ts-json-schema-generator`. Change a schema, then regenerate.

---

## 16. Security boundaries

The debugger runs untrusted wasm against local files and the network, so these checks are load
bearing; keep them when moving code.

| Boundary | Mechanism | Where |
|---|---|---|
| Who can reach the API | loopback bind; Host allowlist; session token header; WS token + Origin check | `server.ts`, `utils/token.ts`, `WebSocketManager.ts` |
| What the page can do | CSP: same-origin scripts, `connect-src` limited to self and loopback WebSockets | `server.ts` `FRONTEND_CSP` |
| Which files load | `validatePath`: workspace confinement (lexical and realpath), `.wasm` extension, blocked system and credential folders | `utils/pathValidator.ts` |
| Dotenv folders | resolve against the workspace; leaf files must not link outside (also enforced in `HttpWasmRunner`, so library users get it) | `utils/dotenv-loader.ts` |
| Where config saves go | `/api/config` writes only its fixed file; `save-as` only to a path the dialog just vended | `server.ts` |
| Resource files | inside the workspace, never written through a symlink | `server.ts`, `resource.ts` |
| Outbound CDN fetches | `checkEgressAllowed`, no redirect following | `runner/egressPolicy.ts` |
| Stores service | 127.0.0.1 only, bearer token, `Host` check, descriptor mode 0600 | `stores/StoresServer.ts`, `service.ts` |

---

## 17. Invariants and gotchas

- **Every CDN runner outside a few in-process tests is a worker.** Anything a runner needs must be
  cloneable through `postMessage`, and `fetch` is the parent's. Code that only works in-process
  (error `cause`, non-cloneable config) silently differs under the worker; the CDN integration
  suite runs both ways (`FASTEDGE_TEST_CDN_RUNNER=worker`).
- **Runner ports are dynamic.** Read `httpRunnerPort` from the store; never assume 8100.
- **The Vite dev proxy targets port 5179.** If the backend had to move to another port, the dev
  frontend talks to the wrong (or no) server.
- **Explicit beats derived.** Explicit properties, headers and dotenv entries are layered over the
  request context and URL-derived values; never write derived values back into user state
  (calculated properties, dictionary defaults).
- **New WebSocket events** need the type in `server/websocket/types.ts`, its mirror in
  `frontend/src/hooks/websocket-types.ts`, an `IStateManager` method (and a `NullStateManager`
  no-op) when a runner emits it, a handler in `App.tsx`, and an entry in `docs/WEBSOCKET.md`.
