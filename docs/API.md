# REST API Reference

HTTP API exposed by the `@gcoredev/fastedge-test` debugger server. Use these endpoints to load WASM modules, execute CDN flows, and manage test configuration programmatically.

## Base URL

```
http://localhost:5179
```

The port is configurable via the `PORT` environment variable. When `WORKSPACE_PATH` is set, the server writes the active port to `$WORKSPACE_PATH/.debug-port` on startup and deletes it on shutdown — use this file for port discovery in CI tooling.

## Common Headers

### X-Source

Several endpoints accept an optional `X-Source` request header that tags the originating caller on WebSocket broadcast events. Consumers of the REST API should send `X-Source: api`.

| Value | Description |
|-------|-------------|
| `api` | Direct REST API call |
| `ai_agent` | AI agent or automated tooling |
| `ui` | Web UI (default when header is absent) |
| `system` | Internal system event |

**Applies to**: `POST /api/execute`, `POST /api/send`, `POST /api/config`

---

## Health

### GET /health

Returns server status and service identity.

**Response**

```typescript
type HealthResponse = {
  status: "ok";
  service: "fastedge-debugger";
};
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

**Errors**: None — always returns `200`.

---

### GET /api/client-count

Returns the number of active WebSocket clients. Useful for CI tooling that needs to wait until the UI has connected before proceeding.

**Response**

```typescript
type ClientCountResponse = {
  count: number;
};
```

**Example**

```bash
curl http://localhost:5179/api/client-count
```

```json
{ "count": 1 }
```

**Errors**: None — always returns `200`.

---

## WASM Loading

### POST /api/load

Loads a WASM binary into the runner. Auto-detects whether the binary is HTTP-WASM or Proxy-WASM. Must be called before any execution endpoint.

**Request Body**

Provide either `wasmPath` (preferred) or `wasmBase64`.

```typescript
type LoadRequest = {
  /** Absolute filesystem path to a .wasm file. */
  wasmPath?: string;
  /** Base64-encoded WASM binary. */
  wasmBase64?: string;
  dotenv?: {
    /** Whether to apply .env variables to the WASM environment. */
    enabled: boolean;
    /** Path to the directory containing the .env file. Defaults to server working directory. */
    path?: string;
  };
};
```

**Response**

```typescript
type LoadResponse = {
  ok: true;
  /** Detected runner type. */
  wasmType: "http-wasm" | "proxy-wasm";
  /** Resolved absolute path, present only when wasmPath was used. */
  resolvedPath?: string;
};
```

**Example — path-based load**

```bash
curl -X POST http://localhost:5179/api/load \
  -H "Content-Type: application/json" \
  -H "X-Source: api" \
  -d '{
    "wasmPath": "/path/to/my-app.wasm",
    "dotenv": { "enabled": true, "path": "/path/to/project" }
  }'
```

```json
{
  "ok": true,
  "wasmType": "proxy-wasm",
  "resolvedPath": "/path/to/my-app.wasm"
}
```

**Example — base64 load**

```typescript
import { readFileSync } from "fs";

const wasmBase64 = readFileSync("my-app.wasm").toString("base64");

const res = await fetch("http://localhost:5179/api/load", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Source": "api" },
  body: JSON.stringify({ wasmBase64 }),
});
const data = await res.json();
// { ok: true, wasmType: "proxy-wasm" }
```

**Errors**

| Status | Condition |
|--------|-----------|
| `400` | Validation failed, path invalid, path not ending in `.wasm`, file not found, or missing both `wasmPath` and `wasmBase64` |
| `500` | WASM failed to load or instantiate |

---

### PATCH /api/dotenv

Applies or updates dotenv settings on the currently loaded WASM module without reloading it.

**Request Body**

```typescript
type DotenvRequest = {
  dotenv: {
    /** Enable or disable .env injection. */
    enabled: boolean;
    /** Path to directory containing the .env file. */
    path?: string;
  };
};
```

**Response**

```typescript
type DotenvResponse = {
  ok: true;
};
```

**Example**

```bash
curl -X PATCH http://localhost:5179/api/dotenv \
  -H "Content-Type: application/json" \
  -d '{ "dotenv": { "enabled": false } }'
