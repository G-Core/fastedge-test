# Backend Architecture

## Overview

The backend is a Node.js + Express + TypeScript server that orchestrates WASM execution for proxy-wasm testing. It loads WASM binaries, executes hooks, performs HTTP requests, and returns detailed execution results.

**✅ Real-Time Synchronization**: WebSocket integration (January 2026) enables real-time event broadcasting to all connected clients. See [WEBSOCKET_IMPLEMENTATION.md](../features/WEBSOCKET_IMPLEMENTATION.md) for details.

## Technology Stack

- **Node.js 20.x**: Runtime environment
- **Express 4.x**: Web server framework
- **TypeScript 5.4.5**: Type safety
- **WebAssembly API**: WASM execution (Node.js native)
- **WASI**: WebAssembly System Interface support
- **ws 8.19.0**: WebSocket server for real-time updates

## Project Structure

```
server/
├── server.ts              # Express app, API endpoints, WebSocket setup
├── tsconfig.json         # TypeScript configuration
├── runner/
│   ├── ProxyWasmRunner.ts    # Main WASM orchestration + event emission
│   ├── HostFunctions.ts      # WASM host function implementations
│   ├── MemoryManager.ts      # WASM memory management
│   ├── HeaderManager.ts      # HTTP header serialization
│   ├── PropertyResolver.ts   # Property/metadata resolution
│   └── types.ts              # Shared type definitions
├── websocket/            # Real-time synchronization (Jan 2026)
│   ├── WebSocketManager.ts   # Connection management (314 lines)
│   ├── StateManager.ts       # Event coordination (153 lines)
│   ├── types.ts              # Event type definitions
│   └── index.ts              # Module exports
├── fastedge-host/        # FastEdge-specific host functions (Feb 2026)
│   ├── types.ts              # FastEdge type definitions (FastEdgeConfig, ISecretStore, IDictionary)
│   ├── SecretStore.ts        # Time-based secret rotation with effectiveAt support
│   ├── Dictionary.ts         # Key-value configuration store
│   ├── hostFunctions.ts      # Factory for FastEdge WASM host functions
│   └── index.ts              # Module exports
└── utils/                # Utility modules (Feb 2026)
    └── dotenv-loader.ts      # Dotenv file parser and loader
```

## Core Components

### WASM Initialization (February 2026)

**Initialization Lifecycle:**

The proxy-wasm spec defines initialization hooks called when the VM and plugin start:

1. `proxy_on_vm_start(root_context_id, vm_config_size)` - VM-level initialization
2. `proxy_on_plugin_start(root_context_id, plugin_config_size)` - Plugin instance initialization
3. `proxy_on_configure(root_context_id, plugin_config_size)` - Plugin configuration
4. `proxy_on_context_create(context_id, parent_context_id)` - Context creation

**Test Runner Behavior:**

- **Configuration**: Provides default `{"test_mode": true}` for VM and plugin configs
- **Error Suppression**: G-Core SDK initialization hooks fail in test environment (expected)
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
- Initialization only runs once per WASM load, subsequent hooks reuse context

### PropertyResolver.ts (Property Path Resolution)

**✅ COMPLETED (February 5, 2026)**: Full property integration with runtime URL extraction, chaining, and request reconstruction.

The PropertyResolver resolves property paths for `get_property` and `set_property` calls.

**Features:**

1. **Runtime Property Extraction:**
   - Parses target URL to extract `request.url`, `request.host`, `request.path`, `request.query`, `request.scheme`, `request.extension`
   - Automatically called in `callFullFlow` before hook execution
   - URL parsing with error handling and fallback values

2. **Property Merge Strategy:**
   - User-provided properties (from ServerPropertiesPanel or API) take precedence
   - Runtime-calculated properties used as fallback
   - Allows overriding any calculated property with custom values
   - `getAllProperties()` returns merged view with proper priority

3. **Property Chaining:**
   - Properties modified in one hook flow to subsequent hooks
   - Captured in input/output states for UI visibility
   - Modifications affect actual HTTP requests via URL reconstruction

