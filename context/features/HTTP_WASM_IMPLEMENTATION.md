# HTTP WASM Runner

How HTTP (wasi-http / component model) apps run. For the REST API see
`context/development/AI_AGENT_API_GUIDE.md` and `docs/API.md`.

## WASM Type Detection

### How Detection Works

The server detects the type at `POST /api/load` (no `wasmType` in the body), returns it as
`wasmType`, and the UI routes to `HttpWasmView` or `ProxyWasmView` from it.

| Type | Build tool | Detected by |
|------|-----------|-------------|
| HTTP WASM (component model) | JS/TS SDK | Core compile fails |
| HTTP WASM (core module) | Rust | `http-handler` / `process` / `incoming-handler` export, or `wasi:http/` / `wasi:io/` imports |
| Proxy-WASM | Rust / AssemblyScript proxy-wasm SDKs | `proxy_*` exports (also the default) |


Detection lives in `server/utils/wasmTypeDetector.ts`. It uses `WebAssembly.compile()` plus export/import inspection:

```
WebAssembly.compile(buffer)
  → fails (component model binaries always fail core compilation)  →  "http-wasm"
  → succeeds → check exports + imports:
      has "http-handler", "process", or "incoming-handler" exports  →  "http-wasm"
      has wasi:http/ or wasi:io/ imports                            →  "http-wasm"  (wstd async)
      has "proxy_*" exports                                         →  "proxy-wasm"
      neither                                                       →  "proxy-wasm"  (safe default)
```

The `incoming-handler` check catches modern Rust wstd binaries that export `wasi:http/incoming-handler@0.2.9#handle`. The import check is a fallback for any wstd binary whose exports change in future toolchain versions. Tests in `server/__tests__/unit/utils/wasmTypeDetector.test.ts` cover all four detection paths using real compiled binaries.

**Rule**: Do not add WASM type detection logic anywhere except `wasmTypeDetector.ts`.

### Overriding Detection

Add `runnerType` to `RunnerConfig` to bypass detection entirely:

```typescript
defineTestSuite({
  wasmPath: './my-http-app.wasm',
  runnerConfig: { runnerType: 'http-wasm' },
  tests: [...]
})
```

`RunnerConfig` fields:
- `dotenv?: { enabled?: boolean; path?: string }` — load `.env.variables` / `.env.secrets`
- `enforceProductionPropertyRules?: boolean` — enforce CDN property access rules
- `runnerType?: 'http-wasm' | 'proxy-wasm'` — override auto-detection

### Runner Architecture

```
IWasmRunner (interface)
├── ProxyWasmRunner  — CDN/proxy-wasm ABI, uses Node WebAssembly API + WASI
└── HttpWasmRunner   — HTTP component model, spawns fastedge-run http process
```

`standalone.ts` (`createRunner` / `createRunnerFromBuffer`) is the entry point for headless test-framework use. It imports `detectWasmType` from `wasmTypeDetector.ts` and honors `config.runnerType` as an override.

### Legacy Sync Detection (`--wasi-http` flag)

`HttpWasmRunner` auto-detects whether a binary is a legacy `#[fastedge::http]` sync app or a modern `#[wstd::http_server]` async app by inspecting WASM exports at load time.

**Detection signal** (in `server/utils/legacy-wasm-detect.ts`):
- Binary exports `process` → legacy sync → `--wasi-http false`
- Binary does NOT export `process` (or fails `WebAssembly.compile`) → modern/JS → `--wasi-http true`

**How it works**:
```
isLegacySyncWasm(buffer)
  → WebAssembly.compile(buffer) succeeds + has "process" export  →  true (legacy)
  → WebAssembly.compile(buffer) succeeds + no "process" export   →  false (modern)
  → WebAssembly.compile(buffer) fails (component model)          →  false (modern)
```

**Deprecation**: The `#[fastedge::http]` sync pattern is deprecated. The `legacy-wasm-detect.ts` module and `isLegacySync` field in `HttpWasmRunner` are self-contained — delete them when sync support is retired.

**Test apps**: 5 Rust basic + 5 Rust wasi apps in `test-applications/http-apps/rust/` mirror the 5 JS apps 1:1 in name and behavior. All build with `cargo build --target wasm32-wasip1` (no `cargo-component` needed).

---

## fastedge-run process

`HttpWasmRunner` spawns `fastedge-run http -p <port> -w <wasm> --wasi-http <bool> [--dotenv [path]]`
as a long-running process and forwards each request to `http://localhost:<port><path>`.

- **CLI discovery** (`server/utils/fastedge-cli.ts`): `FASTEDGE_RUN_PATH`, then the bundled
  binary (`fastedge-cli/`, `dist/fastedge-cli/` in the npm package), then `PATH`.
- **Startup**: `waitForServerReady()` waits for the process's "Listening on" log line (10 s, 20 s
  under tests), else `FastEdge-run server did not start within …`.
- **Shutdown**: SIGINT (fastedge-run's graceful signal; SIGTERM was much slower), SIGKILL after a
  short timeout.
- **Logs**: stdout/stderr are captured; `execute()` clears them per request.

### Ports

- Dynamic ports come from `PortManager`, 8100-8199, checked free at the OS level.
- `httpPort` pins the port. It reaches `/api/load` in the request body from the UI, not read
  server-side from a config file, because the UI can load any `*.test.json` (picker, default or
  dropped file). A pinned port that is busy fails the load (no fallback), and a pinned port is
  never added to or released into the 8100-8199 pool.

### Dotenv restarts the process

`applyDotenv()` restarts fastedge-run with the new `--dotenv` flag (the WASM is not re-read). It
must clear the captured logs before respawning: otherwise the old process's "Listening on" line
makes `waitForServerReady()` return at once and the next request fails with `fetch failed`.

### Redirects

`execute()` fetches with `redirect: "manual"`: 3xx responses (status + `Location`) come back
verbatim, as the edge returns redirects to the client. `redirect: "error"` was rejected because it
throws on every 3xx. There is no option to follow redirects; to follow one, send a second request
to `response.headers.location` (a relative or same-host Location as the new path; a cross-host one
cannot go through the runner).

## Tests

- `pnpm run test:integration:http` runs the HTTP app suites sequentially
  (`vitest.integration.http.config.ts`, `fileParallelism: false`) to avoid process and port
  contention; the CDN suites run in parallel. `pnpm run test:integration` runs both streams at once.
- Test helpers share one `PortManager` (`server/__tests__/integration/utils/http-wasm-helpers.ts`).
