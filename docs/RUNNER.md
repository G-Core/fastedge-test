# Runner API

Low-level programmatic API for executing WASM modules. Use this when you need direct control over runner lifecycle, hook calls, or request execution outside of the test framework.

## Import

```typescript
import {
  createRunner,
  createRunnerFromBuffer,
  ProxyWasmRunner,
  HttpWasmRunner,
  WasmRunnerFactory,
  NullStateManager,
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

## Creating a Runner

### createRunner

```typescript
function createRunner(wasmPath: string, config?: RunnerConfig): Promise<IWasmRunner>
```

Creates a fully loaded runner from a file path. WASM type is detected automatically from the binary unless overridden via `config.runnerType`.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `wasmPath` | `string` | Absolute or relative path to the `.wasm` file |
| `config` | `RunnerConfig` | Optional configuration (see [RunnerConfig](#runnerconfig)) |

**Returns:** `Promise<IWasmRunner>` — a loaded runner ready to execute requests.

```typescript
import { createRunner } from '@gcoredev/fastedge-test';

const runner = await createRunner('./dist/my-app.wasm');
```

### createRunnerFromBuffer

```typescript
function createRunnerFromBuffer(buffer: Buffer, config?: RunnerConfig): Promise<IWasmRunner>
```

Creates a fully loaded runner from an in-memory `Buffer`. Useful when the WASM binary has already been read from disk, fetched over the network, or generated programmatically.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `buffer` | `Buffer` | WASM binary as a Node.js `Buffer` |
| `config` | `RunnerConfig` | Optional configuration (see [RunnerConfig](#runnerconfig)) |

**Returns:** `Promise<IWasmRunner>` — a loaded runner ready to execute requests.

```typescript
import { createRunnerFromBuffer } from '@gcoredev/fastedge-test';
import { readFile } from 'fs/promises';