```

```json
{ "ok": true }
```

**Errors**

| Status | Condition |
|--------|-----------|
| `400` | `dotenv.enabled` is missing or not a boolean |
| `400` | No WASM module loaded |
| `500` | Failed to apply dotenv settings |

---

## Test Execution

### POST /api/execute

Executes a request against the loaded WASM module. Behavior differs based on the loaded runner type (HTTP-WASM vs Proxy-WASM).

This endpoint does not use schema validation — fields are read directly from the request body.

**Request Body**

```typescript
type ExecuteRequest = {
  /** Target URL. Required for both runner types. */
  url: string;
  /** HTTP method. Defaults to "GET". */
  method?: string;
  /** Request headers as key-value pairs. */
  headers?: Record<string, string>;
  /** Request body string. */
  body?: string;

  // The following fields are only used for Proxy-WASM runners:

  request?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  };
  response?: {
    headers?: Record<string, string>;
    body?: string;
    status?: number;
    statusText?: string;
  };
  properties?: Record<string, unknown>;
};
```

For **HTTP-WASM**: `url`, `method`, `headers`, and `body` are used directly as the request.

For **Proxy-WASM**: `url` is required; `request`, `response`, and `properties` are used for the CDN flow. Top-level `method`, `headers`, and `body` are ignored.

**Response — HTTP-WASM**

```typescript
type HttpWasmExecuteResponse = {
  ok: true;
  result: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
    contentType: string;
    isBase64: boolean;
  };
};
```

**Response — Proxy-WASM**

```typescript
type ProxyWasmExecuteResponse = {
  ok: true;
  hookResults: HookResult[];
  finalResponse: HttpResponse;
  calculatedProperties: Record<string, string>;
};
```

See `GET /api/schema/:name` for the `hook-result`, `http-response`, and `full-flow-result` schemas.

**Example — HTTP-WASM**

```bash
curl -X POST http://localhost:5179/api/execute \
  -H "Content-Type: application/json" \
  -H "X-Source: api" \
  -d '{
    "url": "http://example.com/api/data",
    "method": "GET",
    "headers": { "Accept": "application/json" }
  }'
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
    "response": {
      "headers": { "content-type": "text/html" },
      "body": "<html>...</html>",
      "status": 200
    },
    "properties": { "client_country": "US" }
  }'
```

**Errors**

| Status | Condition |
|--------|-----------|
| `400` | No WASM module loaded |
| `400` | `url` is missing or not a string |
| `500` | Execution failed |

---

### POST /api/call

Calls a single Proxy-WASM CDN hook by name.

**Request Body**

```typescript
type CallRequest = {
  hook: "onRequestHeaders" | "onRequestBody" | "onResponseHeaders" | "onResponseBody";
  request?: {
    headers: Record<string, string>;
    body: string;
  };
  response?: {
    headers: Record<string, string>;
    body: string;
  };
  properties?: Record<string, unknown>;
};
```

`request` and `response` default to `{ headers: {}, body: "" }` when omitted. `properties` defaults to `{}`.

**Response**

```typescript
type CallResponse = {
  ok: true;
  result: HookResult;
};
```

See `GET /api/schema/:name` for the `hook-result` and `hook-call` schemas.

**Example**

```bash
curl -X POST http://localhost:5179/api/call \
  -H "Content-Type: application/json" \
  -d '{
    "hook": "onRequestHeaders",
    "request": {
      "headers": { "host": "example.com", "x-custom": "value" },
      "body": ""
    },
    "properties": { "client_country": "DE" }
  }'
