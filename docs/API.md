# REST API Reference

The `@gcoredev/fastedge-test` debugger server exposes a REST API for loading WASM modules, executing requests, and managing test configuration.

> **Note on header values.** Response and hook-result headers use `Record<string, string | string[]>` on the wire — single-valued headers are a `string`, multi-valued headers (notably `Set-Cookie` per RFC 6265) are a `string[]`. Request-side header inputs remain single-valued `Record<string, string>`. Type signatures below use `Record<string, string>` in places for readability; output-side headers accept the widened form.

## Base URL

```
http://localhost:5179
```

The port can be overridden via the `PORT` environment variable. When `WORKSPACE_PATH` is set, the active port is written to `$WORKSPACE_PATH/.fastedge-debug/.debug-port` on startup and deleted on shutdown.

## Common Headers

### X-Source Header

The `POST /api/execute`, `POST /api/send`, and `POST /api/config` endpoints accept an optional `X-Source` request header that tags the origin of the operation in WebSocket broadcast events.

| Value      | Description                                             |
| ---------- | ------------------------------------------------------- |
| `ui`       | Request originated from the web UI (default if omitted) |
| `ai_agent` | Request originated from an AI agent                     |
| `api`      | Request originated from direct API usage                |
| `system`   | Request originated from an automated system             |

```http
X-Source: ai_agent
```

---

## Health

### GET /health

Returns the server status and service identity.

**Response**

```typescript
{
  status: "ok";
  service: "fastedge-debugger";
}
```

**Example**

```bash
curl http://localhost:5179/health
```

```json
{
  "status": "ok",
  "service": "fastedge-debugger"
}
```

---

### GET /api/client-count

Returns the number of currently connected WebSocket clients. Useful in CI tooling to wait until the UI has connected before proceeding.

**Response**

```typescript
{
  count: number;
}
```

**Example**

```bash
curl http://localhost:5179/api/client-count
```

```json
{
  "count": 1
}
```

---

## WASM Loading

### POST /api/load

Loads a WASM binary into the runner. Accepts either a file path or a base64-encoded binary. Automatically detects whether the module is HTTP-WASM or Proxy-WASM.

**Request Body**

Exactly one of `wasmPath` or `wasmBase64` must be provided; providing both is an error.

```typescript
{
  wasmPath?: string;    // Absolute path to a .wasm file on the server filesystem
  wasmBase64?: string;  // Base64-encoded WASM binary; mutually exclusive with wasmPath
  dotenv?: {
    enabled?: boolean;  // Whether to load .env files for this module
    path?: string;      // Directory containing .env files (defaults to server CWD)
  };
  httpPort?: number;    // HTTP-WASM only. Pin the runner subprocess to this port (1024–65535).
                        // Load fails immediately if the port is already in use.
                        // Ignored for proxy-wasm modules.
}
```

**Response**

```typescript
{
  ok: true;
  wasmType: "http-wasm" | "proxy-wasm";
  resolvedPath?: string; // Absolute path used when wasmPath was provided
}
```

**Example — load from path**

```bash
curl -X POST http://localhost:5179/api/load \
  -H "Content-Type: application/json" \
  -d '{
    "wasmPath": "/home/user/project/build/module.wasm",
    "dotenv": { "enabled": true }
  }'
```

```json
{
  "ok": true,
  "wasmType": "proxy-wasm",
  "resolvedPath": "/home/user/project/build/module.wasm"
}
```

**Example — load from base64**

```bash
curl -X POST http://localhost:5179/api/load \
  -H "Content-Type: application/json" \
  -d '{
    "wasmBase64": "AGFzbQEAAAA...",
    "dotenv": { "enabled": false }
  }'
```

```json
{
  "ok": true,
  "wasmType": "http-wasm"
}
```

**Example — pin HTTP-WASM to a specific port**

```bash
curl -X POST http://localhost:5179/api/load \
  -H "Content-Type: application/json" \
  -d '{
    "wasmPath": "/home/user/project/build/app.wasm",
    "httpPort": 8100
  }'
```