const buffer = await readFile('./dist/my-app.wasm');
const runner = await createRunnerFromBuffer(buffer);
```

## IWasmRunner Interface

All runners implement `IWasmRunner`. Method availability depends on runner type — see [Runner Types](#runner-types) for which methods apply to each.

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
    responseHeaders: Record<string, string>,
    responseBody: string,
    responseStatus: number,
    responseStatusText: string,
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

```typescript
load(bufferOrPath: Buffer | string, config?: RunnerConfig): Promise<void>
```

Loads a WASM binary into the runner. For `ProxyWasmRunner`, compiles the module and loads any dotenv files. For `HttpWasmRunner`, writes the binary to a temp file and spawns the `fastedge-run` process.

Calling `load()` on an already-loaded runner replaces the current WASM and restarts any associated processes.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `bufferOrPath` | `Buffer \| string` | WASM binary or file path |
| `config` | `RunnerConfig` | Optional configuration applied at load time |

### execute (HTTP-WASM)

```typescript
execute(request: HttpRequest): Promise<HttpResponse>
```

Forwards an HTTP request to the running `fastedge-run` process and returns the response. **Only available on `HttpWasmRunner`.** Throws if called on `ProxyWasmRunner`.

```typescript
const response = await runner.execute({
  path: '/api/hello',
  method: 'GET',
  headers: { 'accept': 'application/json' },
});
console.log(response.status, response.body);
```

### callHook (Proxy-WASM)

```typescript
callHook(hookCall: HookCall): Promise<HookResult>
```

Executes a single proxy-wasm hook in isolation. Each call creates a fresh WASM instance with the provided request/response state. **Only available on `ProxyWasmRunner`.** Throws if called on `HttpWasmRunner`.

Use this when you need to test a single hook's behavior independently, or when you supply a pre-fetched response rather than having the runner perform the HTTP fetch.

```typescript
const result = await runner.callHook({
  hook: 'onRequestHeaders',
  request: {
    headers: { 'x-custom': 'value' },
    body: '',
    method: 'GET',
    path: '/api/data',
    scheme: 'https',
  },
  response: {
    headers: {},
    body: '',
  },
  properties: {},
});
console.log(result.returnCode, result.output.request.headers);
```

Supported `hook` values: `"onRequestHeaders"`, `"onRequestBody"`, `"onResponseHeaders"`, `"onResponseBody"`.

### callFullFlow (Proxy-WASM)

```typescript
callFullFlow(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string,
  responseHeaders: Record<string, string>,
  responseBody: string,
  responseStatus: number,
  responseStatusText: string,
  properties: Record<string, unknown>,
  enforceProductionPropertyRules: boolean
): Promise<FullFlowResult>
```

Executes the complete proxy-wasm request/response lifecycle:

1. `onRequestHeaders` — processes request headers
2. `onRequestBody` — processes request body
3. HTTP fetch — makes the actual upstream request using the (possibly modified) URL and headers
4. `onResponseHeaders` — processes response headers
5. `onResponseBody` — processes response body

**Only available on `ProxyWasmRunner`.** Throws if called on `HttpWasmRunner`.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | `string` | Full request URL including scheme and host |
| `method` | `string` | HTTP method (`"GET"`, `"POST"`, etc.) |
| `headers` | `Record<string, string>` | Request headers |
| `body` | `string` | Request body |
| `responseHeaders` | `Record<string, string>` | Initial response headers (overridden by actual fetch response) |
| `responseBody` | `string` | Initial response body (overridden by actual fetch response) |
| `responseStatus` | `number` | Initial response status (overridden by actual fetch response) |
| `responseStatusText` | `string` | Initial response status text |
| `properties` | `Record<string, unknown>` | Shared properties passed to all hooks |
| `enforceProductionPropertyRules` | `boolean` | When `true`, enforces CDN property access control rules |

```typescript
const result = await runner.callFullFlow(
  'https://example.com/api/data',
  'GET',
  { 'x-user-id': '123' },
  '',
  {},
  '',
  200,
  'OK',
  {},
  true
);
console.log(result.finalResponse.status);
console.log(result.hookResults.onRequestHeaders.returnCode);
```

### applyDotenv

```typescript
applyDotenv(enabled: boolean, path?: string): Promise<void>
```

Updates dotenv settings on a loaded runner without reloading the WASM binary.

- **`ProxyWasmRunner`**: Resets `SecretStore` and `Dictionary` to empty, then re-loads dotenv files in-place. The compiled WASM module is not recompiled.
- **`HttpWasmRunner`**: Kills the current `fastedge-run` process and restarts it with the updated `--dotenv` flag. The WASM file is not re-read.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `enabled` | `boolean` | Whether dotenv loading is active |
| `path` | `string` | Optional directory containing dotenv files |

### cleanup

```typescript
cleanup(): Promise<void>
```

Releases all resources held by the runner.

- **`ProxyWasmRunner`**: No-op (state is reset on each `load()` call).
- **`HttpWasmRunner`**: Kills the `fastedge-run` process, releases the allocated port, and deletes any temporary WASM files.

Always call `cleanup()` when done with a runner, especially in test teardown, to avoid port leaks and orphaned processes.

```typescript
try {
  const result = await runner.execute(request);
} finally {
  await runner.cleanup();
}
```

### getType

```typescript
getType(): WasmType
```

Returns the WASM type this runner handles: `"proxy-wasm"` or `"http-wasm"`.

### setStateManager

```typescript
setStateManager(stateManager: IStateManager): void
```

Attaches a state manager for event emission. In standalone/headless usage, pass a `NullStateManager` (which discards all events) or omit this call entirely — both are safe. The server uses this internally to forward events over WebSocket.

```typescript
import { NullStateManager } from '@gcoredev/fastedge-test';