```

```json
{
  "ok": true,
  "result": {
    "action": "continue",
    "headers": { "host": "example.com", "x-custom": "value" }
  }
}
```

**Errors**

| Status | Condition |
|--------|-----------|
| `400` | Validation failed (invalid `hook` value, missing required fields) |
| `400` | No WASM module loaded |
| `500` | Hook execution failed |

---

### POST /api/send

Executes the full Proxy-WASM CDN request/response flow (all hooks in sequence). Equivalent to `POST /api/execute` for Proxy-WASM, but with stricter schema validation.

**Request Body**

```typescript
type SendRequest = {
  /** Target URL. Required. */
  url: string;
  request?: {
    method?: string;   // default: "GET"
    url?: string;
    headers?: Record<string, string>;  // default: {}
    body?: string;     // default: ""
  };
  response?: {
    headers?: Record<string, string>;  // default: {}
    body?: string;     // default: ""
  };
  /** Required. Pass {} if no properties needed. */
  properties: Record<string, unknown>;
};
```

**Response**

```typescript
type SendResponse = {
  ok: true;
  hookResults: HookResult[];
  finalResponse: HttpResponse;
  calculatedProperties: Record<string, string>;
};
```

See `GET /api/schema/:name` for the `full-flow-result`, `hook-result`, and `http-response` schemas.

**Example**

```bash
curl -X POST http://localhost:5179/api/send \
  -H "Content-Type: application/json" \
  -H "X-Source: api" \
  -d '{
    "url": "https://example.com/",
    "request": {
      "method": "GET",
      "headers": { "host": "example.com" },
      "body": ""
    },
    "response": {
      "headers": { "content-type": "text/html" },
      "body": "<html>Hello</html>"
    },
    "properties": { "client_country": "US" }
  }'
