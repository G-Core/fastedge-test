# REST API Reference

The `@gcoredev/fastedge-test` debugger server exposes a REST API for loading WASM modules, executing requests, and managing test configuration.

> **Note on header values.** Response-side and hook-result headers use `Record<string, string | string[]>`. Single-valued headers are a `string`. Multi-valued headers (notably `Set-Cookie` per RFC 6265) are a `string[]`. The HTTP-WASM `result.headers` field uses Node's `IncomingHttpHeaders` shape (`import type { IncomingHttpHeaders } from "node:http"`), which follows the same convention. Request-side header inputs are single-valued `Record<string, string>`.

## Base URL

```
http://localhost:5179
```

The server starts on port `5179`. If that port is in use, it tries the next ports in sequence (50 attempts in total). Set the `PORT` environment variable to change the starting port. The active port is written to `.fastedge-debug/.debug-port` (relative to `WORKSPACE_PATH` if set, otherwise the current working directory) on startup and deleted on shutdown. The file contains `PORT:SHA256_HASH`, where `PORT` is the decimal port number and `SHA256_HASH` is the hex-encoded SHA-256 of the session token. Consumers that only need the port should parse the prefix up to the first colon (e.g. `parseInt(content.split(":")[0], 10)`).

JSON request bodies are limited to 20 MB.

## Authentication

The debugger server requires a session token on all `/api/*` requests. `/health` is the only unauthenticated endpoint.

When started from the CLI (`npx fastedge-debug`), the server generates a random 32-byte hex token and prints the full browser URL to stderr:

```
Open: http://localhost:5179/#token=<hex>
```

The fragment after `#token=` is the session token. Use it for API calls and WebSocket connections.

**HTTP requests** — send the token as a header on every `/api/*` call:

```
x-fastedge-token: <token>
```

A missing or incorrect token returns `401`.

**WebSocket** — two mechanisms exist, tried in preference order:

1. **`Sec-WebSocket-Protocol: fastedge-token.<token>`** (preferred) — the token is embedded in the subprotocol list rather than the URL, keeping it out of proxy and server access logs. The server echoes the subprotocol back on accept.
2. **`?token=<token>` query parameter** (fallback) — for legacy or non-browser tooling that cannot set subprotocols on the WebSocket handshake. Avoid this form in new consumers: the token appears in server and proxy logs.

```javascript
const token = process.env.FASTEDGE_DEBUG_TOKEN;
const ws = new WebSocket("ws://127.0.0.1:5179/ws", [`fastedge-token.${token}`]);

ws.addEventListener("open", () => {
  console.log("connected, negotiated protocol:", ws.protocol);
  ws.close();
});
```

Fallback form:

```
ws://127.0.0.1:<port>/ws?token=<token>
```

All `/api/*` requests also validate the `Host` header. Requests whose `Host` is not a loopback name (or the host configured through `FASTEDGE_EXPECTED_HOST`) return `403` with `Invalid Host`.

**Environment variables related to authentication and binding:**

| Variable                 | Default         | Description                                                                              |
| ------------------------ | --------------- | ---------------------------------------------------------------------------------------- |
| `PORT`                   | `5179`          | Preferred starting port; the next 49 ports are tried if it is in use.                    |
| `FASTEDGE_DEBUG_TOKEN`   | unset           | Use a known session token instead of generating one; suppresses the `Open:` stderr line. |
| `FASTEDGE_BIND_HOST`     | `127.0.0.1`     | Interface the HTTP server binds to.                                                      |
| `FASTEDGE_EXPECTED_HOST` | unset           | Extra hostname (suffix match) allowed in `Host` / `Origin` headers.                      |
| `WORKSPACE_PATH`         | `process.cwd()` | Workspace root for .env resolution, the port file and the config file.                   |

---

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

Returns the server status and service identity. Does not require a token.

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

**Error Responses**

