# REST API Reference

HTTP API exposed by the `@gcoredev/fastedge-test` debugger server. Use these endpoints to load WASM modules, execute test requests, and manage test configuration programmatically.

## Base URL

```
http://localhost:5179
```

The port is configurable via the `PORT` environment variable. See [DEBUGGER.md](DEBUGGER.md) for server startup options.

## Common Headers

### X-Source Header

The `/api/execute`, `/api/send`, and `POST /api/config` endpoints accept an optional `X-Source` request header. This header tags the originating caller on WebSocket broadcast events, allowing connected UI clients to distinguish the event source.

| Value | Description |
|---|---|
| `ui` | Request originated from the browser UI (default) |
| `ai_agent` | Request originated from an AI agent |
| `api` | Request originated from a REST API caller |
| `system` | Request originated from internal system automation |

```http
X-Source: api
```

If omitted, the value defaults to `"ui"`.

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

### GET /api/client-count

Returns the number of currently connected WebSocket clients. Useful in CI tooling to wait until a UI client has connected before loading a WASM module.

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
{
  "count": 1
}
```

---

## WASM Loading

### POST /api/load

Loads a WASM binary into the runner. Accepts either a file path or a base64-encoded binary. Also configures dotenv settings for the loaded module.

Exactly one of `wasmPath` or `wasmBase64` must be provided.

**Request Body**

```typescript
type LoadRequest = {
  wasmPath?: string;    // Absolute path to a .wasm file on the server filesystem
  wasmBase64?: string;  // Base64-encoded WASM binary
  dotenv?: {
    enabled: boolean;
    path?: string;      // Path to .env file; defaults to server working directory
  };
};
```

**Response**

```typescript
type LoadResponse =
  | {
      ok: true;
      wasmType: "http-wasm" | "proxy-wasm";
      resolvedPath?: string; // Populated when wasmPath was used
    }
  | {
      ok: false;
      error: string | object;
    };
```

**Example — load by path**

```bash
curl -X POST http://localhost:5179/api/load \
  -H "Content-Type: application/json" \
  -d '{
    "wasmPath": "/home/user/project/.fastedge/bin/app.wasm",
    "dotenv": { "enabled": true, "path": "/home/user/project" }
  }'
```

```json
{
  "ok": true,
  "wasmType": "proxy-wasm",
  "resolvedPath": "/home/user/project/.fastedge/bin/app.wasm"
}
```

**Example — load by base64**

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

**Error Responses**

| Status | Condition |
|---|---|
| `400` | Missing both `wasmPath` and `wasmBase64`, invalid path, path does not end in `.wasm`, or validation failure |
| `500` | WASM failed to load or instantiate |

---

### PATCH /api/dotenv

Applies or updates dotenv configuration for the currently loaded WASM module without reloading the binary.

**Request Body**

```typescript
type DotenvRequest = {
  dotenv: {
    enabled: boolean;
    path?: string; // Path to .env file; defaults to server working directory
  };
};
```

**Response**

```typescript
type DotenvResponse =
  | { ok: true }
  | { ok: false; error: string };
```

**Example**

```bash
curl -X PATCH http://localhost:5179/api/dotenv \
  -H "Content-Type: application/json" \
  -d '{ "dotenv": { "enabled": true, "path": "/home/user/project" } }'
```

```json
{ "ok": true }
```

**Error Responses**

| Status | Condition |
|---|---|
| `400` | `dotenv.enabled` is missing or not a boolean |
| `400` | No WASM module is currently loaded |
| `500` | Internal error applying dotenv settings |

---

## Test Execution

### POST /api/execute

Executes a request against the loaded WASM module. Behavior differs by runner type.

- **HTTP-WASM**: Executes a direct HTTP request/response cycle. Supply top-level `url`, `method`, `headers`, and `body`.
- **Proxy-WASM**: Runs the full CDN hook flow. Supply top-level `url` plus nested `request`, `response`, and `properties` objects.

This endpoint does not use JSON Schema validation. Fields are read directly from the request body.

Emits a WebSocket event on completion. Accepts the `X-Source` header.

**Request Body**

```typescript
type ExecuteRequest = {
  url: string;       // Required for both runner types

  // HTTP-WASM fields (top-level)
  method?: string;                     // HTTP method, e.g. "GET"
  headers?: Record<string, string>;    // Request headers
  body?: string;                       // Request body

  // Proxy-WASM fields (nested; ignored for HTTP-WASM)
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

**Response — HTTP-WASM**

```typescript
type ExecuteHttpWasmResponse =
  | {
      ok: true;
      result: {
        status: number;
        statusText: string;
        headers: Record<string, string>;
        body: string;
        contentType: string;
        isBase64?: boolean;
      };
    }
  | { ok: false; error: string };
```

**Response — Proxy-WASM**

```typescript
type ExecuteProxyWasmResponse =
  | {
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
  | { ok: false; error: string };

type HookResult = {
  returnCode: number | null;
  logs: { level: number; message: string }[];
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

**Example — HTTP-WASM**

```bash
curl -X POST http://localhost:5179/api/execute \
  -H "Content-Type: application/json" \
  -H "X-Source: api" \
  -d '{
    "url": "http://localhost:5179/hello",
    "method": "GET",
    "headers": { "accept": "application/json" },
    "body": ""
  }'
