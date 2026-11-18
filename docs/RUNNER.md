# Runner API

Low-level programmatic API for executing WASM binaries. Use this when you need direct control over runner lifecycle, hook execution, or headless test automation outside the test framework.

## Import

```typescript
import {
  createRunner,
  createRunnerFromBuffer,
  createResource,
  matchRule,
  createStores,
  ProxyWasmRunner,
  HttpWasmRunner,
  WasmRunnerFactory,
  NullStateManager,
  BUILTIN_URL,
  BUILTIN_SHORTHAND,
  CLIENT_PRESETS,
  EDGE_PRESETS,
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
  LocalResponse,
  StoreCall,
  Resource,
  ResourceRequest,
  ResourceResult,
  CreateResourceOptions,
  CdnHook,
  OriginResponse,
  TestStores,
  CreateStoresOptions,
  StoresSeed,
  ClientContext,
  EdgeContext,
  RequestContext,
  Preset,
} from '@gcoredev/fastedge-test';
```

`HeaderMap`, `HeaderRecord`, `HeaderTuples`, `HookBody`, `LogEntry`, `ProxyStatus`, `Origin`, and `EventSource` are described under [Supporting Types](#supporting-types), [HookResult](#hookresult), and [IStateManager](#istatemanager). They are not exported from the package root.

`createStores()` builds an isolated in-memory store instance (`TestStores`) that can be passed as `RunnerConfig.stores`. Its options and seed types are `CreateStoresOptions` and `StoresSeed`. See [stores](#runnerconfig) under `RunnerConfig` for how a runner uses the instance.

`CLIENT_PRESETS`, `EDGE_PRESETS`, `ClientContext`, `EdgeContext`, `RequestContext`, and `Preset` describe the simulated client location and edge POP. See [Request Context](#request-context).

`createResource`, `matchRule`, and the `Resource*` types run several apps on one request. See [Resources](#resources).

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

Unless `config.stores` is `false`, the runner connects to the local storage service (cache and Edge KV). When `config.stores` is `true` or omitted, the runner holds its own lease on the service until `cleanup()` is called. When `config.stores` is a `TestStores` instance, the runner uses that instance and does not own it, so `cleanup()` does not release it. If `load()` fails, the factory calls `cleanup()` (releasing any lease it owns) and rethrows the error. See [RunnerConfig](#runnerconfig).

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

### createResource

Creates a `Resource`: several apps that handle one request, as on a CDN resource. The full definition is under [Resources](#resources).

```typescript
function createResource(
  fileOrObject: string | ResourceConfigInput,
  options?: CreateResourceOptions
): Promise<Resource>
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
    enforceProductionPropertyRules: boolean,
    context?: RequestContext,
    origin?: Origin
  ): Promise<FullFlowResult>;
  applyDotenv(enabled: boolean, path?: string): Promise<void>;
  setRequestContext(context: RequestContext): Promise<void>;
  cleanup(): Promise<void>;
  getType(): WasmType;
  setStateManager(stateManager: IStateManager): void;
}
```

### load

Loads a WASM binary into the runner. For proxy-wasm runners, compiles the module and loads dotenv files. For `HttpWasmRunner`, spawns a `fastedge-run` process: a `Buffer` is written to a temporary file first, while a path string is passed to `fastedge-run` directly.

```typescript
load(bufferOrPath: Buffer | string, config?: RunnerConfig): Promise<void>
```

Calling `load()` again on the same runner replaces the current module and restarts any underlying process. When `config.client` or `config.edge` is set, `load()` applies them as the runner's request context (see [setRequestContext](#setrequestcontext)).

**`httpPort` pinning (HTTP-WASM only).** When `config.httpPort` is set, the spawned `fastedge-run` process is bound to that specific port instead of allocating from the dynamic pool (8100–8199). If the port is already in use, `load()` throws:

```
fastedge-run port <N> is not available — release it or choose a different httpPort in fastedge-config.test.json
```

There is no fallback to dynamic allocation — pinning is only useful if the address is stable. Intended for Codespaces/Docker port-forwarding setups, stable live-preview URLs, or external tooling that requires a fixed target. For proxy-wasm runners, `httpPort` is ignored.

### execute (HTTP-WASM)

Executes an HTTP request through the WASM module. Only available on `HttpWasmRunner` (http-wasm). Calling this on a proxy-wasm runner throws.

```typescript
execute(request: HttpRequest): Promise<HttpResponse>
```

`request.path` is a path on the locally spawned `fastedge-run` server, not a full URL. The runner forwards the request to that local process and returns the response including logs captured from the process stdout/stderr. Requests time out after 30 seconds. Network or timeout failures reject with `HTTP request failed: <reason>`. Calling `execute()` before `load()` rejects with `HttpWasmRunner not loaded. Call load() first.`

If a request context is set (see [Request Context](#request-context)), its headers are added to the request; headers in `request.headers` take precedence. A `request.context` applies to that request only and is used instead of the runner's context.

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

Executes a single proxy-wasm hook in isolation. Only available on proxy-wasm runners. Calling this on an `HttpWasmRunner` throws.

```typescript
callHook(hookCall: HookCall): Promise<HookResult>
```

Each call creates a fresh WASM instance with the request/response state from `hookCall`, invokes the appropriate hook export, and returns the resulting state and logs. `hookCall.context` applies a client and edge to that call only; when omitted, the runner's context is used.

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
  enforceProductionPropertyRules: boolean,
  context?: RequestContext,
  origin?: Origin
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
| `enforceProductionPropertyRules` | `boolean`                 | Deprecated and ignored                                  |
| `context?`                       | `RequestContext`          | Client and edge for this flow only                      |
| `origin?`                        | `Origin`                  | Where the response comes from instead of `url`          |

`enforceProductionPropertyRules` is kept so existing callers compile; the production property rules always apply, and the parameter will be removed in the next major version.

The upstream response is generated at runtime — either by a real HTTP fetch against `url`, or by the built-in responder when `url === "built-in"` (`BUILTIN_SHORTHAND`). There is no caller-provided mock response. The origin fetch does not follow redirects; a 3xx origin response is passed to the response hooks as-is.

When `origin` is passed, it replaces the fetch of `url` as the source of the response, and `url` is only what the client asked for. File paths inside `origin` must already be absolute. The `Origin` type is not exported by name from the package root.

Hook execution order: `onRequestHeaders` → `onRequestBody` → *(real HTTP fetch or built-in responder)* → `onResponseHeaders` → `onResponseBody`.

If a request context is set (see [Request Context](#request-context)), its properties and headers are added to the call; the `properties` and `headers` arguments take precedence. When `context` is passed, it is used for this flow instead of the runner's context.

**Local response short-circuit.** If a WASM module calls `proxy_send_local_response` in any hook and returns `StopIteration` (return code `1`), the runner short-circuits immediately. For request-phase hooks (`onRequestHeaders`, `onRequestBody`), this skips the remaining request hooks, the origin fetch, and all response hooks. For response-phase hooks (`onResponseHeaders`, `onResponseBody`), this skips any remaining response hooks. In all cases, `finalResponse` is built from the locally-sent status, headers, and body — matching CDN production behavior. The hook's `HookResult.localResponse` holds the same response. This is how redirect modules (for example geo-redirect) and early error responses work.

**Origin fetch failure.** If the origin fetch throws (DNS failure, connection refused, and similar), `callFullFlow` does not reject. It returns a `FullFlowResult` whose `finalResponse` has `status: 0`, `statusText: "Fetch Failed"`, and an error message in `body`.

**Hook failure.** If a hook traps, the error propagates and `callFullFlow` rejects. A [Resource](#resources) handles hook failures differently (`interruptOnError`).

Only available on proxy-wasm runners. Calling on `HttpWasmRunner` throws.

### applyDotenv

Updates dotenv settings on a loaded runner without reloading the WASM binary.

```typescript
applyDotenv(enabled: boolean, path?: string): Promise<void>
```

**Behavior by runner type:**

- **Proxy-WASM**: Resets the secret and dictionary stores to empty, then re-reads dotenv files from `path` (or the previously set path if omitted) when `enabled` is `true`. The compiled WASM module is not recompiled. Dictionary keys supplied by the edge request context are kept as defaults beneath the dotenv values.
- **HttpWasmRunner**: Kills the current `fastedge-run` process and restarts it with the updated `--dotenv` flag. The returned promise resolves once the restarted process is listening. If no process is running, the settings apply on the next `load()`.

### setRequestContext

Changes the simulated client and edge POP of a loaded runner. The new context applies from the next request. A request that names its own context uses that instead. The cache bucket (`dc`) stays as it was when the runner was loaded.

```typescript
setRequestContext(context: RequestContext): Promise<void>
```

Available on both runner types. See [Request Context](#request-context) for what each app type receives.

### cleanup

Releases all resources held by the runner.

```typescript
cleanup(): Promise<void>
```

- **Proxy-WASM**: Terminates the runner's worker thread. The runner cannot be loaded again: create a new one.
- **HttpWasmRunner**: Kills the `fastedge-run` process, releases the allocated port (a pinned `httpPort` is simply freed), and deletes any temporary WASM file written to disk.
- **Stores lease**: A runner created by `createRunner` or `createRunnerFromBuffer` with stores enabled (`stores` omitted or `true`) releases its lease on the storage service during cleanup. A runner given a `TestStores` instance does not own it and does not release it.

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

Proxy-wasm runners handle proxy-wasm binaries — the standard format for FastEdge CDN applications. These modules implement the proxy-wasm ABI and hook into the request/response lifecycle.

**Available methods**: `load`, `callHook`, `callFullFlow`, `applyDotenv`, `setRequestContext`, `cleanup`, `getType`, `setStateManager`

**Not available**: `execute` (throws `Error`)

The runner compiles the WASM module once on `load()` and creates a fresh `WebAssembly.Instance` for each hook call, providing isolation between hook executions. `RunnerConfig.httpPort` is ignored. With stores enabled, the module's cache and Edge KV host calls are served by the local storage service (or by the supplied `TestStores` instance), and each `HookResult` lists the calls the hook made in `storeCalls`.

### HTTP-WASM

`HttpWasmRunner` handles http-wasm (WASI component model) binaries. These modules implement the `wasi-http` interface and run as a standard HTTP server.

**Available methods**: `load`, `execute`, `applyDotenv`, `setRequestContext`, `cleanup`, `getType`, `setStateManager`

**Not available**: `callHook`, `callFullFlow` (both throw `Error`)

The runner spawns a `fastedge-run` process on `load()` and forwards HTTP requests to it via localhost. The process is kept alive between requests. With stores enabled, the spawned process uses the same storage service as proxy-wasm runners, so cache and Edge KV data are shared across runners, and each `HttpResponse` lists the calls the request made in `storeCalls`. `HttpWasmRunner` also exposes `getPort(): number | null`, which returns the port the `fastedge-run` server listens on (the pinned `httpPort` when set, otherwise the dynamically allocated port). This method is not part of `IWasmRunner`.

### Auto-Detection

Both factory functions (`createRunner`, `createRunnerFromBuffer`) automatically detect the WASM type by inspecting the binary. Detection determines whether the binary implements the proxy-wasm ABI or the wasi-http interface, and selects a proxy-wasm runner or `HttpWasmRunner` accordingly.

### runnerType Override

If auto-detection produces incorrect results, use `RunnerConfig.runnerType` to skip detection and force a specific type. Any value other than `"http-wasm"` selects a proxy-wasm runner.

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
  true, // enforceProductionPropertyRules (ignored)
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

## Request Context

A request context describes where the client is and which edge POP runs the app. It is set through `RunnerConfig.client` and `RunnerConfig.edge` at load time, or through [setRequestContext](#setrequestcontext) afterwards. A single request can name its own context with `HttpRequest.context`, `HookCall.context`, or the `context` argument of `callFullFlow()`; that context is used for the request instead of the runner's.

- **`client`** (`ClientContext`): where the client is. Built from a preset (`de`, `nl`, or `us`) plus overrides.
- **`edge`** (`EdgeContext`): which edge POP runs the app. Built from a preset (`de` = `fr5`, `nl` = `am3`, `us` = `sv5`) plus overrides. The POP's `dc` is the cache bucket unless `RunnerConfig.dc` is set.

| App type         | Client context supplies                           | Edge context supplies          |
| ---------------- | ------------------------------------------------- | ------------------------------ |
| CDN (proxy-wasm) | `request.*` properties; `GeoIP-*` and `X-Real-IP` | Dictionary keys; `X-ID` header |
| HTTP (http-wasm) | `geoip-*` and `x-real-ip` headers                 | `dc` and `pop-*` headers       |

Values you set explicitly always win over the context: properties passed to `callFullFlow()` / `callHook()`, headers on the request, and dictionary keys from dotenv files.

`CLIENT_PRESETS` and `EDGE_PRESETS` are the preset definitions behind the preset names. `ClientContext`, `EdgeContext`, `RequestContext`, and `Preset` are the exported types for the values accepted by `RunnerConfig.client`, `RunnerConfig.edge`, and `setRequestContext()`; their full declarations ship in the package's type definitions.

## Resources

A resource runs several apps on one request, as a CDN resource does on the edge. Each CDN hook is assigned to one app. The origin is a URL, the built-in responder, or an HTTP app. Rules select different hooks or a different origin by request path.

```typescript
function createResource(
  fileOrObject: string | ResourceConfigInput,
  options?: CreateResourceOptions
): Promise<Resource>

function matchRule(config: ResourceConfig, url: string): ResourceResult["rule"]
```

**Parameters**

| Parameter      | Type                            | Description                                             |
| -------------- | ------------------------------- | ------------------------------------------------------- |
| `fileOrObject` | `string \| ResourceConfigInput` | Path to a resource config JSON file, or a config object |
| `options`      | `CreateResourceOptions`         | Optional settings                                       |

Paths inside a config file are relative to that file. Paths inside a config object are relative to the current working directory, or to `options.root`.

`createResource` loads every app with `createRunner`, validates the config, and rejects when:

- a hook, rule, or origin names an app that is not in `apps`;
- a rule's `match` is not a valid regular expression;
- an app has no `wasm`, or its wasm file does not exist;
- a hook is assigned to an HTTP app, or an app origin is a CDN app;
- a referenced config is itself a resource (resources cannot be nested).

If loading any app fails, the apps already loaded are cleaned up before the error is rethrown.

`matchRule` returns the first rule whose `match` regular expression matches the path of `url`, or `null` when no rule matches (main applies).

### Resource Config

`ResourceConfigInput` is not exported by name. The accepted shape is:

```typescript
type ResourceConfigInput = {
  $schema?: string;
  description?: string;
  /** The apps of the resource, by name. */
  apps: Record<string, {
    /** Another project's fastedge-config.test.json: its wasm and dotenv, paths relative to it. */
    config?: string;
    /** The built wasm, relative to the resource config. Overrides the referenced config's. */
    wasm?: string;
    dotenv?: { enabled?: boolean; path?: string };
  }>;
  main: {
    /** The app for each hook. Default: no hooks. */
    hooks?: ResourceHooks;
    origin: ResourceOrigin;
  };
  /** First match wins. A rule's `hooks` replace main's hooks completely; its `origin` replaces main's origin. */
  rules?: Array<{
    name?: string;
    /** Regular expression tested against the request path. */
    match: string;
    hooks?: ResourceHooks;
    origin?: ResourceOrigin;
  }>;
  /** Properties for every request (for example `request.country`). */
  properties?: Record<string, unknown>;
  stores?: boolean;
  dc?: string;
  client?: ClientContext;
  edge?: EdgeContext;
  /** Default request for `Resource.request()`. */
  request?: {
    method?: string; // default: "GET"
    url: string;
    headers?: Record<string, string>;
    body?: string;
  };
};

type ResourceHooks = {
  [hook in CdnHook]?: string | { app: string; interruptOnError?: boolean };
};

/** A URL ("built-in" for the built-in responder), a built-in origin, or an HTTP app of the resource. */
type ResourceOrigin = { url: string } | { builtIn: BuiltInOrigin } | { app: string }; // BuiltInOrigin: see TEST_CONFIG.md

type CdnHook = "onRequestHeaders" | "onRequestBody" | "onResponseHeaders" | "onResponseBody";
```

A hook assigned as a string is the same as `{ app, interruptOnError: true }`. A hook with no app passes the request through unchanged. `stores`, `dc`, `client`, and `edge` behave as in [RunnerConfig](#runnerconfig) and apply to every app.

### CreateResourceOptions

```typescript
type CreateResourceOptions = {
  /** As for createRunner: on by default, false = off, or isolated test stores (createStores). */
  stores?: boolean | TestStores;
  /**
   * Confine every file the resource reads (its config, each app's wasm, referenced config and
   * dotenv folder) to this folder, as the debugger confines loads to its workspace. A resource
   * spanning several projects is then debugged from a folder holding them all (a monorepo).
   */
  root?: string;
};
```

`options.stores` takes precedence over the config's `stores`.

### Resource

```typescript
interface Resource {
  readonly config: ResourceConfig;
  /** The loaded apps by name. */
  readonly apps: ReadonlyMap<string, IWasmRunner>;
  /** Runs one request. An app whose wasm was rebuilt since it loaded is reloaded first. */
  request(request?: ResourceRequest): Promise<ResourceResult>;
  cleanup(): Promise<void>;
}

type ResourceRequest = {
  /** Default: the config's `request.url`. */
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Over the config's `properties` (e.g. request.country), as for a single app. */
  properties?: Record<string, unknown>;
};
```

`request()` rejects with `resource.request: no url (set request.url in the config or pass one)` when neither the call nor the config provides a URL. Omitted `method`, `headers`, and `body` fall back to the config's `request`, then to `"GET"`, `{}`, and `""`. Properties merge in this order, later wins: the context's properties, the config's `properties`, the call's `properties`.

`cleanup()` cleans up every app. Call it in test teardown.

### ResourceResult

```typescript
type ResourceResult = {
  /** The rule that matched, or null for main. */
  rule: { index: number; name?: string; match: string } | null;
  /** Each hook that ran, with the app that ran it. */
  hooks: Partial<Record<CdnHook, { app: string; result: HookResult }>>;
  /** What answered before the response hooks. Absent when a request hook sent the response. */
  origin?: {
    kind: "url" | "built-in" | "app";
    app?: string;
    response: OriginResponse;
    storeCalls?: StoreCall[];
  };
  finalResponse: FullFlowResult["finalResponse"];
};

type OriginResponse = {
  status: number;
  statusText: string;
  headers: HeaderRecord;
  body: string;
  contentType: string;
  isBase64: boolean;
};
```

| Field           | Description                                                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `rule`          | The matching rule's index in `rules`, its `name`, and its `match`; `null` when main handled the request                           |
| `hooks`         | One entry per hook that ran, with the name of the app that ran it and its `HookResult`                                            |
| `origin`        | Present when the origin answered. `kind` is `"url"` for a fetch, `"built-in"` for the built-in responder, `"app"` for an HTTP app |
| `finalResponse` | The response after all hooks, or the response a hook sent with `send_http_response`                                               |

### State Between Hooks

As on the edge, every app sees the same request:

- Every hook starts with fresh memory, including two hooks that run on the same app. Nothing in WASM memory carries over.
- Request headers, request body, and properties pass from hook to hook.
- Custom properties set in `onRequestBody` or in a later hook reach later hooks, including hooks that run on another app.
- Custom properties set in `onRequestHeaders` never reach later hooks.
- Response headers added during the request phase carry into the response phase.
- The client and edge are the resource's (`client` and `edge` in the config) and apply once to the request.

### Hook Errors

When a hook traps, `interruptOnError` decides the outcome:

| `interruptOnError` | Result                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `true` (default)   | The request ends. `finalResponse.status` is `531` with an empty body                                                |
| `false`            | The request continues as if the hook had not run                                                                    |

In both cases the failed hook's entry in `hooks` has `returnCode: null` and a log entry `"<hook> failed: <reason>"`.

### Rebuilt Apps

Before each `request()`, the resource checks the modification time of every app's wasm file. An app whose file changed since it was loaded is reloaded before the request runs. A failed reload (a broken build) fails that request; the next request tries again. Concurrent requests do not reload an app twice.

### Difference from the Edge

Every app in a resource can open every fixture KV store. On the edge, an app opens only the stores attached to it. An app that works here because it reads a store it is not attached to fails on the edge.

### Resource Example

```typescript
import { createResource } from '@gcoredev/fastedge-test';

const resource = await createResource({
  apps: {
    auth: { wasm: './auth/build/auth.wasm' },
    rewrite: { wasm: './rewrite/build/rewrite.wasm' },
    api: { wasm: './api/build/api.wasm' },
  },
  main: {
    hooks: {
      onRequestHeaders: 'auth',
      onResponseHeaders: { app: 'rewrite', interruptOnError: false },
    },
    origin: { url: 'built-in' },
  },
  rules: [
    {
      name: 'api',
      match: '^/api/',
      origin: { app: 'api' }, // an HTTP app answers as the origin
    },
  ],
  request: { url: 'http://example.com/', method: 'GET' },
});

try {
  const result = await resource.request({ url: 'http://example.com/api/users' });
  console.log(result.rule?.name);                    // "api"
  console.log(result.origin?.kind);                  // "app"
  console.log(result.hooks.onRequestHeaders?.app);   // "auth"
  console.log(result.finalResponse.status);
} finally {
  await resource.cleanup();
}
```

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
  /** @deprecated Ignored: the production property rules always apply. Will be removed in the next major version. */
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
  /**
   * Local cache and Edge KV through the storage service shared by every runner in the
   * stores root (the nearest git root; FASTEDGE_STORES_ROOT overrides). Default `true`.
   * `false`: CDN apps' cache / KV calls return InternalFailure. A `createStores()` instance:
   * isolated in-memory stores for tests (runners given the same instance share them).
   */
  stores?: boolean | TestStores;
  /**
   * Cache bucket (edge location). Runners with the same `dc` share cache entries.
   * Default `"local"`, or the `dc` of a `createStores()` instance.
   */
  dc?: string;
  /**
   * Where the client is (preset `de` / `nl` / `us` plus overrides). CDN apps get `request.*`
   * properties and `GeoIP-*` / `X-Real-IP` headers, HTTP apps `geoip-*` / `x-real-ip` headers.
   * Explicit properties and headers win.
   */
  client?: ClientContext;
  /**
   * Which edge POP runs the app (preset `de` = fr5, `nl` = am3, `us` = sv5, plus overrides).
   * CDN apps get the dictionary keys and `X-ID`, HTTP apps the `dc` / `pop-*` headers. Its
   * `dc` is the cache bucket unless `dc` is set. Explicit dotenv dictionary keys and headers win.
   */
  edge?: EdgeContext;
}
```

| Field                            | Type                    | Default         | Description                                                    |
| -------------------------------- | ----------------------- | --------------- | -------------------------------------------------------------- |
| `dotenv.enabled`                 | `boolean`               | `false`         | Load dotenv files                                              |
| `dotenv.path`                    | `string`                | `undefined`     | Directory to load dotenv files from                            |
| `enforceProductionPropertyRules` | `boolean`               | `undefined`     | Deprecated and ignored                                         |
| `runnerType`                     | `WasmType`              | *auto-detected* | Overrides WASM type detection                                  |
| `httpPort`                       | `number`                | `undefined`     | HTTP-WASM only: pins the `fastedge-run` port                   |
| `stores`                         | `boolean \| TestStores` | `true`          | Storage service for cache and Edge KV, or isolated test stores |
| `dc`                             | `string`                | `"local"`       | Cache bucket shared by runners with the same `dc`              |
| `client`                         | `ClientContext`         | `undefined`     | Client location: preset plus overrides                         |
| `edge`                           | `EdgeContext`           | `undefined`     | Edge POP: preset plus overrides; sets default dc               |

- `dotenv.enabled` defaults to `false` when the runner is created through `createRunner` or `createRunnerFromBuffer`.
- `dotenv.path`: when omitted, `fastedge-run` (HTTP-WASM) uses the process CWD, which is correct for npm package users whose `.env` files live at the project root. Set it only when dotenv files are in a non-standard location, such as a test fixture directory.
- `enforceProductionPropertyRules`: deprecated and ignored: the production property rules always apply; it will be removed in the next major version.
- `httpPort`: see [load](#load) for the failure behavior when the port is busy.
- `stores`: the factory functions connect each runner to a storage service shared by every runner in the same stores root. The stores root is the nearest git root, resolved from `WORKSPACE_PATH` or the current working directory; the `FASTEDGE_STORES_ROOT` environment variable overrides it. Set `stores: false` to disable it; cache and Edge KV calls from CDN apps then return `InternalFailure`. Pass a `TestStores` instance (from `createStores()`) to use isolated in-memory stores instead; runners given the same instance share them, and the runner does not own or release the instance.
- `dc`: runners that use the same `dc` value share cache entries. When omitted, the value is the `dc` of `edge` if set, otherwise the `dc` of the supplied `TestStores` instance, otherwise `"local"`.
- `client`, `edge`: see [Request Context](#request-context). Explicit properties, headers, and dotenv dictionary keys take precedence over values from these fields.

### HttpRequest & HttpResponse

```typescript
import type { IncomingHttpHeaders } from 'node:http';

interface HttpRequest {
  path: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  /** Client and edge for this request only; default: the runner's (`setRequestContext`). */
  context?: RequestContext;
}

interface HttpResponse {
  status: number;
  statusText: string;
  headers: IncomingHttpHeaders;
  body: string;
  contentType: string | null;
  isBase64?: boolean;
  logs: Array<{ level: number; message: string }>;
  /**
   * The cache / Edge KV calls the app made for this request, in order (stores on only).
   * Needs a fastedge-run that forwards to the storage service.
   */
  storeCalls?: StoreCall[];
}
```

`HttpResponse.headers` uses Node's `IncomingHttpHeaders` shape: common single-valued headers (`content-type`, `location`, `etag`, …) are typed as `string`; `set-cookie` is `string[]`; unknown keys are `string | string[] | undefined`. This preserves RFC 6265 Set-Cookie semantics (each cookie kept separate).

`HttpRequest` and `HttpResponse` are used exclusively with `execute()` on `HttpWasmRunner`.

`HttpRequest.context` applies a client and edge to that request only. When omitted, the runner's context is used. See [Request Context](#request-context).

`isBase64` is `true` when the response body is binary content (images, audio, video, PDF, ZIP, gzip, `application/octet-stream`) encoded as base64.

`HttpResponse.logs` contains log entries captured from the `fastedge-run` process stdout/stderr during the request.

`HttpResponse.storeCalls` is present only when the runner has stores enabled and the installed `fastedge-run` forwards storage calls to the storage service. See [StoreCall](#storecall) for the shape of each entry.

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
  /** Client and edge for this call only (see `RunnerConfig.client` / `.edge`); default: the runner's. */
  context?: RequestContext;
  request: {
    headers: HeaderRecord;
    body: string;
    /** `body` is base64 of raw bytes (a body that is not text, e.g. an image). */
    isBase64?: boolean;
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
    /** `body` is base64 of raw bytes. */
    isBase64?: boolean;
    status?: number;
    statusText?: string;
  };
  properties: Record<string, unknown>;
  /** @deprecated Ignored: the production property rules always apply. Will be removed in the next major version. */
  enforceProductionPropertyRules?: boolean;
  /**
   * Custom properties an earlier hook of this request wrote (and later hooks may read), when the
   * hooks run on different apps: on the edge custom properties belong to the request, not the app.
   */
  customProperties?: string[];
  /**
   * Set when this call is one hook of a flow driven from outside the runner (a resource): the
   * request id shared by the flow's hooks; `request` and `properties` already carry `context`.
   */
  requestId?: string;
};
```

| Field                            | Description                                                                              |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| `hook`                           | Hook name (see below)                                                                    |
| `context`                        | Client and edge for this call only                                                       |
| `request`                        | Request state passed to the hook                                                         |
| `response`                       | Seed state for response hooks via `callHook()`                                           |
| `properties`                     | Shared properties                                                                        |
| `enforceProductionPropertyRules` | Deprecated and ignored                                                                   |
| `customProperties`               | Names of custom properties written by earlier hooks of the request, for cross-app flows  |
| `requestId`                      | Request id shared by the hooks of a flow driven from outside the runner                  |

- `hook`: one of `"onRequestHeaders"`, `"onRequestBody"`, `"onResponseHeaders"`, `"onResponseBody"`.
- `context`: when omitted, the runner's context is used. See [Request Context](#request-context).
- `request.isBase64`, `response.isBase64`: set to `true` when `body` is base64 of raw bytes rather than text, for example an image.
- `response`: not consumed by `callFullFlow()` or by request hooks. The full-flow path generates the upstream response at runtime.
- `properties`: for example `request.path`, `vm_config`, `plugin_config`.
- `enforceProductionPropertyRules`: deprecated and ignored: the production property rules always apply; it will be removed in the next major version.
- `customProperties` and `requestId`: set by [Resources](#resources) when hooks of one request run on different apps. Calls made directly with `callHook()` do not need them.

`HeaderRecord` is `Record<string, string | string[]>` — multi-valued headers (for example multiple `Set-Cookie`) are represented as `string[]`.

### HookResult

```typescript
/** Headers and body of the request or response; `isBase64`: the body is base64 of raw bytes (not text). */
type HookBody = { headers: HeaderRecord; body: string; isBase64?: boolean };

type HookResult = {
  returnCode: number | null;
  logs: { level: number; message: string }[];
  input: {
    request: HookBody;
    response: HookBody;
    properties?: Record<string, unknown>;
  };
  output: {
    request: HookBody;
    response: HookBody;
    properties?: Record<string, unknown>;
  };
  properties: Record<string, unknown>;
  /** The cache / Edge KV calls this hook made, in order (stores on only). */
  storeCalls?: StoreCall[];
  /** Set when the hook answered with send_http_response. */
  localResponse?: LocalResponse;
  /** Custom properties later hooks of this request may read (see `HookCall.customProperties`). */
  customProperties?: string[];
};
```

| Field              | Description                                                                |
| ------------------ | -------------------------------------------------------------------------- |
| `returnCode`       | Value returned by the hook export, or `null` if not exported               |
| `logs`             | Log entries emitted during hook execution                                  |
| `input`            | State seen by the hook before execution                                    |
| `output`           | State after hook execution                                                 |
| `properties`       | All shared properties after execution                                      |
| `storeCalls`       | Cache and Edge KV calls made by the hook, in order (stores on only)        |
| `localResponse`    | The response the hook sent with `send_http_response`, if any               |
| `customProperties` | Custom properties later hooks of the request may read                      |

`HookBody.isBase64` is `true` when the body is base64. It is set when the call's body was base64, or when the bytes a hook wrote are not valid UTF-8 text.

`storeCalls` is present only when the runner has stores enabled. See [StoreCall](#storecall) for the shape of each entry.

### LocalResponse

```typescript
/** A response a hook sent with send_http_response. */
type LocalResponse = {
  statusCode: number;
  statusText: string;
  /** The additional headers passed as send_http_response's 4th argument. */
  headers: HeaderTuples;
  bodyBase64: string;
};
```

`bodyBase64` is the response body encoded as base64. `HeaderTuples` is `[string, string][]`.

### StoreCall

```typescript
type StoreCall = {
  app: "cdn" | "http";
  hook?: string;
  kind: "cache" | "kv";
  op: string;
  /** Cache bucket (cache calls). */
  dc?: string;
  /** Edge KV store (KV calls). */
  store?: string;
  key?: string;
  pattern?: string;
  prefix?: string;
  /** `ok`, or the service's error (`wrong-type`, `invalid-pattern`, ...). */
  result: string;
  /** The result value: a count, a flag, or the size of a value or list. */
  value?: string;
  /** Wall-clock time (ms since epoch). */
  at: number;
};
```

Values are not recorded, only their size.

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
type HeaderTuples = [string, string][];

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
  InternalFailure = 10,
  Unimplemented = 12,
}
```

Only `WasmType` is exported from this group of types at the package root. `HeaderRecord` and `HeaderTuples` appear in the exported `HookCall`, `HookResult`, `LocalResponse`, and `FullFlowResult` types; the other types above are not exported.

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
      true,                             // enforce production property rules (ignored)
    );

    // Inspect hook results
    const requestHeaders: HookResult = result.hookResults['onRequestHeaders'];
    console.log('onRequestHeaders returnCode:', requestHeaders.returnCode);
    console.log('Logs:', requestHeaders.logs);
    console.log('Store calls:', requestHeaders.storeCalls);

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
    });

    console.log('Hook output headers:', hookResult.output.request.headers);
    console.log('Local response:', hookResult.localResponse);
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
      true, // enforceProductionPropertyRules (ignored)
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
    console.log('Store calls:', response.storeCalls);

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