runner.setStateManager(new NullStateManager());
```

## Runner Types

### Proxy-WASM (CDN)

`ProxyWasmRunner` executes proxy-wasm binaries — the type used for G-Core CDN edge applications. It runs entirely in-process using Node.js `WebAssembly` APIs (no subprocess).

**Available methods:** `load`, `callHook`, `callFullFlow`, `applyDotenv`, `cleanup`, `getType`, `setStateManager`

**Not available:** `execute` — throws `Error` if called.

Each hook call creates a fresh WASM instance with isolated state. The compiled `WebAssembly.Module` is reused across calls (compiled once on `load()`).

### HTTP-WASM

`HttpWasmRunner` executes HTTP-WASM binaries — the WASI component model format using `wasi-http`. It spawns a long-running `fastedge-run` CLI process and forwards HTTP requests to it over localhost.

**Available methods:** `load`, `execute`, `applyDotenv`, `cleanup`, `getType`, `setStateManager`

**Not available:** `callHook`, `callFullFlow` — both throw `Error` if called.

The `fastedge-run` process persists across multiple `execute()` calls and is killed on `cleanup()` or when `load()` is called again.

### Auto-Detection

`createRunner` and `createRunnerFromBuffer` detect the WASM type automatically by inspecting the binary. Detection is reliable for standard proxy-wasm and HTTP-WASM (component model) binaries.

### runnerType Override

If auto-detection produces the wrong result, override it with `RunnerConfig.runnerType`:

```typescript
const runner = await createRunner('./my.wasm', {
  runnerType: 'proxy-wasm',
});
```

## Type Definitions

### RunnerConfig

```typescript
interface RunnerConfig {
  dotenv?: {
    enabled?: boolean;
    path?: string;
  };
  enforceProductionPropertyRules?: boolean;
  runnerType?: WasmType;
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `dotenv.enabled` | `boolean` | `true` | Whether to load dotenv files |
| `dotenv.path` | `string` | `undefined` | Directory containing dotenv files. When omitted, uses the process current working directory. Specify only when dotenv files are not at the project root (e.g. test fixture directories). |
| `enforceProductionPropertyRules` | `boolean` | `true` | Enforce CDN property access control rules during hook execution |
| `runnerType` | `WasmType` | auto-detected | Override automatic WASM type detection |

### HttpRequest & HttpResponse

```typescript
interface HttpRequest {
  path: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  contentType: string | null;
  isBase64?: boolean;
  logs: Array<{ level: number; message: string }>;
}
```

`HttpResponse.isBase64` is `true` when the response body contains a base64-encoded binary payload (images, PDFs, zip files, etc.).

`HttpResponse.logs` contains log lines emitted by the `fastedge-run` process during the request.

### HookCall

```typescript
type HookCall = {
  hook: string;
  request: {
    headers: HeaderMap;
    body: string;
    method?: string;
    path?: string;
    scheme?: string;
  };
  response: {
    headers: HeaderMap;
    body: string;
    status?: number;
    statusText?: string;
  };
  properties: Record<string, unknown>;
  dotenvEnabled?: boolean;
  enforceProductionPropertyRules?: boolean;
};
```

`hook` must be one of `"onRequestHeaders"`, `"onRequestBody"`, `"onResponseHeaders"`, `"onResponseBody"`.

`enforceProductionPropertyRules` defaults to `true`. Set to `false` to allow reading properties that are restricted in production (useful for debugging).

### HookResult

```typescript
type HookResult = {
  returnCode: number | null;
  logs: { level: number; message: string }[];
  input: {
    request: { headers: HeaderMap; body: string };
    response: { headers: HeaderMap; body: string };
    properties?: Record<string, unknown>;
  };
  output: {
    request: { headers: HeaderMap; body: string };
    response: { headers: HeaderMap; body: string };
    properties?: Record<string, unknown>;
  };
  properties: Record<string, unknown>;
};
```

| Field | Description |
|-------|-------------|
| `returnCode` | Proxy-wasm return code from the hook. `null` if the hook export was not found. Common values: `0` = Continue, `1` = Pause (used when `proxy_http_call` is in progress) |
| `logs` | Log entries emitted via `proxy_log` during hook execution |
| `input` | Request and response state as provided to the hook before execution |
| `output` | Request and response state after the hook has run (may differ from `input` if the WASM modified headers or body) |
| `properties` | All properties after hook execution, including any modifications made by the WASM |

### FullFlowResult

```typescript
type FullFlowResult = {
  hookResults: Record<string, HookResult>;
  finalResponse: {
    status: number;
    statusText: string;
    headers: HeaderMap;
    body: string;
    contentType: string;
    isBase64?: boolean;
  };
  calculatedProperties?: Record<string, unknown>;
};
```

`hookResults` is keyed by hook name: `"onRequestHeaders"`, `"onRequestBody"`, `"onResponseHeaders"`, `"onResponseBody"`.

`calculatedProperties` contains runtime properties derived from the request URL and headers (e.g. `request.path`, `request.host`, `request.scheme`).

`finalResponse.isBase64` is `true` when the upstream response was binary and the body is base64-encoded.

### Supporting Types

```typescript
type WasmType = "http-wasm" | "proxy-wasm";

type HeaderMap = Record<string, string>;

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

Log levels follow the proxy-wasm convention: `0` = Trace, `1` = Debug, `2` = Info, `3` = Warn, `4` = Error.

## Complete Example

### Proxy-WASM (CDN application)

```typescript
import { createRunner } from '@gcoredev/fastedge-test';
import type { FullFlowResult, HookResult } from '@gcoredev/fastedge-test';

async function testCdnApp() {
  const runner = await createRunner('./dist/cdn-app.wasm', {
    dotenv: { enabled: true },
    enforceProductionPropertyRules: true,
  });

  try {
    // Test full request/response flow (runner performs the actual HTTP fetch)
    const flowResult: FullFlowResult = await runner.callFullFlow(
      'https://example.com/api/users',
      'GET',
      {
        'x-user-id': '42',
        'accept': 'application/json',
      },
      '',    // request body
      {},    // initial response headers (overridden by fetch)
      '',    // initial response body (overridden by fetch)
      200,   // initial response status (overridden by fetch)
      'OK',  // initial response status text (overridden by fetch)
      {
        'request.x_real_ip': '203.0.113.1',
      },
      true   // enforce production property rules
    );

    console.log('Final status:', flowResult.finalResponse.status);
    console.log('Modified request headers:', flowResult.hookResults.onRequestHeaders.output.request.headers);

    // Test a single hook in isolation (with a pre-built response)
    const hookResult: HookResult = await runner.callHook({
      hook: 'onResponseHeaders',
      request: {
        headers: { 'x-user-id': '42' },
        body: '',
        method: 'GET',
        path: '/api/users',
        scheme: 'https',
      },
      response: {
        headers: { 'content-type': 'application/json' },
        body: '{"id":42}',
        status: 200,
        statusText: 'OK',
      },
      properties: {
        'request.x_real_ip': '203.0.113.1',
      },
    });

    console.log('Hook return code:', hookResult.returnCode);
    console.log('Added response headers:', hookResult.output.response.headers);
    console.log('Logs:', hookResult.logs);
  } finally {
    await runner.cleanup();
  }
}

testCdnApp().catch(console.error);
```

### HTTP-WASM application

```typescript
import { createRunner } from '@gcoredev/fastedge-test';
import type { HttpResponse } from '@gcoredev/fastedge-test';

async function testHttpApp() {
  const runner = await createRunner('./dist/http-app.wasm', {
    dotenv: { enabled: true },
  });

  try {
    const response: HttpResponse = await runner.execute({
      path: '/api/hello',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'test-key',
      },
      body: JSON.stringify({ name: 'world' }),
    });

    console.log('Status:', response.status);
    console.log('Content-Type:', response.contentType);
    console.log('Body:', response.body);
    console.log('Logs:', response.logs);
  } finally {
    await runner.cleanup();
  }
}

testHttpApp().catch(console.error);
```

### Updating dotenv without reloading WASM

```typescript
import { createRunner } from '@gcoredev/fastedge-test';

const runner = await createRunner('./dist/app.wasm', {
  dotenv: { enabled: false },
});

// Enable dotenv pointing at a fixtures directory
await runner.applyDotenv(true, './test/fixtures');

// ... run tests with dotenv active ...

// Disable dotenv
await runner.applyDotenv(false);

await runner.cleanup();
```

## See Also

- [TEST_FRAMEWORK.md](TEST_FRAMEWORK.md) — high-level test framework built on top of this runner API
- [API.md](API.md) — REST endpoints for interacting with the server over HTTP
- [WEBSOCKET.md](WEBSOCKET.md) — WebSocket interface for real-time event streaming
