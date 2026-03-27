# Integration Testing

**Status**: ✅ Complete - Full Property Coverage (17/17 Properties Tested) + HTTP WASM Suite (JS + Rust sync + Rust async) + send_http_response Short-Circuit
**Last Updated**: March 27, 2026

---

## Overview

The proxy-runner uses compiled WASM test applications for integration testing to ensure production parity with FastEdge CDN behavior. Integration tests verify the complete flow from WASM execution through property access control, header manipulation, request/response handling, and env var/secret injection.

HTTP WASM tests run against **three language variants** (JS, Rust sync, Rust async) using parameterized test execution. Each variant produces identical behavior — the same assertions run against all available WASM binaries.

---

## Test Application Structure

### Directory Organization

```
test-applications/
├── cdn-apps/                     # Proxy-WASM CDN applications
│   ├── properties/               # Property access control testing
│   │   ├── assembly/             # AssemblyScript source files (12 test apps)
│   │   └── ...
│   ├── cdn-headers/              # Header manipulation testing
│   │   └── assembly/
│   ├── cdn-redirect/             # send_http_response short-circuit testing
│   │   └── assembly/
│   ├── cdn-http-call/            # proxy_http_call testing
│   │   └── assembly/
│   └── cdn-variables-and-secrets/ # Env var/secret injection testing
│       └── assembly/
└── http-apps/
    ├── js/                       # JavaScript HTTP WASM apps (TypeScript + fastedge-build)
    │   ├── package.json
    │   └── src/
    │       ├── basic.ts
    │       ├── downstream-fetch.ts
    │       ├── variables-and-secrets.ts
    │       ├── headers.ts
    │       └── http-responder.ts
    └── rust/                     # Rust HTTP WASM apps
        ├── package.json          # pnpm build wrapper (builds both sync + async)
        ├── .cargo/config.toml    # target = wasm32-wasip1 (shared by sync + async)
        ├── sync/                 # Legacy #[fastedge::http] pattern (deprecated)
        │   ├── Cargo.toml        # Workspace: 5 crates
        │   ├── basic/
        │   ├── http-responder/
        │   ├── downstream-fetch/
        │   ├── headers/
        │   └── variables-and-secrets/
        └── async/                # Modern #[wstd::http_server] pattern
            ├── Cargo.toml        # Workspace: 5 crates
            ├── basic/
            ├── http-responder/
            ├── downstream-fetch/
            ├── headers/
            └── variables-and-secrets/

wasm/                             # Compiled WASM binaries (gitignored, built by CI)
├── cdn-apps/
│   ├── properties/               # 12 CDN proxy-wasm binaries
│   ├── headers/                  # Header manipulation binaries
│   ├── redirect/                 # send_http_response redirect binary
│   ├── http-call/                # proxy_http_call binaries
│   └── variables-and-secrets/    # Env var/secret binaries
└── http-apps/
    ├── js/                       # JS WASM binaries
    └── rust/
        ├── sync/                 # Rust sync WASM binaries
        └── async/                # Rust async WASM binaries

server/__tests__/integration/     # Integration test files
├── cdn-apps/
│   ├── property-access/          # Property access tests (35 tests)
│   ├── full-flow/                # CDN + downstream HTTP service tests (7 tests)
│   ├── http-call/                # proxy_http_call tests (9 tests)
│   ├── redirect/                 # send_http_response short-circuit tests (5 tests)
│   └── variables-and-secrets/    # CDN env var/secret tests (7 tests)
├── http-apps/
│   ├── shared/
│   │   └── variants.ts           # Variant definitions (js, rust-sync, rust-async)
│   ├── basic/                    # Basic HTTP execution (parameterized, 3 variants)
│   ├── downstream-fetch/         # Downstream fetch + modify (parameterized)
│   └── variables-and-secrets/    # Dotenv env var + secret injection (parameterized)
│       └── fixtures/
│           └── .env              # Test fixture dotenv file
└── utils/
    ├── wasm-loader.ts            # WASM binary loading utilities
    ├── test-helpers.ts           # CDN test helpers
    ├── http-wasm-helpers.ts      # HTTP WASM test helpers
    └── property-assertions.ts   # Property-specific assertions
```