```json
{
  "ok": true,
  "wasmType": "http-wasm",
  "resolvedPath": "/home/user/project/build/app.wasm"
}
```

**Error Responses**

| Status | Condition                                                                                                   |
| ------ | ----------------------------------------------------------------------------------------------------------- |
| `400`  | Validation failed, missing both `wasmPath` and `wasmBase64`, invalid path, or path does not end in `.wasm` |
| `400`  | `httpPort` is specified and already in use (HTTP-WASM only)                                                 |
| `500`  | WASM load failed or runner initialization error                                                             |

---

### PATCH /api/dotenv

Applies updated dotenv settings to the currently loaded WASM module without reloading the binary. For Proxy-WASM, this resets stores and reloads dotenv files in-place. For HTTP-WASM, this restarts the underlying process with updated flags.

Requires a WASM module to already be loaded via `POST /api/load`.

**Request Body**

```typescript
{
  dotenv: {
    enabled: boolean; // Whether dotenv loading should be enabled
    path?: string;    // Directory containing .env files (defaults to server CWD)
  };
}
```

**Response**

```typescript
{
  ok: true;
}
```

**Example**

```bash
curl -X PATCH http://localhost:5179/api/dotenv \
  -H "Content-Type: application/json" \
  -d '{
    "dotenv": { "enabled": true, "path": "/home/user/project" }
  }'
```

```json
{
  "ok": true
}
```

**Error Responses**

| Status | Condition                                                      |
| ------ | -------------------------------------------------------------- |
| `400`  | `dotenv.enabled` is not a boolean, or no WASM module is loaded |
| `500`  | Failed to apply dotenv settings                                |

---

## Test Execution

### POST /api/execute

Executes a request through the loaded WASM module. Behavior differs based on the detected runner type. This endpoint does not use schema validation — fields are read directly from the request body.