```

```json
{
  "ok": true,
  "hookResults": [
    { "hook": "onRequestHeaders", "action": "continue" },
    { "hook": "onResponseHeaders", "action": "continue" }
  ],
  "finalResponse": {
    "status": 200,
    "headers": { "content-type": "text/html" },
    "body": "<html>Hello</html>"
  },
  "calculatedProperties": { "client_country": "US" }
}
```

**Errors**

| Status | Condition |
|--------|-----------|
| `400` | Validation failed (`url` or `properties` missing) |
| `400` | No WASM module loaded |
| `500` | Execution failed |

---

## Configuration

### GET /api/config

Reads `fastedge-config.test.json` from the server's working directory and returns it with a validation result.

**Response**

```typescript
type GetConfigResponse = {
  ok: true;
  config: TestConfig;
  valid: boolean;
  /** Present only when valid is false. */
  validationErrors?: {
    formErrors: string[];
    fieldErrors: Record<string, string[]>;
  };
};
```

`TestConfig` matches the `api-config` schema shape (see `GET /api/schema/:name`).

**Example**

```bash
curl http://localhost:5179/api/config
```

```json
{
  "ok": true,
  "config": {
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

**Errors**

| Status | Condition |
|--------|-----------|
| `404` | `fastedge-config.test.json` does not exist or cannot be read |

---

### POST /api/config

Saves a test configuration object to `fastedge-config.test.json` in the server's working directory.

**Request Body**

```typescript
type PostConfigRequest = {
  config: {
    $schema?: string;
    description?: string;
    wasm?: {
      path: string;
      description?: string;
    };
    request: {
      method: string;    // default: "GET"
      url: string;
      headers: Record<string, string>;
      body: string;
    };
    response?: {
      headers: Record<string, string>;
      body: string;
    };
    /** Required. Pass {} if no properties needed. */
    properties: Record<string, unknown>;
    dotenv?: {
      enabled?: boolean;
      path?: string;
    };
  };
};
```

**Response**

```typescript
type PostConfigResponse = {
  ok: true;
};
```

**Example**

```bash
curl -X POST http://localhost:5179/api/config \
  -H "Content-Type: application/json" \
  -H "X-Source: api" \
  -d '{
    "config": {
      "request": {
        "method": "GET",
        "url": "https://example.com/",
        "headers": { "host": "example.com" },
        "body": ""
      },
      "properties": { "client_country": "US" }
    }
  }'
```

```json
{ "ok": true }
```

**Errors**

| Status | Condition |
|--------|-----------|
| `400` | Validation failed (missing required `config.request` or `config.properties`) |
| `500` | File write failed |

---

### POST /api/config/save-as

Saves a test configuration object to an arbitrary file path. Creates intermediate directories if needed.

**Request Body**

```typescript
type SaveAsRequest = {
  /** Config object (same shape as POST /api/config). */
  config: object;
  /** Absolute or relative file path. A .json extension is appended if missing. */
  filePath: string;
};
```

**Response**

```typescript
type SaveAsResponse = {
  ok: true;
  /** The resolved absolute path where the file was written. */
  savedPath: string;
};
```

**Example**

```bash
curl -X POST http://localhost:5179/api/config/save-as \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "request": {
        "method": "POST",
        "url": "https://api.example.com/submit",
        "headers": { "content-type": "application/json" },
        "body": "{\"key\": \"value\"}"
      },
      "properties": {}
    },
    "filePath": "configs/my-test"
  }'
```

```json
{
  "ok": true,
  "savedPath": "/home/user/project/configs/my-test.json"
}
```

**Errors**

| Status | Condition |
|--------|-----------|
| `400` | `config` is missing |
| `400` | `filePath` is missing |
| `500` | File write or directory creation failed |

---

## Schema

### GET /api/schema/:name

Serves a JSON Schema file by name. Useful for editor validation, request body construction, and response parsing.

**Path Parameter**

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Schema name without the `.schema.json` suffix |

**Available Schemas**

**Request Schemas** — use these to validate or construct request bodies:

| Name | Validates |
|------|-----------|
| `api-load` | `POST /api/load` request body |
| `api-send` | `POST /api/send` request body |
| `api-call` | `POST /api/call` request body |
| `api-config` | `POST /api/config` request body |

**Response / Type Schemas** — use these to parse and validate response payloads:

| Name | Describes |
|------|-----------|
| `fastedge-config.test` | Shape of `fastedge-config.test.json` |
| `hook-result` | Single hook execution result (used in `hookResults` arrays) |
| `hook-call` | Hook call input shape (used with `/api/call`) |
| `full-flow-result` | Complete flow result from `/api/send` and Proxy-WASM `/api/execute` |
| `http-request` | HTTP request object shape |
| `http-response` | HTTP response object shape |

**Response**

Returns the schema as `application/json`.

**Example**

```bash
curl http://localhost:5179/api/schema/api-send
```

```typescript
// Fetch and use for validation in Node.js
const schema = await fetch("http://localhost:5179/api/schema/api-load")
  .then(r => r.json());
```

**Errors**

| Status | Condition |
|--------|-----------|
| `404` | No schema file found for the given name |

---

## Error Handling

All error responses follow a consistent shape:

```typescript
type ErrorResponse = {
  ok: false;
  error: string | ZodFlattenedError;
};
```

When a request body fails Zod schema validation, `error` is a flattened Zod error object:

```typescript
type ZodFlattenedError = {
  formErrors: string[];
  fieldErrors: Record<string, string[]>;
};
```

When an error is a runtime exception, `error` is the string representation of the thrown value.

**Common status codes**

| Status | Meaning |
|--------|---------|
| `400` | Invalid request body, missing required fields, or precondition not met (e.g. no WASM loaded) |
| `404` | Resource not found (config file, schema file) |
| `500` | Server-side execution error |

---

## See Also

- [WEBSOCKET.md](WEBSOCKET.md) — WebSocket protocol and real-time event types
- [TEST_FRAMEWORK.md](TEST_FRAMEWORK.md) — Test framework API for writing automated tests
- [RUNNER.md](RUNNER.md) — Runner API and programmatic server startup
- [DEBUGGER.md](DEBUGGER.md) — Server configuration, environment variables, and startup options