---

## HTTP WASM Integration Tests

HTTP WASM tests exercise the `HttpWasmRunner`, which spawns `fastedge-run http` as a long-running process and forwards requests to it.

### Parameterized Multi-Variant Testing

All HTTP WASM tests are **parameterized** across three language variants using `shared/variants.ts`:

```typescript
// server/__tests__/integration/http-apps/shared/variants.ts
export const HTTP_APP_VARIANTS = [
  { name: 'js',         wasmDir: 'js' },
  { name: 'rust-sync',  wasmDir: 'rust/sync' },
  { name: 'rust-async',  wasmDir: 'rust/async' },
];
```

Each test file loops over variants and skips any whose WASM binary doesn't exist (via `existsSync`). This means JS tests always run, and Rust tests activate once binaries are built.

```typescript
for (const variant of HTTP_APP_VARIANTS) {
  const wasmPath = resolveWasmPath(variant, 'basic');
  const describeFn = wasmExists(variant, 'basic') ? describe.sequential : describe.skip;

  describeFn(`HTTP WASM - Basic Execution [${variant.name}]`, () => {
    // ... same assertions for all variants
  });
}
```

### Language Variants

| Variant | Source | Build | Pattern | `--wasi-http` |
|---------|--------|-------|---------|---------------|
| **JS** | TypeScript + `fastedge-build` | `pnpm build` in `js/` | FetchEvent handler | `true` |
| **Rust sync** | `#[fastedge::http]` (deprecated) | `cargo build` in `rust/sync/` | Sync `fn main(req)` | `false` (auto-detected) |
| **Rust async** | `#[wstd::http_server]` | `cargo build` in `rust/async/` | Async `fn main(req)` | `true` |

**Legacy sync detection**: `HttpWasmRunner` auto-detects legacy `#[fastedge::http]` binaries by inspecting WASM exports for the `process` function (via `server/utils/legacy-wasm-detect.ts`). Legacy binaries get `--wasi-http false`; all others get `--wasi-http true`. This detection is self-contained for easy removal when sync is retired.

### Test Suites

#### `basic/` (8 tests x 3 variants = 24 tests + 3 runner interface tests)
Verifies basic HTTP WASM execution: request/response, content-type, body, logs, headers, POST.

#### `downstream-fetch/` (8 tests x 3 variants = 24 tests)
Verifies an HTTP app that fetches from a downstream API (jsonplaceholder) and transforms the response.

#### `variables-and-secrets/` (6 tests x 3 variants = 18 tests)
Verifies that env vars and secrets loaded from dotenv files are accessible at runtime.

**Fixtures** (`fixtures/.env`):
```bash
FASTEDGE_VAR_ENV_USERNAME=test-user
FASTEDGE_VAR_SECRET_PASSWORD=test-secret
FASTEDGE_VAR_ENV_PASSWORD=test-secret    # For async variant (wstd has no secret API)
```

**Note**: The Rust async variant reads PASSWORD as an env var (not a secret) because `wstd` does not expose a secret API. The fixture includes both `FASTEDGE_VAR_SECRET_PASSWORD` and `FASTEDGE_VAR_ENV_PASSWORD` so both sync/JS (secret) and async (env var) paths resolve.

### HTTP WASM Test Helpers (`utils/http-wasm-helpers.ts`)

#### `createHttpWasmRunner()`
Creates a runner with dotenv **disabled**. Use for all tests that don't need dotenv.

#### `createHttpWasmRunnerWithDotenv()`
Creates a runner with dotenv **enabled**. Pass the fixture directory path via `load()`:
```typescript
const runner = createHttpWasmRunnerWithDotenv();
await runner.load(wasmPath, { dotenv: { path: '/abs/path/to/fixtures' } });
```