```

```json
{
  "ok": true,
  "result": {
    "status": 200,
    "statusText": "OK",
    "headers": { "content-type": "application/json" },
    "body": "{\"message\":\"hello\"}",
    "contentType": "application/json"
  }
}
```

**Example — Proxy-WASM**

```bash
curl -X POST http://localhost:5179/api/execute \
  -H "Content-Type: application/json" \
  -H "X-Source: api" \
  -d '{
    "url": "https://example.com/api/data",
    "request": {
      "method": "GET",
      "headers": { "x-custom": "value" },
      "body": ""
    },
    "response": {
      "headers": { "content-type": "application/json" },
      "body": "{\"data\":true}",
      "status": 200,
      "statusText": "OK"
    },
    "properties": { "tenant_id": "abc123" }
  }'
```

```json
{
  "ok": true,
  "hookResults": {
    "onRequestHeaders": {
      "returnCode": 0,
      "logs": [
        { "level": 2, "message": "processing request" }
      ],
      "input": {
        "request": { "headers": { "x-custom": "value" }, "body": "" },
        "response": { "headers": {}, "body": "" },
        "properties": { "tenant_id": "abc123" }
      },
      "output": {
        "request": { "headers": { "x-custom": "value", "x-added": "true" }, "body": "" },
        "response": { "headers": {}, "body": "" }
      },
      "properties": { "tenant_id": "abc123" }
    }
  },
  "finalResponse": {
    "status": 200,
    "statusText": "OK",
    "headers": { "content-type": "application/json" },
    "body": "{\"data\":true}",
    "contentType": "application/json"
  },
  "calculatedProperties": { "tenant_id": "abc123" }
}
```

**Error Responses**

| Status | Condition |
|---|---|
| `400` | No WASM module loaded |
| `400` | `url` missing or not a string |
| `500` | Execution error |

---

### POST /api/call

Calls a single named CDN hook on the loaded Proxy-WASM module.

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

`request` and `response` default to `{ headers: {}, body: "" }` if omitted. `properties` defaults to `{}`.

**Response**

```typescript
type CallResponse =
  | {
      ok: true;
      result: HookResult;
    }
  | { ok: false; error: string | object };

type HookResult = {
  returnCode: number | null;
  logs: { level: number; message: string }[];
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
      "headers": { "host": "example.com", "x-forwarded-for": "1.2.3.4" },
      "body": ""
    },
    "response": {
      "headers": {},
      "body": ""
    },
    "properties": { "geo_country": "US" }
  }'