Requires a WASM module to be loaded via `POST /api/load`. Accepts an optional [`X-Source`](#x-source-header) request header.

**Request Body**

For **HTTP-WASM**, provide either `path` (preferred) or `url` (legacy). When `path` is given, it is used directly as the request path (e.g. `/api/hello?q=1`). When only `url` is given, the path and query string are extracted from it.

```typescript
{
  path?: string;                     // Request path and query string (preferred)
  url?: string;                      // Full URL — path and query extracted (legacy fallback)
  method?: string;                   // HTTP method (default: "GET")
  headers?: Record<string, string>;  // Request headers (default: {})
  body?: string;                     // Request body (default: "")
}
```

For **Proxy-WASM**, the top-level `url` field is required. The full CDN flow is controlled via nested `request` and `properties` fields. The upstream response is generated at runtime — either by a real fetch against `url`, or by the built-in responder when `url === "built-in"`:

```typescript
{
  url: string;                          // Request URL, or "built-in" (required)
  request?: {
    method?: string;                    // HTTP method (default: "GET")
    headers?: Record<string, string>;   // Request headers (default: {})
    body?: string;                      // Request body (default: "")
  };
  properties?: Record<string, unknown>; // CDN properties (default: {})
}
```

**Response — HTTP-WASM**

```typescript
{
  ok: true;
  result: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
    contentType: string | null;
    isBase64?: boolean;
    logs: Array<{ level: number; message: string }>;
  };
}
```

**Response — Proxy-WASM**

```typescript
{
  ok: true;
  hookResults: Record<string, HookResult>;
  finalResponse: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
    contentType: string;
    isBase64?: boolean;
  };
  calculatedProperties?: Record<string, unknown>;
}
```

Where `HookResult` is:

```typescript
type HookResult = {
  returnCode: number | null;
  logs: Array<{ level: number; message: string }>;
  input: {
    request: { headers: Record<string, string>; body: string };
    response: { headers: Record<string, string>; body: string };
    properties?: Record<string, unknown>;
  };
  output: {
    request: { headers: Record<string, string>; body: string };
    response: { headers: Record<string, string>; body: string };
    properties?: Record<string, unknown>;
  };
  properties: Record<string, unknown>;
};
```

`hookResults` is keyed by hook name (e.g. `"onRequestHeaders"`, `"onResponseHeaders"`). `calculatedProperties` is present only when the runner derives request-derived properties; keys follow the `request.*` pattern (e.g. `request.url`, `request.host`, `request.path`, `request.query`, `request.scheme`, `request.extension`, `request.method`).

**Example — HTTP-WASM**

```bash
curl -X POST http://localhost:5179/api/execute \
  -H "Content-Type: application/json" \
  -H "X-Source: api" \
  -d '{
    "path": "/api/data?format=json",
    "method": "GET",
    "headers": { "accept": "application/json" }
  }'
```

```json
{
  "ok": true,
  "result": {
    "status": 200,
    "statusText": "OK",
    "headers": { "content-type": "application/json" },
    "body": "{\"hello\":\"world\"}",
    "contentType": "application/json",
    "isBase64": false,
    "logs": [
      { "level": 2, "message": "request received" }
    ]
  }
}
```

**Example — Proxy-WASM**

```bash
curl -X POST http://localhost:5179/api/execute \
  -H "Content-Type: application/json" \
  -H "X-Source: api" \
  -d '{
    "url": "https://example.com/page",
    "request": {
      "method": "GET",
      "headers": { "host": "example.com" },
      "body": ""
    },
    "properties": {}
  }'
```

```json
{
  "ok": true,
  "hookResults": {
    "onRequestHeaders": {
      "returnCode": 0,
      "logs": [{ "level": 2, "message": "onRequestHeaders called" }],
      "input": {
        "request": { "headers": { "host": "example.com" }, "body": "" },
        "response": { "headers": {}, "body": "" },
        "properties": {}
      },
      "output": {
        "request": { "headers": { "host": "example.com", "x-added": "1" }, "body": "" },
        "response": { "headers": {}, "body": "" }
      },
      "properties": {}
    }
  },
  "finalResponse": {
    "status": 200,
    "statusText": "OK",
    "headers": { "content-type": "text/html" },
    "body": "<html/>",
    "contentType": "text/html"
  },
  "calculatedProperties": {
    "request.url": "https://example.com/page",
    "request.host": "example.com",
    "request.path": "/page",
    "request.query": "",
    "request.scheme": "https",
    "request.extension": "",
    "request.method": "GET"
  }
}
```

**Error Responses**

| Status | Condition                                                                                      |
| ------ | ---------------------------------------------------------------------------------------------- |
| `400`  | No WASM module loaded, or missing `path`/`url` for HTTP-WASM, or missing `url` for Proxy-WASM |
| `500`  | Execution failed                                                                               |

---

### POST /api/call

Calls a specific Proxy-WASM CDN hook directly. Only valid for Proxy-WASM modules.

Requires a WASM module to be loaded via `POST /api/load`.

**Request Body**

```typescript
{
  hook: "onRequestHeaders" | "onRequestBody" | "onResponseHeaders" | "onResponseBody";
  request?: {
    headers: Record<string, string>;
    body: string;
  };
  response?: {
    headers: Record<string, string>;
    body: string;
  };
  properties: Record<string, unknown>; // Required; use {} if none
}
```

`request` and `response` default to `{ headers: {}, body: "" }` if omitted.

**Response**

```typescript
{
  ok: true;
  result: HookResult;
}
```

Where `HookResult` is:

```typescript
type HookResult = {
  returnCode: number | null;
  logs: Array<{ level: number; message: string }>;
  input: {
    request: { headers: Record<string, string>; body: string };
    response: { headers: Record<string, string>; body: string };
    properties?: Record<string, unknown>;
  };
  output: {
    request: { headers: Record<string, string>; body: string };
    response: { headers: Record<string, string>; body: string };
    properties?: Record<string, unknown>;
  };
  properties: Record<string, unknown>;
};
```

**Example**

```bash
curl -X POST http://localhost:5179/api/call \
  -H "Content-Type: application/json" \
  -d '{
    "hook": "onRequestHeaders",
    "request": {
      "headers": { "host": "example.com", "user-agent": "curl/8.0" },
      "body": ""
    },
    "response": {
      "headers": {},
      "body": ""
    },
    "properties": {
      "client.geo.country": "US"
    }
  }'
```

```json
{
  "ok": true,
  "result": {
    "returnCode": 0,
    "logs": [
      { "level": 2, "message": "processing request headers" }
    ],
    "input": {
      "request": {
        "headers": { "host": "example.com", "user-agent": "curl/8.0" },
        "body": ""
      },
      "response": { "headers": {}, "body": "" },
      "properties": { "client.geo.country": "US" }
    },
    "output": {
      "request": {
        "headers": { "host": "example.com", "user-agent": "curl/8.0", "x-country": "US" },
        "body": ""
      },
      "response": { "headers": {}, "body": "" }
    },
    "properties": { "client.geo.country": "US" }
  }
}
```

**Error Responses**

| Status | Condition                                                                              |
| ------ | -------------------------------------------------------------------------------------- |
| `400`  | Validation failed (invalid hook name, missing `properties`), or no WASM module loaded |
| `500`  | Hook execution failed                                                                  |

---

### POST /api/send

Executes the full Proxy-WASM CDN request/response flow. Equivalent to `POST /api/execute` for Proxy-WASM, but uses stricter Zod schema validation on the request body. Only valid for Proxy-WASM modules.

Requires a WASM module to be loaded via `POST /api/load`. Accepts an optional [`X-Source`](#x-source-header) request header.

**Request Body**

```typescript
{
  url: string | "built-in";            // Full request URL, or "built-in" to use the built-in responder
  request?: {
    method?: string;                   // HTTP method (default: "GET")
    url?: string;
    headers?: Record<string, string>;  // Request headers (default: {})
    body?: string;                     // Request body (default: "")
  };
  properties: Record<string, unknown>; // CDN properties (required; use {} if none)
}
```

The upstream response is generated at runtime — either by a real fetch against `url`, or by the built-in responder when `url === "built-in"`.

**Response**

```typescript
{
  ok: true;
  hookResults: Record<string, HookResult>;
  finalResponse: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
    contentType: string;
    isBase64?: boolean;
  };
  calculatedProperties?: Record<string, unknown>;
}
```

`HookResult` has the same shape as documented in [`POST /api/call`](#post-apicall). `hookResults` is keyed by hook name. `calculatedProperties` keys follow the `request.*` pattern.

**Example**

```bash
curl -X POST http://localhost:5179/api/send \
  -H "Content-Type: application/json" \
  -H "X-Source: ai_agent" \
  -d '{
    "url": "https://example.com/api/resource",
    "request": {
      "method": "POST",
      "headers": { "content-type": "application/json" },
      "body": "{\"key\":\"value\"}"
    },
    "properties": {
      "client.geo.country": "DE"
    }
  }'
```

```json
{
  "ok": true,
  "hookResults": {
    "onRequestHeaders": {
      "returnCode": 0,
      "logs": [],
      "input": {
        "request": { "headers": { "content-type": "application/json" }, "body": "" },
        "response": { "headers": {}, "body": "" },
        "properties": { "client.geo.country": "DE" }
      },
      "output": {
        "request": { "headers": { "content-type": "application/json" }, "body": "" },
        "response": { "headers": {}, "body": "" }
      },
      "properties": { "client.geo.country": "DE" }
    },
    "onResponseHeaders": {
      "returnCode": 0,
      "logs": [],
      "input": {
        "request": { "headers": { "content-type": "application/json" }, "body": "" },
        "response": { "headers": { "content-type": "application/json" }, "body": "" },
        "properties": { "client.geo.country": "DE" }
      },
      "output": {
        "request": { "headers": { "content-type": "application/json" }, "body": "" },
        "response": { "headers": { "content-type": "application/json" }, "body": "" }
      },
      "properties": { "client.geo.country": "DE" }
    }
  },
  "finalResponse": {
    "status": 200,
    "statusText": "OK",
    "headers": { "content-type": "application/json" },
    "body": "{\"result\":\"ok\"}",
    "contentType": "application/json"
  },
  "calculatedProperties": {
    "request.url": "https://example.com/api/resource",
    "request.host": "example.com",
    "request.path": "/api/resource",
    "request.query": "",
    "request.scheme": "https",
    "request.extension": "",
    "request.method": "POST"
  }
}
```

**Error Responses**

| Status | Condition                                                                    |
| ------ | ---------------------------------------------------------------------------- |
| `400`  | Validation failed (missing `url` or `properties`), or no WASM module loaded |
| `500`  | Execution failed                                                             |

---

## Configuration

### GET /api/config

Reads the `fastedge-config.test.json` file from the project root and returns it along with a validation result.

**Response**

```typescript
{
  ok: true;
  config: TestConfig;
  valid: boolean;
  validationErrors?: {
    formErrors: string[];
    fieldErrors: Record<string, string[]>;
  };
}
```

`TestConfig` is a discriminated union on `appType`:

```typescript
// Proxy-WASM config (appType defaults to "proxy-wasm")
type ProxyWasmConfig = {
  $schema?: string;
  description?: string;
  appType: "proxy-wasm";
  wasm?: { path: string; description?: string };
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body: string;
  };
  properties: Record<string, unknown>;
  dotenv?: { enabled?: boolean; path?: string };
};

// HTTP-WASM config
type HttpWasmConfig = {
  $schema?: string;
  description?: string;
  appType: "http-wasm";
  wasm?: { path: string; description?: string };
  httpPort?: number; // Pin the runner subprocess to this port (1024–65535)
  request: {
    method: string;
    path: string;
    headers: Record<string, string>;
    body: string;
  };
  properties: Record<string, unknown>;
  dotenv?: { enabled?: boolean; path?: string };
};

type TestConfig = ProxyWasmConfig | HttpWasmConfig;
```

**Example**

```bash
curl http://localhost:5179/api/config
```

```json
{
  "ok": true,
  "config": {
    "$schema": "http://localhost:5179/api/schema/fastedge-config.test",
    "appType": "proxy-wasm",
    "request": {
      "method": "GET",
      "url": "https://example.com/",
      "headers": {},
      "body": ""
    },
    "properties": {}
  },
  "valid": true
}
```

**Error Responses**

| Status | Condition                                  |
| ------ | ------------------------------------------ |
| `404`  | `fastedge-config.test.json` does not exist |

---

### POST /api/config

Saves the provided configuration object to `fastedge-config.test.json` in the project root. If the config includes a `properties` field, a WebSocket event is broadcast to connected clients.

Accepts an optional [`X-Source`](#x-source-header) request header.

**Request Body**

```typescript
{
  config: TestConfig; // See GET /api/config for the TestConfig type
}
```

The `config` object must match one of the two `TestConfig` variants. `properties` and `appType` are required in both variants; `request` is required and its shape depends on `appType` (`path` for `"http-wasm"`, `url` for `"proxy-wasm"`).

**Response**

```typescript
{
  ok: true;
}
```

**Example**

```bash
curl -X POST http://localhost:5179/api/config \
  -H "Content-Type: application/json" \
  -H "X-Source: api" \
  -d '{
    "config": {
      "$schema": "http://localhost:5179/api/schema/fastedge-config.test",
      "appType": "proxy-wasm",
      "request": {
        "method": "GET",
        "url": "https://example.com/",
        "headers": { "accept": "text/html" },
        "body": ""
      },
      "properties": {
        "client.geo.country": "US"
      }
    }
  }'
```

```json
{
  "ok": true
}
```

**Error Responses**

| Status | Condition                                                                               |
| ------ | --------------------------------------------------------------------------------------- |
| `400`  | Validation failed (missing `config.appType`, `config.request`, or `config.properties`) |
| `500`  | File write failed                                                                       |

---

### POST /api/config/save-as

Saves the provided configuration to an arbitrary file path. The path can be absolute or relative to the project root. Creates intermediate directories as needed. Appends `.json` if the path does not already end in `.json`.

**Request Body**

```typescript
{
  config: object;    // The configuration object to serialize as JSON
  filePath: string;  // Target file path (absolute or relative to project root)
}
```

**Response**

```typescript
{
  ok: true;
  savedPath: string; // Resolved absolute path where the file was written
}
```

**Example**

```bash
curl -X POST http://localhost:5179/api/config/save-as \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "appType": "proxy-wasm",
      "request": {
        "method": "GET",
        "url": "https://example.com/",
        "headers": {},
        "body": ""
      },
      "properties": {}
    },
    "filePath": "configs/staging.test"
  }'
```

```json
{
  "ok": true,
  "savedPath": "/home/user/project/configs/staging.test.json"
}
```

**Error Responses**

| Status | Condition                               |
| ------ | --------------------------------------- |
| `400`  | Missing `config` or `filePath`          |
| `500`  | File write or directory creation failed |

---

## Schema

### GET /api/schema/:name

Serves a JSON Schema file by name. Use these schemas for request validation in test tooling or editor integrations.

The `:name` parameter is the schema name without the `.schema.json` suffix.

**Response**

Returns the JSON Schema document with `Content-Type: application/json`.

**Available Schemas**

#### Request Schemas

| Name         | Description                                |
| ------------ | ------------------------------------------ |
| `api-load`   | Request body schema for `POST /api/load`   |
| `api-send`   | Request body schema for `POST /api/send`   |
| `api-call`   | Request body schema for `POST /api/call`   |
| `api-config` | Request body schema for `POST /api/config` |

#### Response / Type Schemas

| Name                   | Description                                                   |
| ---------------------- | ------------------------------------------------------------- |
| `fastedge-config.test` | Schema for `fastedge-config.test.json` config files           |
| `hook-result`          | Shape of a single `HookResult` object                         |
| `hook-call`            | Shape of a `HookCall` input object                            |
| `full-flow-result`     | Shape of the `FullFlowResult` returned by full-flow endpoints |
| `http-request`         | Shape of an `HttpRequest` for HTTP-WASM execution             |
| `http-response`        | Shape of an `HttpResponse` returned by HTTP-WASM execution    |

**Example**

```bash
curl http://localhost:5179/api/schema/api-send
```

```bash
curl http://localhost:5179/api/schema/fastedge-config.test
```

**Using the schema in a config file**

```json
{
  "$schema": "http://localhost:5179/api/schema/fastedge-config.test",
  "appType": "proxy-wasm",
  "request": {
    "method": "GET",
    "url": "https://example.com/",
    "headers": {},
    "body": ""
  },
  "properties": {}
}
```

**Error Responses**

| Status | Condition             |
| ------ | --------------------- |
| `404`  | Schema name not found |

---

## Error Handling

All error responses follow a consistent shape:

```typescript
{
  ok: false;
  error: string | { formErrors: string[]; fieldErrors: Record<string, string[]> };
}
```

When a request body fails schema validation (Zod), `error` is the flattened Zod error object with `formErrors` and `fieldErrors`. For runtime errors, `error` is a plain string.

**Common status codes**

| Status | Meaning                                                                                       |
| ------ | --------------------------------------------------------------------------------------------- |
| `400`  | Invalid request body, missing required fields, or precondition not met (e.g. no WASM loaded) |
| `404`  | Resource not found (config file, schema file)                                                 |
| `500`  | Internal server error during execution or I/O                                                 |

---

## See Also

- [WEBSOCKET.md](./WEBSOCKET.md) — WebSocket protocol and event types
- [DEBUGGER.md](./DEBUGGER.md) — Server startup, configuration, and environment variables
- [TEST_FRAMEWORK.md](./TEST_FRAMEWORK.md) — Programmatic test framework API
- [RUNNER.md](./RUNNER.md) — Runner API and WASM type detection