#### `isSuccessResponse(response)` / `hasContentType(response, type)`
Assertion helpers for HTTP responses.

#### `logsContain(response, substring)` / `getLogsAtLevel(response, level)`
Log inspection helpers.

### Writing HTTP WASM Tests with Dotenv

1. Create your test app source in `test-applications/http-apps/js/src/`
2. Build with `pnpm run build:test-apps` → output to `wasm/http-apps/js/`
3. Create a `fixtures/` directory next to your test file
4. Add a `.env` file using `FASTEDGE_VAR_ENV_<KEY>` and `FASTEDGE_VAR_SECRET_<KEY>` prefixes
5. Use `createHttpWasmRunnerWithDotenv()` and pass `dotenv.path` to `load()`

```typescript
const FIXTURES_DIR = join(process.cwd(), 'server/__tests__/integration/http-apps/my-suite/fixtures');
const WASM_PATH = join(process.cwd(), 'wasm/http-apps/js/my-app.wasm');

beforeAll(async () => {
  runner = createHttpWasmRunnerWithDotenv();
  await runner.load(WASM_PATH, { dotenv: { path: FIXTURES_DIR } });
}, 30000);
```

**Why `dotenv.path`?** Tests run from `fastedge-test/` as CWD. Without a path, `fastedge-run --dotenv` reads from the repo root — polluting it and sharing state between suites. Each suite's fixture dir keeps dotenv files isolated.

**Why not `dotenv.enabled` alone?** `dotenv.enabled` is the UI toggle (user-facing, in `fastedge-config.test.json`). `dotenv.path` is the programmatic override for non-CWD locations. See `context/features/DOTENV.md` for full design rationale.

---

## CDN Apps Integration Tests

### Test Application Structure

The CDN test suite includes **12 test applications** covering **17 properties** across **4 property access patterns**. See the full list in the original structure below.

### CDN Redirect / send_http_response (5 tests)

Tests that a CDN app can return a local response (e.g., 302 redirect) without contacting the origin. Uses `runFlow()` + framework assertions (dogfooding the test framework).

**App** (`cdn-redirect`): Reads `x-redirect-url` header → sets `Location` → calls `send_http_response(302)` → returns `StopIteration`.

**Key assertions:**
- `assertFinalStatus(result, 302)` + `assertFinalHeader(result, 'location', ...)`
- Only `onRequestHeaders` in `hookResults` (no origin fetch, no downstream hooks)
- `assertReturnCode(result.hookResults.onRequestHeaders, 1)` (StopIteration)
- Normal flow (Continue = 0) when header absent

See `features/SEND_HTTP_RESPONSE.md` for full design details.

### CDN Test Helpers (`utils/test-helpers.ts`)

#### `createTestRunner(fastEdgeConfig?)`
Creates a `ProxyWasmRunner` with property access control **always enabled** (production parity).

```typescript
const runner = createTestRunner(); // no dotenv, production rules enforced
```

#### `createHookCall(hook, headers?, body?)`
Creates a `HookCall` for testing a specific proxy-wasm hook.

---

## Running Tests

```bash
# Run all HTTP WASM integration tests
pnpm run test:integration:http

# Run all CDN integration tests
pnpm run test:integration:cdn

# Run all integration tests (CDN + HTTP)
pnpm run test:integration

# Run all tests (unit + integration)
pnpm test
```

### Current Test Coverage

**HTTP WASM**: 69 passing tests across 3 test files (parameterized x3 variants):
- `basic/basic-execution.test.ts` — 8 tests x 3 variants + 3 runner interface tests = 27
- `downstream-fetch/downstream-fetch.test.ts` — 8 tests x 3 variants = 24
- `variables-and-secrets/variables-and-secrets.test.ts` — 6 tests x 3 variants = 18