```

```json
{
  "ok": true,
  "result": {
    "returnCode": 0,
    "logs": [
      { "level": 2, "message": "onRequestHeaders called" }
    ],
    "input": {
      "request": {
        "headers": { "host": "example.com", "x-forwarded-for": "1.2.3.4" },
        "body": ""
      },
      "response": { "headers": {}, "body": "" },
      "properties": { "geo_country": "US" }
    },
    "output": {
      "request": {
        "headers": { "host": "example.com", "x-forwarded-for": "1.2.3.4", "x-country": "US" },
        "body": ""
      },
      "response": { "headers": {}, "body": "" }
    },
    "properties": { "geo_country": "US" }
  }
}
```

**Error Responses**

| Status | Condition |
|---|---|
| `400` | Schema validation failure (invalid `hook` value, missing required fields) |
| `400` | No WASM module loaded |
| `500` | Hook execution error |

---

### POST /api/send

Runs the full CDN request/response flow through all applicable Proxy-WASM hooks. This is the primary endpoint for end-to-end Proxy-WASM testing.

Emits a WebSocket event on completion. Accepts the `X-Source` header.

**Request Body**

```typescript
type SendRequest = {
  url: string;           // Required
  request?: {
    method?: string;     // Default: "GET"
    url?: string;
    headers?: Record<string, string>; // Default: {}
    body?: string;       // Default: ""
  };
  response?: {
    headers?: Record<string, string>; // Default: {}
    body?: string;       // Default: ""
  };
  properties: Record<string, unknown>; // Required (may be empty object)
};
```

**Response**

```typescript
type SendResponse =
  | {
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
  | { ok: false; error: string | object };

type HookResult = {
  returnCode: number | null;
  logs: { level: number; message: string }[];
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
curl -X POST http://localhost:5179/api/send \
  -H "Content-Type: application/json" \
  -H "X-Source: api" \
  -d '{
    "url": "https://example.com/api/resource",
    "request": {
      "method": "POST",
      "headers": { "content-type": "application/json" },
      "body": "{\"key\":\"value\"}"
    },
    "response": {
      "headers": { "content-type": "application/json" },
      "body": "{\"result\":\"ok\"}"
    },
    "properties": { "datacenter": "eu-west" }
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
        "request": {
          "headers": { "content-type": "application/json" },
          "body": ""
        },
        "response": { "headers": {}, "body": "" },
        "properties": { "datacenter": "eu-west" }
      },
      "output": {
        "request": {
          "headers": { "content-type": "application/json" },
          "body": ""
        },
        "response": { "headers": {}, "body": "" }
      },
      "properties": { "datacenter": "eu-west" }
    },
    "onResponseHeaders": {
      "returnCode": 0,
      "logs": [],
      "input": {
        "request": { "headers": {}, "body": "" },
        "response": {
          "headers": { "content-type": "application/json" },
          "body": ""
        },
        "properties": { "datacenter": "eu-west" }
      },
      "output": {
        "request": { "headers": {}, "body": "" },
        "response": {
          "headers": { "content-type": "application/json", "x-processed": "true" },
          "body": ""
        }
      },
      "properties": { "datacenter": "eu-west" }
    }
  },
  "finalResponse": {
    "status": 200,
    "statusText": "OK",
    "headers": { "content-type": "application/json", "x-processed": "true" },
    "body": "{\"result\":\"ok\"}",
    "contentType": "application/json"
  },
  "calculatedProperties": { "datacenter": "eu-west" }
}
```

**Error Responses**

| Status | Condition |
|---|---|
| `400` | Schema validation failure (missing `url` or `properties`) |
| `400` | No WASM module loaded |
| `500` | Flow execution error |

---

## Configuration

### GET /api/config

Reads `fastedge-config.test.json` from the project root and returns it along with a schema validation result.

**Response**

```typescript
type GetConfigResponse =
  | {
      ok: true;
      config: TestConfig;
      valid: boolean;
      validationErrors?: object; // Present when valid is false
    }
  | { ok: false; error: string };

type TestConfig = {
  $schema?: string;
  description?: string;
  wasm?: {
    path: string;
    description?: string;
  };
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body: string;
  };
  response?: {
    headers: Record<string, string>;
    body: string;
  };
  properties: Record<string, unknown>;
  dotenv?: {
    enabled?: boolean;
    path?: string;
  };
};
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
    "wasm": { "path": "./.fastedge/bin/app.wasm" },
    "request": {
      "method": "GET",
      "url": "https://example.com/path",
      "headers": {},
      "body": ""
    },
    "response": { "headers": {}, "body": "" },
    "properties": { "geo_country": "US" }
  },
  "valid": true
}
```

**Error Responses**

| Status | Condition |
|---|---|
| `404` | `fastedge-config.test.json` does not exist |

---

### POST /api/config

Saves a test configuration object to `fastedge-config.test.json` in the project root. If the config contains a `properties` field, a WebSocket event is emitted to notify connected clients.

Accepts the `X-Source` header.

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
      method: string;
      url: string;
      headers: Record<string, string>;
      body: string;
    };
    response?: {
      headers: Record<string, string>;
      body: string;
    };
    properties: Record<string, unknown>; // Required
    dotenv?: {
      enabled?: boolean;
      path?: string;
    };
  };
};
```

**Response**

```typescript
type PostConfigResponse =
  | { ok: true }
  | { ok: false; error: string | object };
```

**Example**

