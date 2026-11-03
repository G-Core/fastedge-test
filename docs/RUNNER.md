# Runner API

Low-level programmatic API for executing WASM binaries. Use this when you need direct control over runner lifecycle, hook execution, or headless test automation outside the test framework.

## Import

```typescript
import {
  createRunner,
  createRunnerFromBuffer,
  ProxyWasmRunner,
  HttpWasmRunner,
  WasmRunnerFactory,
  NullStateManager,
  BUILTIN_URL,
  BUILTIN_SHORTHAND,
} from '@gcoredev/fastedge-test';

import type {
  IWasmRunner,
  WasmType,
  RunnerConfig,
  HttpRequest,
  HttpResponse,
  IStateManager,
  HookResult,
  FullFlowResult,
  HookCall,
} from '@gcoredev/fastedge-test';
```

`HeaderMap`, `HeaderRecord`, `LogEntry`, `ProxyStatus`, and `EventSource` are described under [Supporting Types](#supporting-types) and [IStateManager](#istatemanager). They are not exported from the package root.

## Creating a Runner

### createRunner

Creates a fully loaded runner from a WASM file on disk. Detects the WASM type automatically unless overridden via `config.runnerType`.

```typescript
function createRunner(
  wasmPath: string,
  config?: RunnerConfig
): Promise<IWasmRunner>
```

**Parameters**

| Parameter  | Type           | Description              |
| ---------- | -------------- | ------------------------ |
| `wasmPath` | `string`       | Path to the `.wasm` file |
| `config`   | `RunnerConfig` | Optional configuration   |

**Returns** `Promise<IWasmRunner>` — a loaded runner ready for execution.

```typescript
import { createRunner } from '@gcoredev/fastedge-test';

const runner = await createRunner('./my-app.wasm');
// runner is loaded and ready
await runner.cleanup();
```

### createRunnerFromBuffer

Creates a fully loaded runner from an in-memory `Buffer`. Useful when you have already read the WASM binary (for example from a test fixture or download).

```typescript
function createRunnerFromBuffer(
  buffer: Buffer,
  config?: RunnerConfig
): Promise<IWasmRunner>
```

**Parameters**

| Parameter | Type           | Description            |
| --------- | -------------- | ---------------------- |
| `buffer`  | `Buffer`       | WASM binary content    |
| `config`  | `RunnerConfig` | Optional configuration |

**Returns** `Promise<IWasmRunner>` — a loaded runner ready for execution.

```typescript
import { createRunnerFromBuffer } from '@gcoredev/fastedge-test';
import { readFile } from 'fs/promises';

const buffer = await readFile('./my-app.wasm');
const runner = await createRunnerFromBuffer(buffer, {
  runnerType: 'proxy-wasm',
});
await runner.cleanup();
```

## IWasmRunner Interface

```typescript
interface IWasmRunner {
  load(bufferOrPath: Buffer | string, config?: RunnerConfig): Promise<void>;
  execute(request: HttpRequest): Promise<HttpResponse>;
  callHook(hookCall: HookCall): Promise<HookResult>;
  callFullFlow(
    url: string,
    method: string,
    headers: Record<string, string>,
    body: string,
    properties: Record<string, unknown>,
    enforceProductionPropertyRules: boolean
  ): Promise<FullFlowResult>;
  applyDotenv(enabled: boolean, path?: string): Promise<void>;
  cleanup(): Promise<void>;
  getType(): WasmType;
  setStateManager(stateManager: IStateManager): void;
}
```

### load

Loads a WASM binary into the runner. For `ProxyWasmRunner`, compiles the module and loads dotenv files. For `HttpWasmRunner`, spawns a `fastedge-run` process: a `Buffer` is written to a temporary file first, while a path string is passed to `fastedge-run` directly.

```typescript
load(bufferOrPath: Buffer | string, config?: RunnerConfig): Promise<void>
```

Calling `load()` again on the same runner replaces the current module and restarts any underlying process.

**`httpPort` pinning (HTTP-WASM only).** When `config.httpPort` is set, the spawned `fastedge-run` process is bound to that specific port instead of allocating from the dynamic pool (8100–8199). If the port is already in use, `load()` throws:

```
fastedge-run port <N> is not available — release it or choose a different httpPort in fastedge-config.test.json
```

There is no fallback to dynamic allocation — pinning is only useful if the address is stable. Intended for Codespaces/Docker port-forwarding setups, stable live-preview URLs, or external tooling that requires a fixed target. For proxy-wasm runners, `httpPort` is ignored.

### execute (HTTP-WASM)

Executes an HTTP request through the WASM module. Only available on `HttpWasmRunner` (http-wasm). Calling this on a `ProxyWasmRunner` throws.

```typescript
execute(request: HttpRequest): Promise<HttpResponse>
```

`request.path` is a path on the locally spawned `fastedge-run` server, not a full URL. The runner forwards the request to that local process and returns the response including logs captured from the process stdout/stderr. Requests time out after 30 seconds. Network or timeout failures reject with `HTTP request failed: <reason>`. Calling `execute()` before `load()` rejects with `HttpWasmRunner not loaded. Call load() first.`

**Redirects are not followed.** The underlying fetch uses `redirect: "manual"`, so 3xx responses reach the caller intact — status code and `Location` header — rather than being transparently followed. This matches FastEdge edge behavior, where redirects are returned to the client rather than followed server-side, and lets tests assert on redirect status and `Location`.

`execute` targets only the WASM app under test, so following a redirect depends on the shape of `Location`. Inspect `response.headers.location`:

- **Relative Location** (for example `/new-path`) — reuse directly as `request.path`.
- **Absolute same-host Location** (for example `http://localhost:8100/new-path`) — parse via `new URL()` and re-issue with `pathname + search` as `request.path`.
- **Absolute cross-host Location** (for example `https://other.example.com/`) — cannot be followed through the runner; the 3xx response is the terminal state for the test.

```typescript
import { createRunner } from '@gcoredev/fastedge-test';

const runner = await createRunner('./my-http-app.wasm');

// Relative Location: reuse directly as path
let response = await runner.execute({ path: '/moved', method: 'GET', headers: {} });
if (response.status >= 300 && response.status < 400 && response.headers['location']) {
  response = await runner.execute({
    path: response.headers['location'] as string, // e.g. "/new-location"
    method: 'GET',
    headers: {},
  });
}

await runner.cleanup();
```

### callHook (Proxy-WASM)

Executes a single proxy-wasm hook in isolation. Only available on `ProxyWasmRunner` (proxy-wasm). Calling this on an `HttpWasmRunner` throws.

```typescript
callHook(hookCall: HookCall): Promise<HookResult>
```

Each call creates a fresh WASM instance with the request/response state from `hookCall`, invokes the appropriate hook export, and returns the resulting state and logs.

Valid hook names: `"onRequestHeaders"`, `"onRequestBody"`, `"onResponseHeaders"`, `"onResponseBody"`. Any other value throws.

```typescript
import { createRunner } from '@gcoredev/fastedge-test';

const runner = await createRunner('./my-cdn-app.wasm');

const result = await runner.callHook({
  hook: 'onRequestHeaders',
  request: { headers: { 'x-custom': 'value' }, body: '', method: 'GET' },
  properties: {},
});
console.log(result.returnCode, result.output.request.headers);

await runner.cleanup();
```

### callFullFlow (Proxy-WASM)

Executes the complete CDN request/response lifecycle for a proxy-wasm module: runs all four hooks in sequence, obtains the upstream response between the request and response phases, and returns the aggregated results.

```typescript
callFullFlow(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string,
  properties: Record<string, unknown>,
  enforceProductionPropertyRules: boolean
): Promise<FullFlowResult>
```

**Parameters**

| Parameter                        | Type                      | Description                                             |
| -------------------------------- | ------------------------- | ------------------------------------------------------- |
| `url`                            | `string`                  | Request URL, or `"built-in"` for the built-in responder |
| `method`                         | `string`                  | HTTP method                                             |
| `headers`                        | `Record<string, string>`  | Request headers                                         |
| `body`                           | `string`                  | Request body                                            |
| `properties`                     | `Record<string, unknown>` | Shared properties passed to all hooks                   |
| `enforceProductionPropertyRules` | `boolean`                 | Enforce production property access rules                |

The upstream response is generated at runtime — either by a real HTTP fetch against `url`, or by the built-in responder when `url === "built-in"` (`BUILTIN_SHORTHAND`). There is no caller-provided mock response. The origin fetch does not follow redirects; a 3xx origin response is passed to the response hooks as-is.

Hook execution order: `onRequestHeaders` → `onRequestBody` → *(real HTTP fetch or built-in responder)* → `onResponseHeaders` → `onResponseBody`.

**Local response short-circuit.** If a WASM module calls `proxy_send_local_response` in any hook and returns `StopIteration` (return code `1`), the runner short-circuits immediately. For request-phase hooks (`onRequestHeaders`, `onRequestBody`), this skips the remaining request hooks, the origin fetch, and all response hooks. For response-phase hooks (`onResponseHeaders`, `onResponseBody`), this skips any remaining response hooks. In all cases, `finalResponse` is built from the locally-sent status, headers, and body — matching CDN production behavior. This is how redirect modules (for example geo-redirect) and early error responses work.

**Origin fetch failure.** If the origin fetch throws (DNS failure, connection refused, and similar), `callFullFlow` does not reject. It returns a `FullFlowResult` whose `finalResponse` has `status: 0`, `statusText: "Fetch Failed"`, and an error message in `body`.

Only available on `ProxyWasmRunner`. Calling on `HttpWasmRunner` throws.

### applyDotenv

Updates dotenv settings on a loaded runner without reloading the WASM binary.

```typescript
applyDotenv(enabled: boolean, path?: string): Promise<void>
```

**Behavior by runner type:**

- **ProxyWasmRunner**: Resets the secret and dictionary stores to empty, then re-reads dotenv files from `path` (or the previously set path if omitted) when `enabled` is `true`. The compiled WASM module is not recompiled.
- **HttpWasmRunner**: Kills the current `fastedge-run` process and restarts it with the updated `--dotenv` flag. If no process is running, the settings apply on the next `load()`.

### cleanup

Releases all resources held by the runner.

```typescript
cleanup(): Promise<void>
```

- **ProxyWasmRunner**: No-op (no long-running processes). State is reset on the next `load()` call.
- **HttpWasmRunner**: Kills the `fastedge-run` process, releases the allocated port (a pinned `httpPort` is simply freed), and deletes any temporary WASM file written to disk.

Always call `cleanup()` when done with a runner, especially in test teardown.

### getType

Returns the WASM type this runner handles.

```typescript
getType(): WasmType  // "http-wasm" | "proxy-wasm"
```

### setStateManager

Attaches a state manager for event emission. Called internally by the server; in headless use, pass `new NullStateManager()` (a no-op implementation) or omit it entirely.

```typescript
setStateManager(stateManager: IStateManager): void
```

## Runner Types

### Proxy-WASM (CDN)

`ProxyWasmRunner` handles proxy-wasm binaries — the standard format for FastEdge CDN applications. These modules implement the proxy-wasm ABI and hook into the request/response lifecycle.

**Available methods**: `load`, `callHook`, `callFullFlow`, `applyDotenv`, `cleanup`, `getType`, `setStateManager`

**Not available**: `execute` (throws `Error`)

The runner compiles the WASM module once on `load()` and creates a fresh `WebAssembly.Instance` for each hook call, providing isolation between hook executions. `RunnerConfig.httpPort` is ignored.

### HTTP-WASM

`HttpWasmRunner` handles http-wasm (WASI component model) binaries. These modules implement the `wasi-http` interface and run as a standard HTTP server.

**Available methods**: `load`, `execute`, `applyDotenv`, `cleanup`, `getType`, `setStateManager`

**Not available**: `callHook`, `callFullFlow` (both throw `Error`)

The runner spawns a `fastedge-run` process on `load()` and forwards HTTP requests to it via localhost. The process is kept alive between requests. `HttpWasmRunner` also exposes `getPort(): number | null`, which returns the port the `fastedge-run` server listens on (the pinned `httpPort` when set, otherwise the dynamically allocated port). This method is not part of `IWasmRunner`.

### Auto-Detection

Both factory functions (`createRunner`, `createRunnerFromBuffer`) automatically detect the WASM type by inspecting the binary. Detection determines whether the binary implements the proxy-wasm ABI or the wasi-http interface, and selects `ProxyWasmRunner` or `HttpWasmRunner` accordingly.

### runnerType Override

If auto-detection produces incorrect results, use `RunnerConfig.runnerType` to skip detection and force a specific type. Any value other than `"http-wasm"` selects `ProxyWasmRunner`.

```typescript
import { createRunner } from '@gcoredev/fastedge-test';

const runner = await createRunner('./my-app.wasm', {
  runnerType: 'proxy-wasm',
});
await runner.cleanup();
```

### Built-in Responder

When testing proxy-wasm modules without a real origin server, pass `BUILTIN_SHORTHAND` (the string `"built-in"`) as the `url` argument to `callFullFlow`. The runner generates a response locally instead of making a network request.

```typescript
import { createRunner, BUILTIN_SHORTHAND } from '@gcoredev/fastedge-test';
import type { FullFlowResult } from '@gcoredev/fastedge-test';

const runner = await createRunner('./my-cdn-app.wasm');
const result: FullFlowResult = await runner.callFullFlow(
  BUILTIN_SHORTHAND, // no origin fetch
  'GET',
  { 'accept': 'application/json' },
  '',
  {},   // properties
  true, // enforceProductionPropertyRules
);
await runner.cleanup();
```

**Built-in responder behavior** — controlled by request headers present after the request hooks run:

| Header               | Effect                                                                          |
| -------------------- | ------------------------------------------------------------------------------- |
| `x-debugger-status`  | HTTP status code for the generated response (default: `200`)                    |
| `x-debugger-content` | Response body mode: `"body-only"`, `"status-only"`, or full JSON echo (default) |

An `x-debugger-status` value that is not an integer between 100 and 599 produces status `400`.

When `x-debugger-content` is omitted, the built-in responder returns a JSON echo of the request method, headers, body, and URL. Both control headers are stripped before the response hooks execute, so they do not appear in hook input state.

`BUILTIN_URL` (`"http://fastedge-builtin.debug"`) is the canonical URL the runner substitutes internally when `BUILTIN_SHORTHAND` is passed. It is also accepted directly as the `url` argument, including with a query string or path.

## Type Definitions

### RunnerConfig

```typescript
interface RunnerConfig {
  dotenv?: {
    enabled?: boolean;
    /** Directory path to load dotenv files from. Passes --dotenv <path> to fastedge-run.
     *  When omitted, fastedge-run uses process CWD (correct for npm package users whose
     *  .env files live at their project root). Use this only when dotenv files are not in CWD,
     *  e.g. test fixture directories or non-standard project layouts. */
    path?: string;
  };
  enforceProductionPropertyRules?: boolean;
  /** Override automatic WASM type detection. Use when detection produces wrong results. */
  runnerType?: WasmType;
  /**
   * HTTP-WASM only. Pin the spawned `fastedge-run` HTTP server to a specific
   * port instead of allocating from the dynamic pool (8100-8199). Intended for
   * Codespaces/Docker port-forwarding setups, stable live-preview URLs, or any
   * external tooling that requires a fixed target. `load()` throws if the port
   * is already in use — there is no fallback to dynamic allocation. Ignored
   * for proxy-wasm runners.
   */
  httpPort?: number;
}
```

| Field                            | Type       | Default         | Description                                  |
| -------------------------------- | ---------- | --------------- | -------------------------------------------- |
| `dotenv.enabled`                 | `boolean`  | `false`         | Load dotenv files                            |
| `dotenv.path`                    | `string`   | `undefined`     | Directory to load dotenv files from          |
| `enforceProductionPropertyRules` | `boolean`  | `undefined`     | Declared on the type; not read by `load()`   |
| `runnerType`                     | `WasmType` | *auto-detected* | Overrides WASM type detection                |
| `httpPort`                       | `number`   | `undefined`     | HTTP-WASM only: pins the `fastedge-run` port |

- `dotenv.enabled` defaults to `false` when the runner is created through `createRunner` or `createRunnerFromBuffer`.
- `dotenv.path`: when omitted, `fastedge-run` (HTTP-WASM) uses the process CWD, which is correct for npm package users whose `.env` files live at the project root. Set it only when dotenv files are in a non-standard location, such as a test fixture directory.
- `enforceProductionPropertyRules`: the runner's `load()` does not consume this field. Pass the rule explicitly to `callFullFlow()` or `callHook()`.
- `httpPort`: see [load](#load) for the failure behavior when the port is busy.

### HttpRequest & HttpResponse

```typescript
import type { IncomingHttpHeaders } from 'node:http';

interface HttpRequest {
  path: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

interface HttpResponse {
  status: number;
  statusText: string;
  headers: IncomingHttpHeaders;
  body: string;
  contentType: string | null;
  isBase64?: boolean;
  logs: Array<{ level: number; message: string }>;
}
```

`HttpResponse.headers` uses Node's `IncomingHttpHeaders` shape: common single-valued headers (`content-type`, `location`, `etag`, …) are typed as `string`; `set-cookie` is `string[]`; unknown keys are `string | string[] | undefined`. This preserves RFC 6265 Set-Cookie semantics (each cookie kept separate).

`HttpRequest` and `HttpResponse` are used exclusively with `execute()` on `HttpWasmRunner`.

`isBase64` is `true` when the response body is binary content (images, audio, video, PDF, ZIP, gzip, `application/octet-stream`) encoded as base64.

`HttpResponse.logs` contains log entries captured from the `fastedge-run` process stdout/stderr during the request.

**Multi-valued headers.** `Set-Cookie` is preserved as a `string[]` — each `Set-Cookie` header emitted by the WASM app (or an upstream origin) becomes a separate array entry. Example:

```typescript
import { createRunner } from '@gcoredev/fastedge-test';

const runner = await createRunner('./my-http-app.wasm');
const response = await runner.execute({ path: '/login', method: 'POST', headers: {} });
const cookies = response.headers['set-cookie']; // string[] | undefined
for (const cookie of cookies ?? []) {
  console.log(cookie);
}
await runner.cleanup();
```

Single-valued headers read as plain strings with no narrowing needed:

```typescript
const location = response.headers['location'];        // string | undefined
const contentType = response.headers['content-type']; // string | undefined
```

### HookCall

```typescript
type HookCall = {
  hook: string;
  request: {
    headers: HeaderRecord;
    body: string;
    method?: string;
    path?: string;
    scheme?: string;
  };
  /**
   * Seed state for the response hooks (`onResponseHeaders` / `onResponseBody`)
   * when calling them in isolation via `callHook()`. The full-flow path
   * (`callFullFlow`) generates the upstream response at runtime and does not
   * consume this field — request hooks ignore it, and response hooks are
   * called with the response built from the live origin fetch or built-in
   * responder output.
   */
  response?: {
    headers: HeaderRecord;
    body: string;
    status?: number;
    statusText?: string;
  };
  properties: Record<string, unknown>;
  enforceProductionPropertyRules?: boolean; // Default: true - Enforce property access control rules
};
```

| Field                            | Description                                    |
| -------------------------------- | ---------------------------------------------- |
| `hook`                           | Hook name (see below)                          |
| `request`                        | Request state passed to the hook               |
| `response`                       | Seed state for response hooks via `callHook()` |
| `properties`                     | Shared properties                              |
| `enforceProductionPropertyRules` | Defaults to `true`                             |

- `hook`: one of `"onRequestHeaders"`, `"onRequestBody"`, `"onResponseHeaders"`, `"onResponseBody"`.
- `response`: not consumed by `callFullFlow()` or by request hooks. The full-flow path generates the upstream response at runtime.
- `properties`: for example `request.path`, `vm_config`, `plugin_config`.
- `enforceProductionPropertyRules`: set to `false` to allow property access that the production CDN blocks.

`HeaderRecord` is `Record<string, string | string[]>` — multi-valued headers (for example multiple `Set-Cookie`) are represented as `string[]`.

### HookResult

```typescript
type HookResult = {
  returnCode: number | null;
  logs: { level: number; message: string }[];
  input: {
    request: { headers: HeaderRecord; body: string };
    response: { headers: HeaderRecord; body: string };
    properties?: Record<string, unknown>;
  };
  output: {
    request: { headers: HeaderRecord; body: string };
    response: { headers: HeaderRecord; body: string };
    properties?: Record<string, unknown>;
  };
  properties: Record<string, unknown>;
};
```

| Field        | Description                                                  |
| ------------ | ------------------------------------------------------------ |
| `returnCode` | Value returned by the hook export, or `null` if not exported |
| `logs`       | Log entries emitted during hook execution                    |
| `input`      | State seen by the hook before execution                      |
| `output`     | State after hook execution                                   |
| `properties` | All shared properties after execution                        |

### FullFlowResult

```typescript
type FullFlowResult = {
  hookResults: Record<string, HookResult>;
  finalResponse: {
    status: number;
    statusText: string;
    headers: HeaderRecord;
    body: string;
    contentType: string;
    isBase64?: boolean;
  };
  calculatedProperties?: Record<string, unknown>;
};
```

| Field                  | Description                                                   |
| ---------------------- | ------------------------------------------------------------- |
| `hookResults`          | Results keyed by hook name; hooks that did not run are absent |
| `finalResponse`        | Final response; `body` is base64 when `isBase64` is `true`    |
| `calculatedProperties` | Runtime properties computed from the request URL              |

`hookResults` keys are `"onRequestHeaders"`, `"onRequestBody"`, `"onResponseHeaders"`, and `"onResponseBody"`, each holding a `HookResult`. `finalResponse` is the response after all hooks have executed, or the local response if a hook short-circuited (see [callFullFlow](#callfullflow-proxy-wasm)).

### Supporting Types

```typescript
type WasmType = "http-wasm" | "proxy-wasm";

type HeaderMap = Record<string, string>;

// Wire/projection format for hook and full-flow results.
// Single-valued headers are a string; multi-valued (e.g. set-cookie) are a string[].
type HeaderRecord = Record<string, string | string[]>;

type LogEntry = {
  level: number;
  message: string;
};

enum ProxyStatus {
  Ok = 0,
  NotFound = 1,
  BadArgument = 2,
}
```

Only `WasmType` is exported from the package root. `HeaderRecord` appears in the exported `HookCall`, `HookResult`, and `FullFlowResult` types; the other types above are not exported.

Log levels follow the proxy-wasm convention: `0` = Trace, `1` = Debug, `2` = Info, `3` = Warn, `4` = Error.

`ProxyStatus` represents return values from proxy-wasm host function calls.

## IStateManager

`IStateManager` is the event emission interface runners use to broadcast lifecycle events. In headless/standalone usage, pass `new NullStateManager()` (a no-op implementation) to `setStateManager`, or omit the call entirely.

```typescript
type EventSource = "ui" | "ai_agent" | "api" | "system";

interface IStateManager {
  emitRequestStarted(
    url: string,
    method: string,
    headers: Record<string, string | string[]>,
    source?: EventSource,
  ): void;

  emitHookExecuted(
    hook: string,
    returnCode: number | null,
    logCount: number,
    input: {
      request: { headers: Record<string, string | string[]>; body: string };
      response: { headers: Record<string, string | string[]>; body: string };
    },
    output: {
      request: { headers: Record<string, string | string[]>; body: string };
      response: { headers: Record<string, string | string[]>; body: string };
    },
    source?: EventSource,
  ): void;

  emitRequestCompleted(
    hookResults: Record<string, unknown>,
    finalResponse: {
      status: number;
      statusText: string;
      headers: Record<string, string | string[]>;
      body: string;
      contentType: string;
      isBase64?: boolean;
    },
    calculatedProperties?: Record<string, unknown>,
    source?: EventSource,
  ): void;

  emitRequestFailed(
    error: string,
    details?: string,
    source?: EventSource,
  ): void;

  emitWasmLoaded(
    filename: string,
    size: number,
    source?: EventSource,
  ): void;

  emitPropertiesUpdated(
    properties: Record<string, string>,
    source?: EventSource,
  ): void;

  emitHttpWasmRequestCompleted(
    response: {
      status: number;
      statusText: string;
      headers: Record<string, string | string[] | undefined>;
      body: string;
      contentType: string | null;
      isBase64?: boolean;
    },
    source?: EventSource,
  ): void;

  emitHttpWasmLog(
    log: { level: number; message: string },
    source?: EventSource,
  ): void;

  emitReloadWorkspaceWasm(path: string, source?: EventSource): void;
}
```

## Complete Example

### Proxy-WASM (CDN application)

```typescript
import { createRunner } from '@gcoredev/fastedge-test';
import type { FullFlowResult, HookResult } from '@gcoredev/fastedge-test';

async function testCdnApp() {
  const runner = await createRunner('./my-cdn-app.wasm', {
    dotenv: { enabled: true },
  });

  try {
    // Execute the full CDN request/response lifecycle
    const result: FullFlowResult = await runner.callFullFlow(
      'https://example.com/api/data',   // request URL
      'GET',                            // method
      { 'accept': 'application/json' }, // request headers
      '',                               // request body
      {
        'request.path': '/api/data',
        'request.host': 'example.com',
      },                                // shared properties
      true,                             // enforce production property rules
    );

    // Inspect hook results
    const requestHeaders: HookResult = result.hookResults['onRequestHeaders'];
    console.log('onRequestHeaders returnCode:', requestHeaders.returnCode);
    console.log('Logs:', requestHeaders.logs);

    // Inspect final response
    console.log('Final status:', result.finalResponse.status);
    console.log('Final body:', result.finalResponse.body);
    console.log('Calculated properties:', result.calculatedProperties);

    // Test a single hook in isolation
    const hookResult = await runner.callHook({
      hook: 'onRequestHeaders',
      request: {
        headers: { 'x-custom': 'value' },
        body: '',
        method: 'POST',
        path: '/api/submit',
        scheme: 'https',
      },
      response: {
        headers: {},
        body: '',
        status: 200,
        statusText: 'OK',
      },
      properties: {
        'request.host': 'example.com',
      },
      enforceProductionPropertyRules: false,
    });

    console.log('Hook output headers:', hookResult.output.request.headers);
  } finally {
    await runner.cleanup();
  }
}

testCdnApp();
```

### Proxy-WASM with built-in responder

```typescript
import { createRunner, BUILTIN_SHORTHAND } from '@gcoredev/fastedge-test';
import type { FullFlowResult } from '@gcoredev/fastedge-test';

async function testCdnAppOffline() {
  const runner = await createRunner('./my-cdn-app.wasm');

  try {
    // Use built-in responder — no origin server required
    const result: FullFlowResult = await runner.callFullFlow(
      BUILTIN_SHORTHAND, // generates a local response instead of fetching
      'GET',
      { 'accept': 'application/json' },
      '',
      {},   // properties
      true, // enforceProductionPropertyRules
    );

    console.log('Final status:', result.finalResponse.status);
    console.log('Final body:', result.finalResponse.body);
  } finally {
    await runner.cleanup();
  }
}

testCdnAppOffline();
```

### HTTP-WASM (standard HTTP application)

```typescript
import { createRunner } from '@gcoredev/fastedge-test';
import type { HttpResponse } from '@gcoredev/fastedge-test';

async function testHttpApp() {
  const runner = await createRunner('./my-http-app.wasm', {
    dotenv: { enabled: true },
    httpPort: 8150, // optional: pin the fastedge-run port
  });

  try {
    const response: HttpResponse = await runner.execute({
      path: '/api/hello',
      method: 'GET',
      headers: {
        'accept': 'application/json',
        'x-request-id': 'test-123',
      },
    });

    console.log('Status:', response.status, response.statusText);
    console.log('Content-Type:', response.contentType);
    console.log('Body:', response.body);
    console.log('Process logs:', response.logs);

    // POST request with body
    const postResponse = await runner.execute({
      path: '/api/data',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'test' }),
    });

    console.log('POST status:', postResponse.status);
  } finally {
    await runner.cleanup();
  }
}

testHttpApp();
```

### Using a buffer and runtime type detection

```typescript
import { createRunnerFromBuffer } from '@gcoredev/fastedge-test';
import { readFile } from 'fs/promises';

async function runFromBuffer() {
  const buffer = await readFile('./app.wasm');

  // Auto-detect type
  const runner = await createRunnerFromBuffer(buffer);
  console.log('Detected type:', runner.getType()); // "proxy-wasm" or "http-wasm"

  await runner.cleanup();
}

runFromBuffer();
```

## See Also

- [TEST_FRAMEWORK.md](TEST_FRAMEWORK.md) — High-level test framework built on top of this runner API
- [API.md](API.md) — REST endpoints for running tests via HTTP
- [DEBUGGER.md](DEBUGGER.md) — Debugger server and WebSocket protocol