None.

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
curl -H "x-fastedge-token: <token>" http://localhost:5179/api/client-count
```

```json
{
  "count": 1
}
```

**Error Responses**

See [Error Handling](#error-handling) for `401` and `403` responses that apply to every `/api/*` endpoint.

---

## WASM Loading

### POST /api/load

Loads a WASM binary into the runner. Accepts either a file path or a base64-encoded binary. Automatically detects whether the module is HTTP-WASM or Proxy-WASM. Any previously loaded module is cleaned up first.

**Request Body**

Exactly one of `wasmPath` or `wasmBase64` must be provided. Providing neither, or both, returns `400`.

```typescript
{
  wasmPath?: string;    // Path to a .wasm file; must resolve inside the workspace root
                        // (WORKSPACE_PATH if set, otherwise the server's working directory)
  wasmBase64?: string;  // Base64-encoded WASM binary; mutually exclusive with wasmPath
  dotenv?: {
    enabled?: boolean;  // Whether to load .env files for this module (default: false)
    path?: string;      // Directory containing .env files. Relative paths resolve against the
                        // workspace root and must stay inside it. Defaults to the workspace root.
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
  resolvedPath?: string; // Normalized absolute path; present only when wasmPath was provided
}
```

**Example — load from path**

```bash
curl -X POST http://localhost:5179/api/load \
  -H "x-fastedge-token: <token>" \
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
  -H "x-fastedge-token: <token>" \
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
  -H "x-fastedge-token: <token>" \
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

| Status | Condition                                                                                           |
| ------ | --------------------------------------------------------------------------------------------------- |
| `400`  | Body failed validation (neither or both of `wasmPath` and `wasmBase64`, or `httpPort` out of range) |
| `400`  | `wasmPath` is invalid, does not exist, is outside the workspace root, or does not end in `.wasm`    |
| `400`  | `dotenv.path` resolves outside the workspace root or contains a symlink that escapes it             |
| `500`  | WASM load or runner initialization failed, including `httpPort` already in use                      |

If a load fails with `500`, the previously loaded module is discarded and no module is loaded.

---

### PATCH /api/dotenv

Applies updated dotenv settings to the currently loaded WASM module without reloading the binary. For Proxy-WASM, this resets stores and reloads dotenv files in-place. For HTTP-WASM, this restarts the underlying process with updated flags.

Requires a WASM module to already be loaded via `POST /api/load`.

**Request Body**

```typescript
{
  dotenv: {
    enabled: boolean; // Whether dotenv loading should be enabled
    path?: string;    // Directory containing .env files. Relative paths resolve against the
                      // workspace root and must stay inside it. Defaults to the workspace root.
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
  -H "x-fastedge-token: <token>" \
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

| Status | Condition                                                                         |
| ------ | --------------------------------------------------------------------------------- |
| `400`  | Body failed validation (`dotenv.enabled` missing or not a boolean)                |
| `400`  | No WASM module is loaded                                                          |
| `400`  | `dotenv.path` resolves outside the workspace root or contains an escaping symlink |
| `500`  | Failed to apply dotenv settings                                                   |

---

## Test Execution

### POST /api/execute

Executes a request through the loaded WASM module. Behavior differs based on the detected runner type. This endpoint does not use schema validation — fields are read directly from the request body.

Requires a WASM module to be loaded via `POST /api/load`. Accepts an optional [`X-Source`](#x-source-header) request header.

**Request Body**

The server destructures `{ url, path, method, headers, body }` from the top level of the body. For Proxy-WASM it additionally reads `{ request, properties }`. Fields that do not apply to the loaded runner type are ignored.

```typescript
{
  // HTTP-WASM
  path?: string;                     // Request path and query string (preferred)
  method?: string;                   // HTTP method (default: "GET")
  headers?: Record<string, string>;  // Request headers (default: {})
  body?: string;                     // Request body (default: "")

  // Both runner types
  url?: string;                      // HTTP-WASM: absolute URL, pathname and query are extracted
                                     //   (legacy fallback when `path` is absent).
                                     // Proxy-WASM: request URL, or "built-in" (required).

  // Proxy-WASM
  request?: {
    method?: string;                 // HTTP method (default: "GET")
    headers?: Record<string, string>; // Request headers (default: {})
    body?: string;                   // Request body (default: "")
  };
  properties?: Record<string, unknown>; // CDN properties (default: {})
}
```

| Field        | HTTP-WASM                   | Proxy-WASM                      |
| ------------ | --------------------------- | ------------------------------- |
| `path`       | Used (preferred over `url`) | Ignored                         |
| `url`        | Used if `path` is absent    | Required                        |
| `method`     | Used                        | Ignored (use `request.method`)  |
| `headers`    | Used                        | Ignored (use `request.headers`) |
| `body`       | Used                        | Ignored (use `request.body`)    |
| `request`    | Ignored                     | Used                            |
| `properties` | Ignored                     | Used                            |

For HTTP-WASM, when `path` is given it is used directly as the request path (e.g. `/api/hello?q=1`). When only `url` is given, the path and query string are extracted from it.

For Proxy-WASM, the upstream response is generated at runtime — either by a real fetch against `url`, or by the built-in responder when `url === "built-in"`.

**Response — HTTP-WASM**

```typescript
{
  ok: true;
  result: {
    status: number;
    statusText: string;
    headers: IncomingHttpHeaders;
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
    headers: Record<string, string | string[]>;
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
  logs: { level: number; message: string }[];
  input: {
    request: { headers: Record<string, string | string[]>; body: string };
    response: { headers: Record<string, string | string[]>; body: string };
    properties?: Record<string, unknown>;
  };
  output: {
    request: { headers: Record<string, string | string[]>; body: string };
    response: { headers: Record<string, string | string[]>; body: string };
    properties?: Record<string, unknown>;
  };
  properties: Record<string, unknown>;
};
```

`hookResults` is keyed by hook name (e.g. `"onRequestHeaders"`, `"onResponseHeaders"`). `calculatedProperties` contains the request-derived properties computed for the flow, using these keys: `request.url`, `request.host`, `request.path`, `request.query`, `request.scheme`, `request.extension`, `request.method`. `request.path` includes the query string; `request.query` is the query portion without the leading `?`.

**Example — HTTP-WASM**

```bash
curl -X POST http://localhost:5179/api/execute \
  -H "x-fastedge-token: <token>" \
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
  -H "x-fastedge-token: <token>" \
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

| Status | Condition                                                        |
| ------ | ---------------------------------------------------------------- |
| `400`  | No WASM module is loaded                                         |
| `400`  | HTTP-WASM: `path`/`url` missing, or `url` is not an absolute URL |
| `400`  | Proxy-WASM: `url` missing or not a string                        |
| `500`  | Execution failed                                                 |

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
  properties?: Record<string, unknown>; // Defaults to {} when omitted
}
```

`request` and `response` default to `{ headers: {}, body: "" }` if omitted. The published `api-call` JSON schema lists `properties` as required; the server accepts a body without it and uses `{}`.

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
  logs: { level: number; message: string }[];
  input: {
    request: { headers: Record<string, string | string[]>; body: string };
    response: { headers: Record<string, string | string[]>; body: string };
    properties?: Record<string, unknown>;
  };
  output: {
    request: { headers: Record<string, string | string[]>; body: string };
    response: { headers: Record<string, string | string[]>; body: string };
    properties?: Record<string, unknown>;
  };
  properties: Record<string, unknown>;
};
```

**Example**

```bash
curl -X POST http://localhost:5179/api/call \
  -H "x-fastedge-token: <token>" \
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

| Status | Condition                                                                  |
| ------ | -------------------------------------------------------------------------- |
| `400`  | Body failed validation (invalid `hook`, malformed `request` or `response`) |
| `400`  | No WASM module is loaded                                                   |
| `500`  | Hook execution failed, including calling a hook on an HTTP-WASM module     |

---

### POST /api/send

Executes the full Proxy-WASM CDN request/response flow. Equivalent to `POST /api/execute` for Proxy-WASM, but validates the request body against a schema. Only valid for Proxy-WASM modules.

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
  properties?: Record<string, unknown>; // CDN properties; defaults to {} when omitted
}
```

The upstream response is generated at runtime — either by a real fetch against `url`, or by the built-in responder when `url === "built-in"`. The published `api-send` JSON schema lists `properties` as required; the server accepts a body without it and uses `{}`.

**Response**

```typescript
{
  ok: true;
  hookResults: Record<string, HookResult>;
  finalResponse: {
    status: number;
    statusText: string;
    headers: Record<string, string | string[]>;
    body: string;
    contentType: string;
    isBase64?: boolean;
  };
  calculatedProperties?: Record<string, unknown>;
}
```

`HookResult` has the same shape as documented in [`POST /api/call`](#post-apicall). `hookResults` is keyed by hook name. `calculatedProperties` uses the same `request.*` keys listed under [`POST /api/execute`](#post-apiexecute).

**Example**

```bash
curl -X POST http://localhost:5179/api/send \
  -H "x-fastedge-token: <token>" \
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
| `400`  | Body failed validation (`url` missing or neither `built-in` nor a valid URL) |
| `400`  | No WASM module is loaded                                                     |
| `500`  | Execution failed, including use against an HTTP-WASM module                  |

---

## Configuration

### GET /api/config

Reads `fastedge-config.test.json` from the `.fastedge-debug/` directory (relative to `WORKSPACE_PATH` if set, otherwise the current working directory) and returns it along with a validation result. A relative `dotenv.path` in the file is returned as an absolute path resolved against the config file's directory.

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

`config` is returned as stored, even when `valid` is `false`. `TestConfig` is a discriminated union on `appType`:

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
curl -H "x-fastedge-token: <token>" http://localhost:5179/api/config
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

| Status | Condition                                                  |
| ------ | ---------------------------------------------------------- |
| `404`  | `fastedge-config.test.json` is missing or cannot be parsed |

---

### POST /api/config

Saves the provided configuration to `.fastedge-debug/fastedge-config.test.json` (relative to `WORKSPACE_PATH` if set, otherwise the current working directory). The directory is created if it does not exist. If the config includes a `properties` field, a WebSocket event is broadcast to connected clients.

Accepts an optional [`X-Source`](#x-source-header) request header.

**Request Body**

```typescript
{
  config: TestConfig; // See GET /api/config for the TestConfig type
}
```

The `config` object must match one of the two `TestConfig` variants. `appType` defaults to `"proxy-wasm"` when omitted. `request` is required and its shape depends on `appType` (`path` for `"http-wasm"`, `url` for `"proxy-wasm"`).

**Response**

```typescript
{
  ok: true;
}
```

**Example**

```bash
curl -X POST http://localhost:5179/api/config \
  -H "x-fastedge-token: <token>" \
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

| Status | Condition                                                                    |
| ------ | ---------------------------------------------------------------------------- |
| `400`  | Body failed validation (`config` does not match either `TestConfig` variant) |
| `500`  | File write failed                                                            |

---

### POST /api/config/save-as

Saves the provided configuration to a file path previously approved by the host application's save dialog. Paths are single-use: each approved path is removed once consumed. Creates intermediate directories as needed.

Approved paths are only issued when the server runs inside a host application that provides a save dialog (Electron). In a plain Node.js or CLI session no path is ever approved, so every request to this endpoint with a valid body returns `403`. Use `POST /api/config` to save configuration programmatically.

**Request Body**

```typescript
{
  config: TestConfig; // The configuration to serialize as JSON; same shape as POST /api/config
  filePath: string;   // A path previously approved by the save dialog
}
```

**Response**

```typescript
{
  ok: true;
  savedPath: string; // The file path where the config was written
}
```

**Example**

```bash
curl -X POST http://localhost:5179/api/config/save-as \
  -H "x-fastedge-token: <token>" \
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
    "filePath": "/home/user/project/configs/staging.test.json"
  }'
```

```json
{
  "ok": true,
  "savedPath": "/home/user/project/configs/staging.test.json"
}
```

**Error Responses**

| Status | Condition                                                                  |
| ------ | -------------------------------------------------------------------------- |
| `400`  | Body failed validation (`config` invalid or `filePath` missing)           |
| `403`  | `filePath` was not approved by the host's save dialog, or was already used |
| `500`  | File write or directory creation failed                                    |

---

## Schema

### GET /api/schema/:name

Serves a JSON Schema file by name. Use these schemas for request validation in test tooling or editor integrations.

The `:name` parameter is the schema name without the `.schema.json` suffix.

**Response**

Returns the JSON Schema document with `Content-Type: application/json`.

**Available Schemas**

#### Request Schemas

| Name         | Description                         |
| ------------ | ----------------------------------- |
| `api-load`   | Request body for `POST /api/load`   |
| `api-send`   | Request body for `POST /api/send`   |
| `api-call`   | Request body for `POST /api/call`   |
| `api-config` | Request body for `POST /api/config` |

#### Response / Type Schemas

| Name                   | Description                                                   |
| ---------------------- | ------------------------------------------------------------- |
| `fastedge-config.test` | Config file format for `fastedge-config.test.json`            |
| `hook-result`          | Shape of a single `HookResult`                                |
| `hook-call`            | Shape of a `HookCall` input                                   |
| `full-flow-result`     | Shape of the `FullFlowResult` returned by full-flow endpoints |
| `http-request`         | Shape of an `HttpRequest` for HTTP-WASM execution             |
| `http-response`        | Shape of an `HttpResponse` returned by HTTP-WASM execution    |

**Example**

```bash
curl -H "x-fastedge-token: <token>" http://localhost:5179/api/schema/api-send
```

```bash
curl -H "x-fastedge-token: <token>" http://localhost:5179/api/schema/fastedge-config.test
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

Error responses follow a consistent shape:

```typescript
{
  ok: false;
  error: string | { formErrors: string[]; fieldErrors: Record<string, string[]> };
}
```

When a request body fails schema validation, `error` is the flattened validation error object with `formErrors` and `fieldErrors`. For runtime errors, `error` is a plain string.

**Common status codes**

| Status | Meaning                                                                                            |
| ------ | -------------------------------------------------------------------------------------------------- |
| `400`  | Invalid request body, missing required fields, or unmet precondition (for example, no WASM loaded) |
| `401`  | Missing or invalid `x-fastedge-token` header on an `/api/*` request                                |
| `403`  | `Host` header not allowed, or a save-as path not approved by the save dialog                       |
| `404`  | Resource not found (config file, schema file)                                                      |
| `500`  | Internal error during execution or I/O                                                             |

---

## See Also

- [WEBSOCKET.md](./WEBSOCKET.md) — WebSocket protocol and event types
- [DEBUGGER.md](./DEBUGGER.md) — Server startup, configuration, and environment variables
- [TEST_FRAMEWORK.md](./TEST_FRAMEWORK.md) — Programmatic test framework API
- [RUNNER.md](./RUNNER.md) — Runner API and WASM type detection