```bash
curl -X POST http://localhost:5179/api/config \
  -H "Content-Type: application/json" \
  -H "X-Source: api" \
  -d '{
    "config": {
      "$schema": "http://localhost:5179/api/schema/fastedge-config.test",
      "wasm": { "path": "./.fastedge/bin/app.wasm" },
      "request": {
        "method": "GET",
        "url": "https://example.com/",
        "headers": {},
        "body": ""
      },
      "response": { "headers": {}, "body": "" },
      "properties": { "geo_country": "DE" }
    }
  }'
```

```json
{ "ok": true }
```

**Error Responses**

| Status | Condition |
|---|---|
| `400` | Schema validation failure |
| `500` | File write error |

---

### POST /api/config/save-as

Saves a test configuration object to an arbitrary file path. Creates intermediate directories if they do not exist. Appends `.json` if the path does not already end with it.

**Request Body**

```typescript
type SaveAsRequest = {
  config: object;    // Any valid config object
  filePath: string;  // Absolute or relative path (relative to server project root)
};
```

**Response**

```typescript
type SaveAsResponse =
  | {
      ok: true;
      savedPath: string; // The resolved absolute path where the file was written
    }
  | { ok: false; error: string };
```

**Example**

```bash
curl -X POST http://localhost:5179/api/config/save-as \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "request": {
        "method": "GET",
        "url": "https://example.com/",
        "headers": {},
        "body": ""
      },
      "properties": {}
    },
    "filePath": "configs/staging-test"
  }'
```

```json
{
  "ok": true,
  "savedPath": "/home/user/project/configs/staging-test.json"
}
```

**Error Responses**

| Status | Condition |
|---|---|
| `400` | `config` or `filePath` missing from request body |
| `500` | File system error |

---

## Schema

### GET /api/schema/:name

Serves a JSON Schema file by name. Use these schemas to validate request bodies or understand response shapes before making API calls.

**Path Parameter**

| Parameter | Description |
|---|---|
| `name` | Schema name without the `.schema.json` suffix |

**Response**

Returns the JSON Schema document with `Content-Type: application/json`.

**Available Schemas**

**Request Schemas** — validate bodies sent to the API:

| Name | Endpoint |
|---|---|
| `api-load` | `POST /api/load` |
| `api-send` | `POST /api/send` |
| `api-call` | `POST /api/call` |
| `api-config` | `POST /api/config` |

**Response / Type Schemas** — describe response shapes and shared types:

| Name | Description |
|---|---|
| `fastedge-config.test` | Shape of `fastedge-config.test.json` |
| `hook-result` | `HookResult` type returned by `/api/call` |
| `hook-call` | `HookCall` input type |
| `full-flow-result` | `FullFlowResult` type returned by `/api/send` and `/api/execute` (Proxy-WASM) |
| `http-request` | HTTP request shape for HTTP-WASM |
| `http-response` | HTTP response shape for HTTP-WASM |

**Example**

```bash
curl http://localhost:5179/api/schema/api-send
```

```bash
curl http://localhost:5179/api/schema/full-flow-result
```

**Error Responses**

| Status | Condition |
|---|---|
| `404` | Schema name not found |

---

## Error Handling

All error responses follow a consistent shape:

```typescript
type ErrorResponse = {
  ok: false;
  error: string | ZodFlattenedError;
};
```

Endpoints that use Zod schema validation (`/api/load`, `/api/call`, `/api/send`, `POST /api/config`) return a structured `ZodFlattenedError` object on validation failure:

```json
{
  "ok": false,
  "error": {
    "formErrors": [],
    "fieldErrors": {
      "url": ["Required"],
      "properties": ["Required"]
    }
  }
}
```

Endpoints that perform manual validation return a plain string in `error`.

**Common Status Codes**

| Status | Meaning |
|---|---|
| `400` | Invalid request body or a precondition not met (e.g. no WASM loaded) |
| `404` | Resource not found (config file, schema file) |
| `500` | Internal server error during execution |

---

## See Also

- [DEBUGGER.md](DEBUGGER.md) — server startup, environment variables, port configuration
- [WEBSOCKET.md](WEBSOCKET.md) — WebSocket protocol and broadcast event shapes
- [TEST_FRAMEWORK.md](TEST_FRAMEWORK.md) — test framework API for writing automated tests
- [RUNNER.md](RUNNER.md) — programmatic runner API
- [TEST_CONFIG.md](TEST_CONFIG.md) — `fastedge-config.test.json` format and fields