**CDN (proxy-wasm)**: 71 passing tests across 11 test files:
- `property-access/` — 43 tests (6 files)
- `full-flow/` — 7 tests (1 file)
- `http-call/` — 9 tests (2 files)
- `redirect/` — 5 tests (1 file)
- `variables-and-secrets/` — 7 tests (1 file)

---

## Adding New HTTP WASM Test Applications

New test apps should be added in all three variants (JS, Rust sync, Rust async) with identical behavior. Tests are parameterized — write once, run against all variants.

### Step 1: Create source apps in all variants

**JS** (`test-applications/http-apps/js/src/my-app.ts`):
```typescript
addEventListener("fetch", (event) => {
  event.respondWith(new Response("Hello from my-app"));
});
```

**Rust sync** (`test-applications/http-apps/rust/sync/my-app/src/lib.rs`):
```rust
#[fastedge::http]
fn main(_req: Request<Body>) -> Result<Response<Body>> {
    Response::builder().status(StatusCode::OK)
        .body(Body::from("Hello from my-app")).map_err(Into::into)
}
```

**Rust async** (`test-applications/http-apps/rust/async/my-app/src/lib.rs`):
```rust
#[wstd::http_server]
async fn main(_request: Request<Body>) -> anyhow::Result<Response<Body>> {
    Ok(Response::builder().status(200).body(Body::from("Hello from my-app"))?)
}
```

### Step 2: Build all variants

```bash
pnpm run build:http-test-apps   # Builds JS + Rust (sync + async)
```

### Step 3: Write parameterized test

```typescript
import { HTTP_APP_VARIANTS, resolveWasmPath, wasmExists } from '../shared/variants';
import { createHttpWasmRunner, isSuccessResponse } from '../../utils/http-wasm-helpers';

for (const variant of HTTP_APP_VARIANTS) {
  const wasmPath = resolveWasmPath(variant, 'my-app');
  const describeFn = wasmExists(variant, 'my-app') ? describe : describe.skip;

  describeFn(`My App [${variant.name}]`, () => {
    let runner: IWasmRunner;
    beforeAll(async () => {
      runner = createHttpWasmRunner();
      await runner.load(wasmPath);
    }, 20000);
    afterAll(async () => { await runner.cleanup(); });

    it('should respond correctly', async () => {
      const response = await runner.execute({ path: '/', method: 'GET', headers: {}, body: '' });
      expect(isSuccessResponse(response)).toBe(true);
    });
  });
}
```

---

## Adding New CDN (Proxy-WASM) Test Applications

### Step 1: Create AssemblyScript Source

Create new `.ts` file in `test-applications/cdn-apps/properties/assembly/`:

```typescript
export * from "@gcoredev/proxy-wasm-sdk-as/assembly/proxy";
import { Context, FilterHeadersStatusValues, log, LogLevelValues, RootContext, registerRootContext } from "@gcoredev/proxy-wasm-sdk-as/assembly";

class MyTestRoot extends RootContext {
  createContext(context_id: u32): Context { return new MyTestContext(context_id, this); }
}

class MyTestContext extends Context {
  constructor(context_id: u32, root_context: MyTestRoot) { super(context_id, root_context); }
  onRequestHeaders(a: u32, end_of_stream: bool): FilterHeadersStatusValues {
    log(LogLevelValues.info, "Testing my feature");
    return FilterHeadersStatusValues.Continue;
  }
}

registerRootContext((context_id: u32) => { return new MyTestRoot(context_id); }, "myTest");
```

### Step 2: Build and Test

```bash
pnpm build:test-apps
pnpm test:integration:cdn
```

---

## Best Practices

### ⚠️ RULE: Dogfood the Test Framework

**All new CDN integration tests MUST use the test framework API** (`server/test-framework/`) instead of raw vitest `expect()` calls with manual `callFullFlow()` arguments. This is non-negotiable — our integration tests serve double duty:

1. **Verify the feature** being tested
2. **Validate the test framework itself** — every test that uses `runFlow()`, `assertFinalStatus()`, etc. is a real-world exercise of our public API

**Use test-framework helpers:**

| Instead of...                                               | Use...                                          |
|-------------------------------------------------------------|-------------------------------------------------|
| `runner.callFullFlow(url, method, headers, body, ...)`      | `runFlow(runner, { url, requestHeaders })`       |
| `expect(result.finalResponse.status).toBe(302)`             | `assertFinalStatus(result, 302)`                 |
| `expect(result.finalResponse.headers['location']).toBe(x)`  | `assertFinalHeader(result, 'location', x)`       |
| `expect(result.hookResults.onRequestHeaders.returnCode)...` | `assertReturnCode(result.hookResults.onRequestHeaders, 1)` |
| Manual log checking                                         | `assertLog(result.hookResults.onRequestHeaders, 'substring')` |
| Manual header checking on hook result                       | `assertRequestHeader(result, 'name', 'value')`   |
| Manual property violation checking                          | `assertPropertyDenied(result, 'path')`            |

**Available imports from `server/test-framework/`:**
```typescript
import {
  runFlow,                    // Object-based callFullFlow wrapper (auto pseudo-headers)
  assertFinalStatus,          // Final HTTP response status
  assertFinalHeader,          // Final response header exists/matches
  assertRequestHeader,        // Hook output request header
  assertNoRequestHeader,      // Hook output request header absent
  assertResponseHeader,       // Hook output response header
  assertNoResponseHeader,     // Hook output response header absent
  assertReturnCode,           // Hook return code (0=Continue, 1=StopIteration)
  assertLog,                  // Log contains substring
  assertNoLog,                // Log does NOT contain substring
  logsContain,                // Boolean check (for conditional logic)
  assertPropertyAllowed,      // Property access was NOT denied
  assertPropertyDenied,       // Property access WAS denied
  hasPropertyAccessViolation, // Boolean check for property violations
} from '../../../../test-framework';
```

**When vitest `expect()` is still appropriate:**
- Structural assertions not covered by framework helpers (e.g., `expect(Object.keys(result.hookResults)).toEqual([...])`)
- Undefined/defined checks (e.g., `expect(result.hookResults.onRequestBody).toBeUndefined()`)
- JSON parsing and deep object matching
- Test setup validation

**When you add a new assertion to the framework** (`server/test-framework/assertions.ts`), write integration tests that exercise it. If existing tests use raw `expect()` for something the new helper covers, migrate them.

**Reference implementation:** `server/__tests__/integration/cdn-apps/redirect/cdn-redirect.test.ts` — the first suite written with full dogfooding.

### General Best Practices

1. **Spawn once**: Use `beforeAll()` for runner setup, not `beforeEach()` — spawning `fastedge-run` takes ~2s
2. **Port release delay**: Add `await new Promise(resolve => setTimeout(resolve, 2000))` at the start of `beforeAll()` when sequential test files share the port range
3. **Always cleanup**: Call `runner.cleanup()` in `afterAll()`
4. **Isolate dotenv fixtures**: Each suite that uses dotenv gets its own `fixtures/` directory
5. **Disable dotenv by default**: Use `createHttpWasmRunner()` (dotenv disabled) for all tests that don't need it — avoids any accidental `.env` pickup from CWD
6. **30s timeout for beforeAll**: WASM startup can take up to 20s under load; `beforeAll` timeout should be at least 30s

---

## Related Documentation

- `context/features/DOTENV.md` — Dotenv system design, `dotenvEnabled` vs `dotenvPath`
- `context/features/HTTP_WASM_IMPLEMENTATION.md` — HttpWasmRunner architecture
- `context/development/TESTING_GUIDE.md` — Unit testing patterns
- `context/development/TEST_PATTERNS.md` — Testing conventions
- `context/features/PROPERTY_IMPLEMENTATION_COMPLETE.md` — Property access control details