4. **SDK Integration:**
   - `get_property` in HostFunctions.ts retrieves values via PropertyResolver
   - `set_property` in HostFunctions.ts updates PropertyResolver (allows WASM to set custom properties)
   - Full compatibility with G-Core proxy-wasm AssemblyScript SDK

5. **Request Reconstruction:**
   - Modified properties (`request.scheme`, `request.host`, `request.path`, `request.query`) reconstruct target URL
   - HTTP fetch uses reconstructed URL instead of original
   - Enables WASM to redirect requests, switch backends, rewrite paths

### server.ts (Express Server)

Main HTTP server with five endpoints:

#### POST /api/load

Loads WASM binary into memory and recreates runner with dotenv settings:

```typescript
app.post("/api/load", async (req, res) => {
  const { wasmBase64, dotenv } = req.body;

  // Recreate runner with dotenv.enabled setting
  runner = new ProxyWasmRunner(undefined, dotenv?.enabled ?? true);
  runner.setStateManager(stateManager);

  const buffer = Buffer.from(wasmBase64, "base64");
  await runner.load(buffer);

  // Emit WASM loaded event
  stateManager.emitWasmLoaded("binary.wasm", buffer.length, source);

  res.json({ ok: true });
});
```

**Parameters:**
- `wasmBase64` (required): Base64-encoded WASM binary
- `dotenv.enabled` (optional, default: `true`): Enable/disable dotenv file loading
- `dotenv.path` (optional): Directory to load `.env*` files from (defaults to CWD)

**Behavior:**
- Creates new `ProxyWasmRunner` instance with `dotenv.enabled` flag
- When `dotenv.enabled=true`, loads secrets/dictionary from `.env*` files
- When `dotenv.enabled=false`, uses only programmatically-provided FastEdge config
- WASM reload required when toggling dotenv flag

#### POST /api/call

Executes a single hook (for manual testing):

```typescript
app.post("/api/call", async (req, res) => {
  const { hook, request, response, properties } = req.body;
  // Note: logLevel is ignored - server always returns all logs (trace level)
  // Frontend filters logs client-side based on user selection
  const result = await runner.callHook({
    hook,
    request: request ?? { headers: {}, body: "" },
    response: response ?? { headers: {}, body: "" },
    properties: properties ?? {},
    logLevel: 0, // Always capture all logs (Trace)
  });
  res.json({ ok: true, result });
});
```

#### POST /api/send

Executes full flow (all hooks + HTTP fetch):

```typescript
app.post("/api/send", async (req, res) => {
  const { url, request, response, properties } = req.body;
  // Note: logLevel is ignored - server always returns all logs (trace level)
  // Frontend filters logs client-side based on user selection
  const fullFlowResult = await runner.callFullFlow(
    {
      hook: "",
      request: request ?? { headers: {}, body: "", method: "GET" },
      response: response ?? { headers: {}, body: "" },
      properties: properties ?? {},
      logLevel: 0, // Always capture all logs (Trace)
    },
    url,
  );

  // Emit request completed event
  stateManager.emitRequestCompleted(
    fullFlowResult.hookResults,
    fullFlowResult.finalResponse,
    fullFlowResult.calculatedProperties,
    source,
  );

  res.json({ ok: true, ...fullFlowResult });
});
```

**Response includes:**
- `hookResults`: Results from all four hooks (onRequestHeaders, onRequestBody, onResponseHeaders, onResponseBody)
- `finalResponse`: Final HTTP response after WASM modifications
- `calculatedProperties`: Runtime-calculated properties (request.url, request.host, request.path, etc.)

#### GET /api/config (February 2026)

Reads test configuration from `fastedge-config.test.json`:

```typescript
app.get("/api/config", async (req, res) => {
  const configPath = path.join(__dirname, "..", ".fastedge-debug", "fastedge-config.test.json");
  const configData = await fs.readFile(configPath, "utf-8");
  const config = JSON.parse(configData);
  res.json({ ok: true, config });
});
```

**Purpose**: Allows AI agents to read developer's test configuration

#### POST /api/config (February 2026)

Saves test configuration to `fastedge-config.test.json`:

```typescript
app.post("/api/config", async (req, res) => {
  const { config } = req.body;
  const configPath = path.join(__dirname, "..", ".fastedge-debug", "fastedge-config.test.json");
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");

  // Emit properties updated event if properties changed
  if (config.properties) {
    const source = (req.headers["x-source"] as any) || "ui";
    stateManager.emitPropertiesUpdated(config.properties, source);
  }

  res.json({ ok: true });
});
```

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

**Architecture (February 2026):** Each hook executes in a completely isolated WASM instance to simulate production behavior:

- **Compilation**: Happens once in `load()`, stored as `WebAssembly.Module`
- **Instantiation**: Fresh instance created for each hook call
- **Isolation**: No state sharing between hooks (matches production nginx + wasmtime)
- **Performance**: Compilation is expensive (once), instantiation is cheap (per hook)

**Production Parity Headers (February 2026):**

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

**Flow with Input/Output and Property Tracking (February 5, 2026):**

```typescript
// Phase 1: Request Hooks
results.onRequestHeaders = await this.callHook({ hook: "onRequestHeaders", ... });

// Chain modified headers AND properties to next hook
const headersAfterRequestHeaders = results.onRequestHeaders.output.request.headers;
const propertiesAfterRequestHeaders = results.onRequestHeaders.properties;

results.onRequestBody = await this.callHook({
  hook: "onRequestBody",
  request: { headers: headersAfterRequestHeaders, ... },
  properties: propertiesAfterRequestHeaders,  // ✅ Properties chain
});

// Phase 2: HTTP Fetch with URL Reconstruction
const modifiedRequestHeaders = results.onRequestBody.output.request.headers;
const modifiedRequestBody = results.onRequestBody.output.request.body;
const propertiesAfterRequestBody = results.onRequestBody.properties;

// Reconstruct URL from modified properties
const modifiedScheme = propertiesAfterRequestBody["request.scheme"] || "https";
const modifiedHost = propertiesAfterRequestBody["request.host"] || "localhost";
const modifiedPath = propertiesAfterRequestBody["request.path"] || "/";
const modifiedQuery = propertiesAfterRequestBody["request.query"] || "";
const actualTargetUrl = `${modifiedScheme}://${modifiedHost}${modifiedPath}${modifiedQuery ? "?" + modifiedQuery : ""}`;

// Fetch uses reconstructed URL (WASM can redirect requests!)
const response = await fetch(actualTargetUrl, {
  method: requestMethod,
  headers: modifiedRequestHeaders,
  body: modifiedRequestBody,
});

// Read complete response (streaming not implemented)
// Note: Waits for entire response before processing
const responseBody = await response.text();  // or arrayBuffer() for binary

// Phase 3: Response Hooks (with modified request context)
results.onResponseHeaders = await this.callHook({
  hook: "onResponseHeaders",
  request: { headers: modifiedRequestHeaders, body: modifiedRequestBody },
  response: { headers: responseHeaders, body: responseBody }
});

const headersAfterResponseHeaders = results.onResponseHeaders.output.response.headers;

