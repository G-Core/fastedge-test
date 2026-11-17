# Backend Architecture

## Overview

The backend is a Node.js + Express + TypeScript server that orchestrates WASM execution for CDN (proxy-wasm) and HTTP apps. It loads WASM binaries, executes hooks, runs the origin, and returns detailed execution results. The same runners are published headless in the npm package (see [npm Package](#npm-package)).

**Real-Time Synchronization**: every run is broadcast over WebSocket to all connected clients. See [WEBSOCKET_IMPLEMENTATION.md](../features/WEBSOCKET_IMPLEMENTATION.md).

## Technology Stack

- **Node.js >= 22.13**: Runtime (`node:sqlite` for the stores)
- **Express 4.x**: Web server framework
- **TypeScript**: Type safety
- **WebAssembly API + WASI preview1**: CDN app execution (Node.js native)
- **fastedge-run** (FastEdge-lib): HTTP app execution, as a child process
- **ws 8**: WebSocket server for real-time updates
- **Zod 4**: Config and API body validation, JSON schema generation

## Project Structure

```
server/
├── server.ts              # Express app, API endpoints, WebSocket setup, startServer()
├── storageExplorer.ts     # Storage Explorer API (/api/storage/*)
├── embedded.ts            # Worker / service code embedded as strings (replaced in bundles)
├── runner/
│   ├── ProxyWasmRunner.ts    # CDN runner: instantiation, hooks, PAUSE loop, event emission
│   ├── WorkerProxyWasmRunner.ts # Runs ProxyWasmRunner in a worker thread (factory/createRunner use this)
│   ├── cdn-worker.ts         # Worker side: hosts ProxyWasmRunner, forwards events, proxies fetch
│   ├── cdnFlow.ts            # The CDN request flow (hooks + origin), shared by single apps and resources
│   ├── origin.ts             # Declared origins: URL, built-in echo, fixed response, served folder
│   ├── resource.ts           # Multi-app CDN resources
│   ├── requestContext.ts     # Client / edge context presets
│   ├── HttpWasmRunner.ts     # HTTP app runner (spawns fastedge-run)
│   ├── HostFunctions.ts      # Proxy-wasm host function implementations
│   ├── StoresHost.ts         # Cache / Edge KV host functions
│   ├── storesBridge.ts       # Synchronous store calls from the worker
│   ├── MemoryManager.ts      # WASM memory management
│   ├── HeaderManager.ts      # HTTP header serialization
│   ├── PropertyResolver.ts   # Property/metadata resolution
│   ├── PropertyAccessControl.ts # Per-hook property read/write rules
│   ├── egressPolicy.ts       # Outbound fetch checks
│   ├── standalone.ts         # createRunner / createRunnerFromBuffer
│   ├── index.ts              # Public runner API (package ".")
│   └── types.ts              # Shared type definitions
├── stores/               # Storage service: cache + Edge KV on node:sqlite
├── schemas/              # Zod schemas (config, API bodies)
├── test-framework/       # Package "./test" and "./vitest"
├── websocket/            # Real-time synchronization
│   ├── WebSocketManager.ts   # Connection management
│   ├── StateManager.ts       # Event coordination
│   ├── types.ts              # Event type definitions
│   └── index.ts              # Module exports
├── fastedge-host/        # FastEdge-specific host functions
│   ├── types.ts              # FastEdge type definitions (FastEdgeConfig, ISecretStore, IDictionary)
│   ├── SecretStore.ts        # Time-based secret rotation with effectiveAt support
│   ├── Dictionary.ts         # Key-value configuration store
│   ├── hostFunctions.ts      # Factory for FastEdge WASM host functions
│   └── index.ts              # Module exports
└── utils/                # dotenv loader, fastedge-cli discovery, WASM type detection, paths
```

## Core Components

### WASM Initialization

**Initialization Lifecycle:**

The proxy-wasm spec defines initialization hooks called when the VM and plugin start:

1. `proxy_on_vm_start(root_context_id, vm_config_size)` - VM-level initialization
2. `proxy_on_plugin_start(root_context_id, plugin_config_size)` - Plugin instance initialization
3. `proxy_on_configure(root_context_id, plugin_config_size)` - Plugin configuration
4. `proxy_on_context_create(context_id, parent_context_id)` - Context creation

**Test Runner Behavior:**

- **Configuration**: Provides default `{"test_mode": true}` for VM and plugin configs
- **Error Suppression**: SDK initialization hooks can fail in test environment (expected)
  - Abort messages containing "abort:" filtered during initialization
  - proc_exit(255) calls suppressed during initialization phase
  - Errors logged at DEBUG level with "(expected in test mode)" notation
- **Why This Works**: Test runner sets all state (headers, bodies, properties) via API per-test
  - Production nginx: Configuration comes from nginx.conf at startup
  - Test environment: Configuration comes from HTTP request payload per-call
  - Hook execution (onRequestHeaders, etc.) works perfectly regardless of init failures

**Implementation Details:**

- `ProxyWasmRunner.ensureInitialized()` wraps initialization in try/catch blocks
- `MemoryManager.setInitializing()` tracks initialization state for filtering
- `isInitializing` flag prevents abort/proc_exit messages during init phase
- Initialization runs in every fresh instance (one per hook, see Hook Execution Model)

**WASI environment is never empty:** the WASI env is the dictionary. When the dictionary is empty (no dotenv, no variables) the runner seeds it with `{ __FASTEDGE_RUNNER__: "1" }` (`ProxyWasmRunner.createImports()`). Node's WASI `environ_get` returns `INVAL` for an empty env table; in an AssemblyScript app that aborts `_start` mid-init, and the first `process.env` read then traps. The edge always provides an env, so `getEnv()` must return `""` there, not trap.

### PropertyResolver.ts (Property Path Resolution)

The PropertyResolver resolves property paths for `get_property` and `set_property` calls.

**Features:**

1. **Runtime Property Extraction:**
   - Parses target URL to extract `request.url`, `request.host`, `request.path`, `request.query`, `request.scheme`, `request.extension`
   - Automatically called in `callFullFlow` before hook execution
   - URL parsing with error handling and fallback values

2. **Property Merge Strategy:**
   - User-provided properties (from the UI or API) take precedence
   - Runtime-calculated properties used as fallback
   - Allows overriding any calculated property with custom values
   - `getAllProperties()` returns merged view with proper priority

3. **Property Chaining:**
   - Properties modified in one hook flow to subsequent hooks
   - Captured in input/output states for UI visibility

4. **SDK Integration:**
   - `get_property` in HostFunctions.ts retrieves values via PropertyResolver
   - `set_property` in HostFunctions.ts updates PropertyResolver (allows WASM to set custom properties)
   - Works with the Gcore proxy-wasm AssemblyScript SDK and the Rust SDK

5. **Routing:**
   - `request.url` is the only property that changes the origin fetch target, as on the edge
   - Writes to `request.path`, `request.host`, `request.scheme` or `request.query` return Ok but do not re-route; an app that re-routes must rewrite `request.url`

### server.ts (Express Server)

The REST API is documented in `docs/API.md` (the canonical reference; update it when endpoints change). Design points:

- **Logs**: `/api/call` and `/api/send` always capture every log (trace level); the frontend filters by level client-side, so changing the level needs no re-run.
- **dotenv**: `/api/load` recreates the runner with the `dotenv` settings; toggling dotenv reloads the WASM. See [DOTENV.md](../features/DOTENV.md).
- **`/api/send`** returns `hookResults`, `finalResponse` and `calculatedProperties` (the URL-derived `request.*` values), and broadcasts the run over WebSocket.
- **Config**: `GET /api/config` returns `{ ok, config, valid, validationErrors }` so agents can detect an invalid `fastedge-config.test.json`; `GET /api/schema/:name` serves the generated JSON schemas. Request bodies are validated with Zod and rejected with structured 400 errors.
- Further groups: `/api/resource/*` (multi-app resources), `/api/stores/*` (the loaded app's stores), `/api/storage/*` (Storage Explorer, `storageExplorer.ts`), `/api/request-context/presets`, `/api/workspace-wasm`, `/health`.

**Startup:** `dist/server.js` calls `startServer()` unconditionally when it is loaded. A `require.main === module` guard does not work: it fails when the CJS bundle is loaded through dynamic `import()` (as `bin/fastedge-debug.js` does). The VSCode extension `fork()`s the same file. Library consumers use `dist/lib/`, which never starts a server. Startup messages go to stderr (`console.error`) so they don't corrupt an MCP stdio transport when the server is started by an MCP server. `startServer()` probes ports 5179-5228 via `/health` and writes the chosen port to `{WORKSPACE_PATH || cwd()}/.fastedge-debug/.debug-port`.

### WorkerProxyWasmRunner.ts (CDN runner in a worker thread)

`WasmRunnerFactory` (debugger server) and `createRunner` / `createRunnerFromBuffer`
(npm package, test framework) create a `WorkerProxyWasmRunner`, not a `ProxyWasmRunner`.
It implements `IWasmRunner` by forwarding each call to a `ProxyWasmRunner` hosted in a
worker thread (`cdn-worker.ts`). Behaviour is unchanged; the point is that the parent's
event loop stays free while a hook runs, so host functions can later make synchronous
calls (the storage service) by blocking the worker only.

- **Messages:** call `{ id, method, args }` → reply `{ id, value }` or `{ id, error }`.
  State manager events come back as `{ event, args }` as they happen, so they arrive
  before the reply of the call that caused them.
- **fetch runs in the parent:** the worker's `globalThis.fetch` posts the request to the
  parent, which calls its own `fetch` and returns status, headers and body. The parent's
  undici dispatcher therefore applies (`mockOrigins()` installs a MockAgent there).
  The egress check still runs in the worker before the fetch. Aborts (http_call timeouts)
  are forwarded.
- **Fetch errors cross the boundary as structured clones:** the error's message is kept,
  its `cause` is lost. Error text built from `error.cause` (see Error Handling below) is
  therefore only present in-process.
- **Lifecycle:** the worker is `unref`'d while idle and `ref`'d while a call is in flight,
  so a runner that is never cleaned up does not keep Node alive. `cleanup()` terminates
  the worker; later calls reject.
- **Packaging:** the worker is started with `new Worker(code, { eval: true })`. The esbuild
  bundles (`dist/server.js`, `dist/lib/*`, watch mode) embed the code via the
  `embeddedPlugin` in `esbuild/embedded.js` (which replaces `server/embedded.ts`; the
  stores service process is embedded the same way), so no extra file ships. Unbundled runs
  (vitest) build it on first use with the esbuild dev dependency.
- `ProxyWasmRunner` itself is unchanged and still usable in-process (integration tests).

### ProxyWasmRunner.ts (Core Logic)

Main class orchestrating WASM execution with input/output tracking.

**Constructor Parameters:**
```typescript
constructor(fastEdgeConfig?: FastEdgeConfig, dotenvEnabled: boolean = true)
```

- `fastEdgeConfig` (optional): Programmatic secrets/dictionary configuration
- `dotenvEnabled` (default: `true`): Enable/disable loading from `.env*` files

**Dotenv Integration:**
- When `dotenvEnabled=true`: Loads `.env`, `.env.secrets`, `.env.variables` files
- Merges with programmatic `fastEdgeConfig` (dotenv values take precedence)
- Recreates `SecretStore` and `Dictionary` with merged configuration
- See [DOTENV.md](../features/DOTENV.md) for complete details

Each hook executes in a completely isolated WASM instance to simulate production behavior:

- **Compilation**: Happens once in `load()`, stored as `WebAssembly.Module`
- **Instantiation**: Fresh instance created for each hook call
- **Isolation**: No state sharing between hooks (matches production nginx + wasmtime)
- **Performance**: Compilation is expensive (once), instantiation is cheap (per hook)

**Production Parity Headers:**

- **Host Header Auto-Injection**: Before hooks execute, automatically injects `Host` header from target URL if not present
  - Format: `hostname` for standard ports, `hostname:port` for non-standard ports
  - Example: `https://example.com/` → `host: example.com`
  - Example: `http://localhost:8080/` → `host: localhost:8080`
- **Proxy Headers Auto-Injection**: Before HTTP fetch, automatically injects proxy headers:
  - `x-forwarded-proto`: Extracted from URL scheme (http/https)
  - `x-forwarded-port`: 443 for https, 80 for http
  - `x-real-ip`: From `request.x_real_ip` property (if set)
  - `x-forwarded-for`: Same as `x-real-ip` (if set)
- See [PRODUCTION_PARITY_HEADERS.md](../features/PRODUCTION_PARITY_HEADERS.md) for details

#### Key Methods

**load(buffer: Buffer): Promise<void>**

- Compiles WASM module and stores it
- Does NOT instantiate (deferred until hook execution)
- Validates imports/exports if debug mode enabled
- Loads dotenv files if `dotenvEnabled=true` (via `loadDotenvIfEnabled()`)
- Merges dotenv secrets/dictionary with existing FastEdge config
- Recreates `HostFunctions` with updated stores
- Ready for multiple isolated hook executions

**callFullFlow(call: HookCall, targetUrl: string): Promise<FullFlowResult>**

- Executes complete proxy flow:
  1. **Phase 1**: Request hooks (onRequestHeaders → onRequestBody)
  2. **Phase 2**: HTTP fetch to target URL
  3. **Phase 3**: Response hooks (onResponseHeaders → onResponseBody)
- Returns hook results and final response

The flow itself lives in `cdnFlow.ts` (shared by a single app and a resource):

- Headers, bodies and properties chain from hook to hook by explicit data passing; each hook gets a fresh instance.
- Custom properties written in `onRequestBody` or later are readable by later hooks; those written in `onRequestHeaders` are not (nginx does not keep them).
- The origin is the built-in responder, a declared `builtIn` origin, a resource's HTTP app, or a real `fetch()` (`fetchOrigin`) to `request.url`.
- **Outbound fetch headers:** HTTP/2 pseudo-headers (`:method`, `:path`, `:authority`, `:scheme`) are removed from the origin fetch. Hooks still read them; Node's fetch rejects them as invalid header names, and the edge does not forward them. `proxy_http_call` does the same. The `host` header is also sent as `x-forwarded-host`, and `x-forwarded-proto` / `x-forwarded-port` are derived from the effective URL.
- The response is read completely before the response hooks run (see below).

**⚠️ Streaming Limitation:**

Responses are not streamed. The runner uses `await response.text()` or `await response.arrayBuffer()` which waits for the entire response to complete before processing.

**Differences from Production:**

| Aspect            | Test Runner                      | Production (nginx + wasmtime)  |
| ----------------- | -------------------------------- | ------------------------------ |
| Response handling | Single complete chunk            | Incremental chunks             |
| Hook calls        | Once with full body              | Multiple calls as data arrives |
| `end_of_stream`   | Always `true`                    | `false` until last chunk       |
| Memory usage      | Loads entire response            | Processes incrementally        |
| Testing scope     | Final state, total modifications | Streaming logic, backpressure  |

**What works correctly:**

- ✅ Final state after complete response
- ✅ Total body modifications
- ✅ Header modifications
- ✅ Testing non-streaming use cases
- ✅ Most real-world proxy scenarios

**What cannot be tested:**

- ❌ Incremental chunk processing
- ❌ Streaming-specific logic (early termination, chunk-by-chunk transforms)
- ❌ Backpressure handling
- ❌ Behavior when `end_of_stream=false`

**callHook(call: HookCall): Promise<HookResult>**

- **Creates fresh WASM instance** from compiled module (isolated context)
- Initializes memory manager with new instance
- Runs WASI initialization and `_start` if exported
- Runs initialization hooks (`proxy_on_vm_start`, `proxy_on_configure`)
- **Captures input state** (before hook execution) including all properties
- Executes specific hook function
- **Captures output state** (after hook execution) including modified properties
- **Cleans up instance** (ready for next hook)
- Returns both input and output along with logs and properties

**Input/Output Capture:**

```typescript
// Before hook execution - capture all state including properties
const inputState = {
  request: {
    headers: { ...requestHeaders },
    body: requestBody,
  },
  response: {
    headers: { ...responseHeaders },
    body: responseBody,
  },
  properties: this.propertyResolver.getAllProperties(), // ✅ Merged user + calculated
};

// Execute hook
const returnCode = this.callIfExported(exportName, ...args);

// After hook execution - capture modified state
const outputState = {
  request: {
    headers: { ...this.hostFunctions.getRequestHeaders() },
    body: this.hostFunctions.getRequestBody(),
  },
  response: {
    headers: { ...this.hostFunctions.getResponseHeaders() },
    body: this.hostFunctions.getResponseBody(),
  },
  properties: this.propertyResolver.getAllProperties(), // ✅ Includes WASM modifications
};

return {
  returnCode,
  logs: filteredLogs,
  input: inputState,
  output: outputState,
  properties: this.propertyResolver.getAllProperties(),
};
```

#### Error Handling

**Fetch Failures:**

```typescript
catch (error) {
  let errorMessage = "Fetch failed";
  let errorDetails = "";

  if (error instanceof Error) {
    errorMessage = error.message;
    if (error.cause) {
      errorDetails = ` (cause: ${String(error.cause)})`;
    }
  }

  const fullErrorMessage = `Failed to fetch ${requestMethod} ${targetUrl}: ${errorMessage}${errorDetails}`;

  // Return detailed error in response hooks and finalResponse
  return {
    hookResults: { /* with error logs */ },
    finalResponse: {
      status: 0,
      statusText: "Fetch Failed",
      body: fullErrorMessage,
      contentType: "text/plain",
    },
  };
}
```

### HostFunctions.ts

Implements proxy-wasm ABI host functions that WASM code calls:

**Standard Proxy-WASM Functions:**

- `proxy_log`: Logging from WASM
- `proxy_get_header_map_value`: Read headers
- `proxy_add_header_map_value`: Add/modify headers
- `proxy_remove_header_map_value`: Remove headers
- `proxy_get_buffer_bytes`: Read request/response bodies
- `proxy_set_buffer_bytes`: Modify request/response bodies
- `proxy_get_property`: Read properties (metadata, headers, etc.)

**FastEdge Extensions:**

- `proxy_get_secret(key_ptr, key_len, value_ptr_ptr, value_len_ptr)`: Retrieve secrets
- `proxy_get_effective_at_secret(key_ptr, key_len, timestamp, value_ptr_ptr, value_len_ptr)`: Time-based secret retrieval
- `proxy_secret_get`: Alias for proxy_get_secret (SDK compatibility)
- `proxy_dictionary_get(key_ptr, key_len, value_ptr_ptr, value_len_ptr)`: Retrieve dictionary/config values

**Header Management:**

- Maintains separate maps for request/response headers
- Uses HeaderManager for serialization
- Supports MapType enum (RequestHeaders=0, ResponseHeaders=2, etc.)

**Body Management:**

- Maintains separate strings for request/response bodies
- Supports BufferType enum (RequestBody=0, ResponseBody=1, etc.)

**FastEdge Integration:**

- Uses SecretStore for time-based secret rotation
- Uses Dictionary for configuration key-value pairs
- Supports dotenv file loading (see [DOTENV.md](../features/DOTENV.md))
- Production parity with the FastEdge edge runtime

### MemoryManager.ts

Manages WASM linear memory:

**Responsibilities:**

- Allocate/deallocate memory blocks
- Write strings and byte arrays to WASM memory
- Read data from WASM memory
- Track allocations for cleanup

**Key Methods:**

- `readBytes(ptr, len)` / `readString(ptr, len)` - Read from WASM memory
- `writeToWasm(bytes): number` - Allocate in the guest and write bytes, return pointer
- `writeStringResult(...)` / `writeBytesResult(...)` - Pointer-to-pointer results for host functions

### HeaderManager.ts

Handles the proxy-wasm header serialization format:

**Format:**

```
[count: u32][size1: u32][size2: u32]...[sizeN: u32][key1\0value1\0key2\0value2\0...]
```

**Methods:**

- `serializeTuples(tuples)` / `deserializeBinaryToTuples(bytes)` - Binary format, lossless (duplicates kept)
- `recordToTuples` / `tuplesToRecord` - Convert between `HeaderRecord` and `HeaderTuples`
- `normalize(headers)` - Lowercase keys
- `flattenToMap(headers)` - Comma-join multi-values for `fetch()` (request headers only)

### PropertyResolver.ts

Resolves property paths for `proxy_get_property`:

**Supported Properties:**

- `request.method`, `request.path`, `request.scheme`
- `request.headers.*` (individual header access)
- `response.status`, `response.statusText`
- `response.headers.*` (individual header access)
- Custom properties from `properties` object

**Example:**

```typescript
propertyResolver.getProperty("request.headers.content-type");
// Returns: "application/json"
```

### FastEdge Host Functions

**Purpose:** Extends the proxy-wasm ABI with the FastEdge runtime functions for secrets management and configuration.

**Location:** `server/fastedge-host/`

#### SecretStore.ts

Manages encrypted configuration values with time-based rotation:

**Features:**

- `get(key)`: Returns current secret value
- `getEffectiveAt(key, timestamp)`: Returns secret value at specific time (for rotation)
- Supports simple string values or timestamped arrays
- Format: `[{value: "secret1", effectiveAt: 1609459200}, {value: "secret2", effectiveAt: 1640995200}]`
- Automatically selects correct value based on timestamp

**Example:**

```typescript
const secretStore = new SecretStore({
  JWT_SECRET: "current-secret",
  API_KEY: [
    { value: "old-key", effectiveAt: 1609459200 },
    { value: "new-key", effectiveAt: 1640995200 },
  ],
});
```

#### Dictionary.ts

Simple key-value configuration store:

**Features:**

- `get(key)`: Retrieve config value
- `set(key, value)`: Update config value
- `has(key)`: Check if key exists
- `clear()`: Remove all entries
- `load(data)`: Bulk load from object

**Example:**

```typescript
const dictionary = new Dictionary({
  API_URL: "https://api.example.com",
  LOG_LEVEL: "debug",
  FEATURE_FLAG_NEW_UI: "true",
});
```

### Dotenv Loader

**Location:** `server/utils/dotenv-loader.ts`

Parses and loads environment variables from `.env*` files for FastEdge configuration.

**Functions:**

`loadDotenvFiles(dotenvPath: string = "."): Promise<FastEdgeConfig>`

- Loads and parses multiple dotenv file formats
- Returns `{ secrets, dictionary }` object
- Silently skips missing files (not an error)

**Supported Files:**

1. `.env` - FastEdge format with prefixes:
   - `FASTEDGE_VAR_SECRET_*` → secrets
   - `FASTEDGE_VAR_ENV_*` → dictionary
2. `.env.secrets` - Secrets without prefix
3. `.env.variables` - Dictionary values without prefix

**Parser Features:**

- Handles `KEY=VALUE` format
- Strips leading/trailing whitespace
- Removes surrounding quotes (`"value"` or `'value'`)
- Skips empty lines and `#` comments
- Graceful error handling (continues on parse errors)

**Example Usage:**

```typescript
// In ProxyWasmRunner.load()
const dotenvConfig = await loadDotenvFiles(".");

// Merge with existing config
this.secretStore = new SecretStore({
  ...existingSecrets,
  ...dotenvConfig.secrets,
});

for (const [key, value] of Object.entries(dotenvConfig.dictionary)) {
  this.dictionary.set(key, value);
}
```

**Helper Functions:**

`hasDotenvFiles(dotenvPath: string = "."): Promise<boolean>`

- Checks if any dotenv files exist in specified directory
- Useful for detecting dotenv configuration presence

#### hostFunctions.ts

Factory function creating WASM-compatible host functions:

**Functions:**

- `proxy_get_secret`: Standard secret retrieval
- `proxy_get_effective_at_secret`: Time-based secret retrieval
- `proxy_secret_get`: Alias for SDK compatibility
- `proxy_dictionary_get`: Dictionary value retrieval

**Memory Management:**

- Uses MemoryManager for proper WASM memory allocation
- Pointer-to-pointer pattern for returning values
- Returns ProxyStatus codes (Ok=0, NotFound=1, Error=2)

**Integration:**

```typescript
// In HostFunctions.ts createImports()
return {
  proxy_log: () => {...},
  proxy_get_property: () => {...},
  // ... standard functions

  // FastEdge extensions
  ...createFastEdgeHostFunctions(
    this.memory,
    this.secretStore,
    this.dictionary,
    (msg) => this.logs.push({ level: 0, message: msg })
  ),
};
```

#### Dotenv Support

Dotenv integration with toggle support. See [DOTENV.md](../features/DOTENV.md) for complete documentation.

**Implementation:**

Located in `server/utils/dotenv-loader.ts`:
- `loadDotenvFiles(dotenvPath)`: Loads and parses dotenv files
- `hasDotenvFiles(dotenvPath)`: Checks if any dotenv files exist
- `parseDotenv(content)`: Parses KEY=VALUE format with quote handling

**File Patterns:**

- `.env` with prefixes: `FASTEDGE_VAR_SECRET_*` (secrets), `FASTEDGE_VAR_ENV_*` (dictionary)
- `.env.secrets`: Secrets only (no prefix required)
- `.env.variables`: Dictionary values (no prefix required)

**Integration:**

- `ProxyWasmRunner` constructor accepts `dotenvEnabled` boolean (default: `true`)
- `load()` method calls `loadDotenvIfEnabled()` to merge dotenv with FastEdge config
- Runner recreated on `/api/load` when `dotenvEnabled` flag changes
- Frontend UI provides toggle in settings panel

**Behavior:**

When `dotenvEnabled=true`:
1. Reads `.env`, `.env.secrets`, `.env.variables` from working directory
2. Parses files and extracts secrets/dictionary entries
3. Merges with programmatic `FastEdgeConfig` (dotenv takes precedence)
4. Recreates `SecretStore` and `Dictionary` instances
5. Updates `HostFunctions` with merged configuration

When `dotenvEnabled=false`:
- Skips file loading entirely
- Uses only programmatic FastEdge config

## Type System

### types.ts

Three header types coexist at different boundaries. See `context/features/MULTI_VALUE_HEADERS.md` for the full architecture.

- **`HeaderMap = Record<string, string>`** — simple input shape (single value per key). Used by `FlowOptions.requestHeaders`, `HttpRequest.headers`, and similar user-supplied maps.
- **`HeaderTuples = [string, string][]`** — canonical internal representation, lossless / ordered / duplicate-preserving. Used by `HostFunctions` as the WASM-visible header maps and by `HeaderManager.serializeTuples` for proxy-wasm binary format.
- **`HeaderRecord = Record<string, string | string[]>`** — wire / hook-result format. Single-valued keys as `string`, multi-valued (notably `Set-Cookie` per RFC 6265 §3) as `string[]`. Matches Node's `IncomingHttpHeaders` projection.

**HookCall:**

```typescript
export type HookCall = {
  hook: string;
  request: {
    headers: HeaderRecord;    // wire format; accepts HeaderMap (subset) for convenience
    body: string;
    method?: string;
    path?: string;
    scheme?: string;
  };
  response: {
    headers: HeaderRecord;
    body: string;
    status?: number;
    statusText?: string;
  };
  properties: Record<string, unknown>;
  logLevel?: number; // Optional log level filter (0=trace to 5=critical)
};
```

**HookResult (with Input/Output):**

```typescript
export type HookResult = {
  returnCode: number | null;
  logs: { level: number; message: string }[];
  input: {
    request: { headers: HeaderRecord; body: string };
    response: { headers: HeaderRecord; body: string };
    properties?: Record<string, unknown>; // State before hook execution
  };
  output: {
    request: { headers: HeaderRecord; body: string };
    response: { headers: HeaderRecord; body: string };
    properties?: Record<string, unknown>; // State after hook execution
  };
  properties: Record<string, unknown>; // Final merged properties
};
```

**FullFlowResult:**

```typescript
export type FullFlowResult = {
  hookResults: Record<string, HookResult>;
  finalResponse: {
    status: number;
    statusText: string;
    headers: HeaderRecord;
    body: string;
    contentType: string;
    isBase64?: boolean;
  };
  calculatedProperties?: Record<string, unknown>; // Runtime-extracted properties
};
```

**HttpResponse (HTTP-WASM public output):**

```typescript
import type { IncomingHttpHeaders } from "node:http";

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: IncomingHttpHeaders;  // set-cookie: string[]; common headers narrowed to string
  body: string;
  contentType: string | null;
  isBase64?: boolean;
  logs: Array<{ level: number; message: string }>;
}
```

**Calculated Properties:**

The `calculatedProperties` field contains runtime-extracted properties from the target URL:
- `request.url`: Full URL
- `request.host`: Hostname from URL
- `request.path`: Path component
- `request.query`: Query string (without leading `?`)
- `request.scheme`: Protocol (http/https)
- `request.extension`: File extension from path

These are extracted by `PropertyResolver.extractRuntimePropertiesFromUrl()` before hook execution and returned to the frontend, which keeps them in a separate `calculatedProperties` field for display (never merged into the editable properties).

**Enums:**

```typescript
export enum MapType {
  RequestHeaders = 0,
  RequestTrailers = 1,
  ResponseHeaders = 2,
  ResponseTrailers = 3,
}

export enum BufferType {
  RequestBody = 0,
  ResponseBody = 1,
  VmConfiguration = 6,
  PluginConfiguration = 7,
}

export enum ProxyStatus {
  Ok = 0,
  NotFound = 1,
  BadArgument = 2,
}
```

**ProxyStatus Usage:**

Used by FastEdge host functions (`proxy_get_secret`, `proxy_dictionary_get`, etc.) to indicate operation success/failure.

## Hook Execution Model

### Isolated Instance per Hook

Each hook call creates a completely fresh WASM instance:

```typescript
// In callHook():
1. Instantiate fresh WebAssembly.Instance from compiled module
2. Initialize memory manager (fresh memory space)
3. Run WASI initialization
4. Call _start for runtime init
5. Run proxy_on_vm_start, proxy_on_plugin_start, proxy_on_configure
6. Create stream context
7. Execute hook (onRequestHeaders, onRequestBody, etc.)
8. Capture output state
9. Clean up instance (set to null)
```

**Why Isolated Instances?**

- **Production parity**: Matches nginx + wasmtime behavior where each hook has isolated state
- **No state leakage**: Internal WASM variables don't persist between hooks
- **Resources**: different apps can run different hooks of one request
- **Proper testing**: Catches bugs related to assumed fresh state

**State Chaining:**

Even though instances are isolated, hook outputs chain correctly:

- `onRequestHeaders` output → `onRequestBody` input
- `onResponseHeaders` output → `onResponseBody` input
- Modifications flow through via explicit data passing, not shared memory

## Hook Execution Flow

### Request Phase

1. **onRequestHeaders**
   - Input: Original request headers + metadata
   - Can modify: Request headers
   - Output: Modified request headers

2. **onRequestBody**
   - Input: Modified request headers (from step 1) + request body
   - Can modify: Request headers, request body
   - Output: Final request headers and body for HTTP fetch

### HTTP Fetch

3. **Perform HTTP Request**
   - Uses modified headers/body from onRequestBody
   - Adds `x-forwarded-host` for host header preservation
   - Handles binary responses (base64 encoding)

### Response Phase

4. **onResponseHeaders**
   - Input: Response headers + modified request headers/body
   - Can modify: Response headers
   - Output: Modified response headers

5. **onResponseBody**
   - Input: Modified response headers + response body + modified request context
   - Can modify: Response headers, response body
   - Output: Final response headers and body

## Binary Content Handling

**Detection:**

```typescript
const isBinary =
  contentType.startsWith("image/") ||
  contentType.startsWith("video/") ||
  contentType.startsWith("audio/") ||
  contentType.includes("application/octet-stream") ||
  contentType.includes("application/pdf") ||
  contentType.includes("application/zip");
```

**Encoding:**

- Binary content → base64 encoded
- `isBase64: true` flag set in response
- Frontend can decode for display/preview

## Logging

**Log Levels:**

```typescript
0 = Trace
1 = Debug
2 = Info (default)
3 = Warn
4 = Error
5 = Critical
```

**Log Filtering:**

- The server returns every log (trace level)
- The frontend filters by the selected level, without re-running

**Debug Mode:**

- Set `PROXY_RUNNER_DEBUG=1` environment variable
- Enables verbose internal logging
- Logs WASM imports/exports, memory operations, etc.

## Development

**Build:**

```bash
pnpm run build:backend  # esbuild bundle → dist/server.js (+ dist/fastedge-cli/)
```

**Dev Mode:**

```bash
pnpm run dev:backend    # esbuild watch + server
```

**Production:**

```bash
pnpm start              # node bin/fastedge-debug.js → dist/server.js
```

## Port Configuration

- Default: `5179`, probing up to 5228 if busy
- Override: `PORT=3000 pnpm start`
- Frontend dev server proxies `/api/*` to the backend port

## npm Package

Published as `@gcoredev/fastedge-test` (`package.json`). Exports:

| Export | File | What it is |
|---|---|---|
| `.` | `dist/lib/index.{js,cjs,d.ts}` | Headless runner API (`server/runner/index.ts`): `createRunner`, `createRunnerFromBuffer`, `createResource`, `createStores`, runner classes, request-context presets, types |
| `./server` | `dist/server.js` | The debugger server; starts when loaded |
| `./test` | `dist/lib/test-framework/index.{js,cjs,d.ts}` | Test framework (`server/test-framework/`): `defineTestSuite`, `runTestSuite`, `runAndExit`, `runFlow`, `runHttpRequest`, `loadConfigFile`, `mockOrigins`, assertion helpers |
| `./vitest` | `dist/lib/test-framework/vitest.{js,d.ts}` | A vitest `test` with `runner` / `stores` fixtures (ESM only; `vitest >= 3` is an optional peer dependency) |
| `./schemas` | `schemas/` | Generated JSON schemas |

- **bin**: `fastedge-debug` (`bin/fastedge-debug.js`, imports `dist/server.js`)
- **Published files**: `bin/`, `dist/lib/`, `dist/server.js`, `dist/frontend/`, `dist/fastedge-cli/`, `schemas/`, `docs/`, `llms.txt`
- **Builds**: `build:lib` (`esbuild/bundle-lib.js`, ESM + CJS + `.d.ts`; `tsconfig.lib.json` keeps `server/runner/` free of server/WebSocket imports), `build:backend` (`dist/server.js`), `build:frontend` (`dist/frontend/`), `build:schemas`
- **Headless runners** have no state manager (`IStateManager | null`, or the exported no-op `NullStateManager`); the server sets its WebSocket-backed `StateManager`.
- **Release**: `.github/workflows/npm-release.yml` runs semantic-release on the release branches; versions and release notes come from conventional commits.

**Schemas** (`scripts/generate-schemas.ts`, output checked into `schemas/`):

- Config and API bodies come from the Zod schemas in `server/schemas/` via `toJSONSchema({ io: "input" })`: they describe what people and agents write, so a field with a default is optional. Objects that are not `.strict()` (for example `dotenv`, `request`) allow unknown keys in the schema; Zod drops them when the server parses.
- Runner result types (`HookResult`, `FullFlowResult`, `HookCall`, `ResourceResult`, `HttpRequest`, `HttpResponse`) come from the TypeScript types via `ts-json-schema-generator`.
- `fastedge-config.test.json` can point `$schema` at `schemas/fastedge-config.test.schema.json` for editor autocomplete.

## Notes

- WASM module loaded once, reused for all calls
- Each hook execution creates new stream context
- Root context initialized once per WASM load
- Memory manager tracks allocations per execution
- Host header preserved via `x-forwarded-host`
- Input/output capture enables complete execution visibility