results.onResponseBody = await this.callHook({
  hook: "onResponseBody",
  request: { headers: modifiedRequestHeaders, body: modifiedRequestBody },
  response: { headers: headersAfterResponseHeaders, body: responseBody }
});
```

**⚠️ Streaming Limitation:**

The current implementation does not support streaming responses. It uses `await response.text()` or `await response.arrayBuffer()` which waits for the entire response to complete before processing.

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

**Potential solutions for future:**

1. **Chunk-based processing**: Use `response.body.getReader()` to read stream incrementally
2. **Configurable chunk size**: Split complete responses into artificial chunks for testing
3. **Hybrid mode**: Add a flag to enable streaming vs. complete response testing

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

**Input/Output Capture (February 5, 2026):**

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

**FastEdge Extensions (February 2026):**

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
- Production parity with G-Core FastEdge CDN runtime

### MemoryManager.ts

Manages WASM linear memory:

**Responsibilities:**

- Allocate/deallocate memory blocks
- Write strings and byte arrays to WASM memory
- Read data from WASM memory
- Track allocations for cleanup

**Key Methods:**

- `allocateString(str: string): number` - Write string to memory, return pointer
- `readString(ptr: number, len: number): string` - Read string from memory
- `allocateBytes(data: Uint8Array): number` - Write bytes to memory
- `deallocate(ptr: number)` - Free memory (currently a no-op)

### HeaderManager.ts

Handles G-Core SDK header serialization format:

**Format:**

```
[count: u32][size1: u32][size2: u32]...[sizeN: u32][key1\0value1\0key2\0value2\0...]
```

**Methods:**

- `serialize(headers: Record<string, string>): Uint8Array` - Convert to binary format
- `deserialize(data: Uint8Array): Record<string, string>` - Parse binary to object
- `normalize(headers: Record<string, string>)` - Lowercase keys, trim values

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

### FastEdge Host Functions (February 2026)

**Purpose:** Extends proxy-wasm ABI with G-Core FastEdge production runtime functions for secrets management and configuration.

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

### Dotenv Loader (February 2026)

**Location:** `server/utils/dotenv-loader.ts`

Parses and loads environment variables from `.env*` files for FastEdge configuration.

**Functions:**

`loadDotenvFiles(dotenvPath: string = "."): Promise<FastEdgeConfig>`

- Loads and parses multiple dotenv file formats
- Returns `{ secrets, dictionary }` object
- Silently skips missing files (not an error)

**Supported Files:**

1. `.env` - G-Core FastEdge format with prefixes:
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

#### Dotenv Support (February 2026)

**✅ COMPLETED**: Full dotenv integration with toggle support. See [DOTENV.md](../features/DOTENV.md) for complete documentation.

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

**HookCall:**

```typescript
export type HookCall = {
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
  logLevel?: number; // Optional log level filter (0=trace to 5=critical)
};
```

**HookResult (with Input/Output):**

```typescript
export type HookResult = {
  returnCode: number | null;
  logs: { level: number; message: string }[];
  input: {
    request: { headers: HeaderMap; body: string };
    response: { headers: HeaderMap; body: string };
    properties?: Record<string, unknown>; // State before hook execution
  };
  output: {
    request: { headers: HeaderMap; body: string };
    response: { headers: HeaderMap; body: string };
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
    headers: HeaderMap;
    body: string;
    contentType: string;
    isBase64?: boolean;
  };
  calculatedProperties?: Record<string, unknown>; // Runtime-extracted properties
};
```

**Calculated Properties (February 2026):**

The `calculatedProperties` field contains runtime-extracted properties from the target URL:
- `request.url`: Full URL
- `request.host`: Hostname from URL
- `request.path`: Path component
- `request.query`: Query string (without leading `?`)
- `request.scheme`: Protocol (http/https)
- `request.extension`: File extension from path

These are extracted by `PropertyResolver.extractRuntimePropertiesFromUrl()` before hook execution and returned to the frontend for display in the properties panel.

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

## Hook Execution Model (February 2026)

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
- **Future-ready**: Enables loading different WASM modules for different hooks
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

- Set via `logLevel` parameter
- Filters logs before returning to frontend
- Only logs >= specified level are included

**Debug Mode:**

- Set `PROXY_RUNNER_DEBUG=1` environment variable
- Enables verbose internal logging
- Logs WASM imports/exports, memory operations, etc.

## Development

**Build:**

```bash
pnpm run build:backend  # Compile TypeScript to dist/
```

**Dev Mode:**

```bash
pnpm run dev:backend    # Watch mode with tsx
```

**Production:**

```bash
pnpm start              # Run compiled dist/server.js
```

## Port Configuration

- Default: `5179`
- Override: `PORT=3000 pnpm start`
- Frontend proxies `/api/*` to backend port

## Notes

- WASM module loaded once, reused for all calls
- Each hook execution creates new stream context
- Root context initialized once per WASM load
- Memory manager tracks allocations per execution
- Host header preserved via `x-forwarded-host`
- Input/output capture enables complete execution visibility

Last Updated: February 6, 2026
