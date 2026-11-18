# REST API Reference

The `@gcoredev/fastedge-test` debugger server exposes a REST API for loading WASM modules, executing requests, managing local stores and test configuration.

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

A missing or incorrect token returns `401`. The `?token=` query parameter is not accepted on HTTP requests.

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

The `POST /api/load`, `POST /api/resource/load`, `POST /api/resource/save`, `POST /api/execute`, `POST /api/send`, and `POST /api/config` endpoints accept an optional `X-Source` request header that tags the origin of the operation in WebSocket broadcast events.

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

Loads a WASM binary into the runner. Accepts either a file path or a base64-encoded binary. Automatically detects whether the module is HTTP-WASM or Proxy-WASM. Any previously loaded module or resource is cleaned up first.

Loads (`POST /api/load` and `POST /api/resource/load`) are processed one at a time, in the order they arrive, so an older load cannot finish last and replace a newer one. Other requests are not queued.

Accepts an optional [`X-Source`](#x-source-header) request header.

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
  stores?: boolean;     // Set to false to run without the storage service (default: enabled).
                        // If the service cannot start, the module loads with stores off.
  dc?: string;          // Datacenter name used for store operations (non-empty).
                        // Falls back to the datacenter from `edge`, then "local".
  client?: ClientContext; // Simulated client attributes
  edge?: EdgeContext;     // Simulated edge point-of-presence attributes
}
```

`client` and `edge` define the request context for the loaded module. Both types are defined here and are shared by `POST /api/execute`, `POST /api/call`, `POST /api/send`, and the test configuration file.

```typescript
type ContextPreset = "de" | "nl" | "us";

type ClientContext = {
  preset?: ContextPreset; // Predefined set of client values
  ip?: string;
  asn?: string;
  country?: string;
  countryName?: string;
  city?: string;
  region?: string;
  continent?: string;
  lat?: string;
  long?: string;
};

type EdgeContext = {
  preset?: ContextPreset; // Predefined set of edge values
  dc?: string;
  region?: string;
  country?: string;
  city?: string;
  hostname?: string;
  popLat?: string;
  popLong?: string;
  popReg?: string;
  popCity?: string;
  popContinent?: string;
  popCountryCode?: string;
  popCountryName?: string;
};
```

Unknown fields in `client` or `edge` are rejected with `400`.

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

**Example — set the client and edge context**

```bash
curl -X POST http://localhost:5179/api/load \
  -H "x-fastedge-token: <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "wasmPath": "/home/user/project/build/module.wasm",
    "client": { "preset": "de" },
    "edge": { "preset": "nl" }
  }'
```

```json
{
  "ok": true,
  "wasmType": "proxy-wasm",
  "resolvedPath": "/home/user/project/build/module.wasm"
}
```

**Error Responses**

| Status | Condition                                                                                           |
| ------ | --------------------------------------------------------------------------------------------------- |
| `400`  | Body failed validation (neither or both of `wasmPath` and `wasmBase64`, or `httpPort` out of range) |
| `400`  | Body failed validation (`dc` empty, or `client` or `edge` has an unknown field or `preset`)         |
| `400`  | `wasmPath` is invalid, does not exist, is outside the workspace root, or does not end in `.wasm`    |
| `400`  | `dotenv.path` resolves outside the workspace root or contains a symlink that escapes it             |
| `500`  | WASM load or runner initialization failed, including `httpPort` already in use                      |

If a load fails with `500`, the previously loaded module is discarded and no module is loaded.

---

### POST /api/resource/load

Loads a resource: several apps, one per hook, as on a CDN resource. Replaces any loaded module or resource. Once a resource is loaded, [`POST /api/send`](#post-apisend) runs it.

Every file the resource reads must be inside the workspace root (`WORKSPACE_PATH` if set, otherwise the server's working directory), so a resource that spans several projects is debugged from a folder that holds them all.

Accepts an optional [`X-Source`](#x-source-header) request header.

**Request Body**

```typescript
{
  configPath?: string;                // Path to a resource config file. Relative paths resolve
                                      // against the workspace root.
  config?: Record<string, unknown>;   // Inline resource config; paths inside it resolve against
                                      // the workspace root.
}
```

Provide `configPath` or `config`, not both: giving both returns `400`. If neither is given, the default file `.fastedge-debug/fastedge-cdn-resource.test.json` in the workspace root is loaded.

**Response**

```typescript
{
  ok: true;
  apps: { name: string; wasmType: "http-wasm" | "proxy-wasm" }[]; // The apps in the resource
  config: Record<string, unknown>;                                // The resolved resource config
}
```

The resolved `config` can include `stores` (set to `false` to run without the storage service), `dc`, and `edge`, which behave as described for [`POST /api/load`](#post-apiload).

**Example**

```bash
curl -X POST http://localhost:5179/api/resource/load \
  -H "x-fastedge-token: <token>" \
  -H "Content-Type: application/json" \
  -d '{ "configPath": "resources/main.resource.json" }'
```

```json
{
  "ok": true,
  "apps": [
    { "name": "auth", "wasmType": "proxy-wasm" },
    { "name": "origin", "wasmType": "http-wasm" }
  ],
  "config": {}
}
```

**Error Responses**

| Status | Condition                                                                                    |
| ------ | -------------------------------------------------------------------------------------------- |
| `400`  | Body failed validation (both `configPath` and `config` given, or either of the wrong type)   |
| `400`  | The resource config is invalid, a referenced path is outside the workspace, or a build fails |

The previously loaded module or resource is discarded before the new one is created, so a failed load leaves nothing loaded. While a resource is loaded, `POST /api/execute`, `POST /api/call`, and `PATCH /api/dotenv` return `400` (no WASM module loaded).

---

### GET /api/resource/config

Reads a resource file as written, without defaults filled in. Returns `config: null` when the file does not exist yet.

**Query Parameters**

| Parameter | Type     | Default                                                | Description                                                                           |
| --------- | -------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `path`    | `string` | `.fastedge-debug/fastedge-cdn-resource.test.json`      | Resource file, relative to the workspace root. Must end in `.json` and be inside the workspace. |

**Response**

```typescript
{
  ok: true;
  path: string;                           // Absolute path of the file
  config: Record<string, unknown> | null; // null when the file does not exist
  version: string | null;                 // Content version (hash); null when there is no file
}
```

**Example**

```bash
curl -H "x-fastedge-token: <token>" \
  "http://localhost:5179/api/resource/config?path=resources/main.resource.json"
```

**Error Responses**

| Status | Condition                                                                         |
| ------ | --------------------------------------------------------------------------------- |
| `400`  | `path` does not end in `.json`, is outside the workspace, or the file is not JSON |

---

### POST /api/resource/save

Writes a resource file after checking it against the resource schema. Does not load it; call [`POST /api/resource/load`](#post-apiresourceload) afterwards. The file is written as given, so schema defaults stay out of it. Missing directories are created.

Accepts an optional [`X-Source`](#x-source-header) request header.

**Request Body**

```typescript
{
  config: Record<string, unknown>; // The resource config to write
  configPath?: string;             // Resource file, relative to the workspace root
                                   // (default: .fastedge-debug/fastedge-cdn-resource.test.json)
  expectedVersion?: string | null; // The `version` the caller last read; null = the file did not exist
  force?: boolean;                 // Write even when the file changed since `expectedVersion`
}
```

When `expectedVersion` is given and `force` is not set, the save is refused if the file's current version differs.

**Response**

```typescript
{
  ok: true;
  path: string;    // Absolute path written
  version: string; // Content version of the new file
}
```

**Example**

```bash
curl -X POST http://localhost:5179/api/resource/save \
  -H "x-fastedge-token: <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "configPath": "resources/main.resource.json",
    "expectedVersion": null,
    "config": { "main": {} }
  }'
```

**Error Responses**

| Status | Condition                                                                                                  |
| ------ | ---------------------------------------------------------------------------------------------------------- |
| `400`  | Body failed validation, the path does not end in `.json` or is outside the workspace, or it is a symlink   |
| `409`  | The file changed since `expectedVersion`. The body is `{ ok: false, conflict: true, version, error }`.     |

---

### GET /api/workspace/files

Lists workspace paths that can be offered as suggestions for path fields: `.wasm` files, `*.test.json` files and folders with `.env` files.

**Response**

```typescript
{
  ok: true;
  root: string;         // Workspace root
  [list: string]: unknown; // Lists of matching workspace paths, grouped by kind
}
```

**Example**

```bash
curl -H "x-fastedge-token: <token>" http://localhost:5179/api/workspace/files
```

**Error Responses**

See [Error Handling](#error-handling) for `401` and `403` responses that apply to every `/api/*` endpoint.

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

### Request context on execution endpoints

`POST /api/execute`, `POST /api/call`, and `POST /api/send` accept optional `client` and `edge` fields (see [`ClientContext` and `EdgeContext`](#post-apiload)). If the body names either field, they apply to that request only; a field that is left out means none for that request. If the body names neither field, the context set at load time applies. Requests never change the loaded context, and the store datacenter chosen at load time does not change.

When a resource is loaded, `POST /api/send` does not read `client` or `edge`; the resource uses the context from its own config.

---

### GET /api/request-context/presets

Returns the `client` and `edge` preset values (`de`, `nl`, `us`), as the Request Context panel shows them.

**Response**

```typescript
{
  ok: true;
  client: Record<ContextPreset, ClientContext>;
  edge: Record<ContextPreset, EdgeContext>;
}
```

**Example**

```bash
curl -H "x-fastedge-token: <token>" http://localhost:5179/api/request-context/presets
```

```json
{
  "ok": true,
  "client": { "de": { "ip": "192.0.2.10", "asn": "62240", "country": "DE", "countryName": "Germany", "city": "Frankfurt am Main", "region": "HE", "continent": "EU", "lat": "50.09710", "long": "8.59520" }, "nl": { }, "us": { } },
  "edge": { "de": { "dc": "fr5", "region": "eu", "country": "Germany", "city": "Frankfurt am Main", "hostname": "fr5-hw-edge-gpig-gc23", "popLat": "50.1049", "popLong": "8.6295", "popReg": "HE", "popCity": "Frankfurt am Main", "popContinent": "EU", "popCountryCode": "DE", "popCountryName": "Germany" }, "nl": { }, "us": { } }
}
```

**Error Responses**

See [Error Handling](#error-handling) for `401` and `403` responses that apply to every `/api/*` endpoint.

---

### POST /api/execute

Executes a request through the loaded WASM module. Behavior differs based on the detected runner type. The request fields are read directly from the request body; only `client` and `edge` are schema-validated.

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
  client?: ClientContext;            // See "Request context on execution endpoints"
  edge?: EdgeContext;                // See "Request context on execution endpoints"

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
| `client`     | Used                        | Used                            |
| `edge`       | Used                        | Used                            |

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
    storeCalls?: unknown[]; // Store operations made during the request, when stores are enabled
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
| `400`  | `client` or `edge` failed validation (unknown field or `preset`) |
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
  client?: ClientContext;               // See "Request context on execution endpoints"
  edge?: EdgeContext;                   // See "Request context on execution endpoints"
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
| `400`  | Body failed validation (invalid `client` or `edge`)                        |
| `400`  | No WASM module is loaded                                                   |
| `500`  | Hook execution failed, including calling a hook on an HTTP-WASM module     |

---

### POST /api/send

Executes the full Proxy-WASM CDN request/response flow. Equivalent to `POST /api/execute` for Proxy-WASM, but validates the request body against a schema. Only valid for Proxy-WASM modules.

If a resource is loaded through [`POST /api/resource/load`](#post-apiresourceload), the request runs through the resource instead and the response has the **Response — resource** shape below.

Requires a WASM module or resource to be loaded. Accepts an optional [`X-Source`](#x-source-header) request header.

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
  origin?: Origin;                      // Origin for this request only; not allowed when a resource is loaded
  client?: ClientContext;               // See "Request context on execution endpoints"
  edge?: EdgeContext;                   // See "Request context on execution endpoints"
}
```

The upstream response is generated at runtime — either by a real fetch against `url`, or by the built-in responder when `url === "built-in"`. The `origin` field replaces that source for the request:

```typescript
type Origin =
  | { url: string }                  // Fetch the response from this URL
  | {
      builtIn: {
        status?: number;             // Integer 100–599
        headers?: Record<string, string>;
        body?: string;
        bodyFile?: string;           // File whose content is the body (non-empty path)
        files?: string;              // Folder served by the built-in responder (non-empty path)
      };
    };
```

Files named in `origin` resolve against the workspace root and must stay inside it. The published `api-send` JSON schema lists `properties` as required; the server accepts a body without it and uses `{}`.

**Response — single module**

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

**Response — resource**

```typescript
type HeaderRecord = Record<string, string | string[]>;

type StoreCall = {
  app: "cdn" | "http";
  hook?: string;
  kind: "cache" | "kv";
  op: string;
  dc?: string;      // Cache bucket (cache calls)
  store?: string;   // Edge KV store (KV calls)
  key?: string;
  pattern?: string;
  prefix?: string;
  result: string;   // "ok", or the service's error (e.g. "wrong-type", "invalid-pattern")
  value?: string;   // A count, a flag, or the size of a value or list
  at: number;       // Wall-clock time (ms since epoch)
};

type ResourceHookResult = HookResult & {
  storeCalls?: StoreCall[]; // Cache / Edge KV calls the hook made, in order (stores on only)
  localResponse?: {         // Set when the hook answered with send_http_response
    statusCode: number;
    statusText: string;
    headers: [string, string][];
    bodyBase64: string;
  };
  customProperties?: string[]; // Custom properties later hooks of this request may read
};

type ResourceHook = { app: string; result: ResourceHookResult };

{
  ok: true;
  rule: { index: number; name?: string; match: string } | null; // The rule that matched, or null for main
  hooks: {
    onRequestHeaders?: ResourceHook;
    onRequestBody?: ResourceHook;
    onResponseHeaders?: ResourceHook;
    onResponseBody?: ResourceHook;
  };                                                            // Each hook that ran, with the app that ran it
  origin?: {                                                    // Absent when a request hook sent the response
    kind: "url" | "built-in" | "app";
    app?: string;
    response: {
      status: number;
      statusText: string;
      headers: HeaderRecord;
      body: string;
      contentType: string;
      isBase64: boolean;
    };
    storeCalls?: StoreCall[];
  };
  finalResponse: {
    status: number;
    statusText: string;
    headers: HeaderRecord;
    body: string;
    contentType: string;
    isBase64?: boolean;
  };
}
```

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

| Status | Condition                                                                                          |
| ------ | -------------------------------------------------------------------------------------------------- |
| `400`  | Body failed validation (`url` missing or neither `built-in` nor a valid URL)                       |
| `400`  | Body failed validation (invalid `client`, `edge` or `origin`)                                      |
| `400`  | `origin` is given while a resource is loaded (a resource sets its origins in its file)             |
| `400`  | `origin` names a file outside the workspace root                                                   |
| `400`  | No WASM module or resource is loaded                                                               |
| `500`  | Execution failed, including use against an HTTP-WASM module                                        |

---

## Stores

The storage service backs the cache and Edge KV APIs of the loaded module or resource. These endpoints inspect and control it for the loaded app. When nothing is loaded, the module was loaded with `stores: false`, or the service could not start, `GET /api/stores` reports `enabled: false`. `GET /api/stores/value`, `POST /api/stores/reset`, `POST /api/stores/advance-clock`, and `POST /api/stores/clock` return `409` in those cases. To browse and edit the stores without an app loaded, use the [Storage Explorer](#storage-explorer) endpoints.

### GET /api/stores

Returns a snapshot of the cache for one datacenter and of Edge KV.

**Query Parameters**

| Parameter | Type     | Default                 | Description                  |
| --------- | -------- | ----------------------- | ---------------------------- |
| `dc`      | `string` | Loaded app's datacenter | Cache datacenter to inspect. |

**Response**

```typescript
// Stores enabled
{
  ok: true;
  enabled: true;
  appDc: string; // Datacenter of the currently loaded app
  [key: string]: unknown; // Snapshot contents: cache entries for `dc` and Edge KV
}

// Stores off
{
  ok: true;
  enabled: false;
}
```

**Example**

```bash
curl -H "x-fastedge-token: <token>" "http://localhost:5179/api/stores?dc=local"
```

**Error Responses**

| Status | Condition                             |
| ------ | ------------------------------------- |
| `500`  | The storage service returned an error |

---

### GET /api/stores/value

Returns one stored value, from the cache (`dc` and `key`) or from Edge KV (`store` and `key`).

**Query Parameters**

| Parameter | Type     | Description                                                            |
| --------- | -------- | ---------------------------------------------------------------------- |
| `key`     | `string` | Key to read. Required.                                                 |
| `dc`      | `string` | Cache datacenter holding the key. Give exactly one of `dc` or `store`. |
| `store`   | `string` | Edge KV store holding the key. Give exactly one of `dc` or `store`.    |

**Response**

```typescript
{
  ok: true;
  value: unknown; // null if the key no longer exists
}
```

**Example**

```bash
curl -H "x-fastedge-token: <token>" "http://localhost:5179/api/stores/value?dc=local&key=session-1"
```

```json
{
  "ok": true,
  "value": null
}
```

**Error Responses**

| Status | Condition                                                         |
| ------ | ----------------------------------------------------------------- |
| `400`  | `key` is missing, or not exactly one of `dc` and `store` is given |
| `409`  | No app with stores is loaded                                      |
| `500`  | The storage service returned an error                             |

---

### POST /api/stores/reset

Returns the stores to their fixtures: the cache is emptied for every datacenter and Edge KV is re-seeded.

**Response**

```typescript
{
  ok: true;
}
```

**Example**

```bash
curl -X POST -H "x-fastedge-token: <token>" http://localhost:5179/api/stores/reset
```

```json
{
  "ok": true
}
```

**Error Responses**

| Status | Condition                             |
| ------ | ------------------------------------- |
| `409`  | No app with stores is loaded          |
| `500`  | The storage service returned an error |

---

### POST /api/stores/advance-clock

Moves the storage service clock forward, so cache entries expire without waiting.

**Request Body**

```typescript
{
  ms: number; // Milliseconds to advance; a finite number greater than 0
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
curl -X POST http://localhost:5179/api/stores/advance-clock \
  -H "x-fastedge-token: <token>" \
  -H "Content-Type: application/json" \
  -d '{ "ms": 60000 }'
```

```json
{
  "ok": true
}
```

**Error Responses**

| Status | Condition                                            |
| ------ | ---------------------------------------------------- |
| `400`  | `ms` is missing, not a number, or not greater than 0 |
| `409`  | No app with stores is loaded                         |
| `500`  | The storage service returned an error                |

---

### POST /api/stores/clock

Pauses or resumes the storage service clock. While the clock is paused, cache entries do not expire on their own; [`POST /api/stores/advance-clock`](#post-apistoresadvance-clock) still moves it.

**Request Body**

```typescript
{
  paused: boolean; // true pauses the clock, false resumes it
}
```

**Response**

```typescript
{
  ok: true;
  paused: unknown; // The clock state reported by the storage service
}
```

**Example**

```bash
curl -X POST http://localhost:5179/api/stores/clock \
  -H "x-fastedge-token: <token>" \
  -H "Content-Type: application/json" \
  -d '{ "paused": true }'
```

**Error Responses**

| Status | Condition                             |
| ------ | ------------------------------------- |
| `400`  | `paused` is missing or not a boolean  |
| `409`  | No app with stores is loaded          |
| `500`  | The storage service returned an error |

---

## Storage Explorer

The `/api/storage/*` endpoints browse and edit the local cache and Edge KV with or without an app loaded; the server starts the storage service when it is needed. Edits live in the service until it restarts or is reset, and both reload the fixtures. [Save to fixtures](#post-apistoragefixturessave) keeps Edge KV edits by writing them to fixture files. Cache edits are not saved to fixtures. Apps read Edge KV but never write it.

Every endpoint answers `{ ok: true, ...result }` on success and `{ ok: false, error }` on failure. Values use the fixture format, and the explorer only stores what a fixture can hold (for example, an Edge KV value cannot be empty).

```typescript
type StoredValue = string | { base64: string }; // UTF-8 text, or base64 for binary
type StoreName = string; // Letters, digits, ".", "_" and "-"; not starting with "." "_" or "-"; at most 128 characters
```

Store names are also fixture file names (`fixtures/stores/kv/<store>.json`).

**Error Responses (all `/api/storage/*` endpoints)**

| Status | Condition                                                                         |
| ------ | --------------------------------------------------------------------------------- |
| `400`  | Body or query failed validation, or the value is not valid fixture data           |
| `409`  | The running storage service is older than this debugger and refuses the operation |
| `409`  | Save to fixtures: a file changed since the diff, or was not in it                 |
| `500`  | The storage service returned an error                                             |
| `503`  | The storage service is not available                                              |

Each endpoint below lists only the errors specific to it.

---

### GET /api/storage

Returns a snapshot of the cache for one datacenter and of every Edge KV store. The snapshot holds sizes, not values.

**Query Parameters**

| Parameter | Type     | Default | Description                  |
| --------- | -------- | ------- | ---------------------------- |
| `dc`      | `string` | `local` | Cache datacenter to inspect. |

**Response**

```typescript
{
  ok: true;
  now: number;  // Service clock time
  dc: string;   // The datacenter the cache entries belong to
  dcs: string[]; // Datacenters that hold cache entries
  cache: { key: string; size: number; expiresAt: number | null }[];
  kv: { store: string; strings: unknown; zsets: unknown; bloom: unknown }[];
}
```

**Example**

```bash
curl -H "x-fastedge-token: <token>" "http://localhost:5179/api/storage?dc=local"
```

---

### GET /api/storage/value

Returns one stored value, from the cache (`dc` and `key`) or from Edge KV (`store` and `key`).

**Query Parameters**

| Parameter | Type     | Description                                                            |
| --------- | -------- | ---------------------------------------------------------------------- |
| `key`     | `string` | Key to read. Required.                                                 |
| `dc`      | `string` | Cache datacenter holding the key. Give exactly one of `dc` or `store`. |
| `store`   | `string` | Edge KV store holding the key. Give exactly one of `dc` or `store`.    |

**Response**

```typescript
{
  ok: true;
  value:
    | { type: "string"; size: number; value: string; truncated: boolean; expiresAt?: number } // value is base64; first 4 KB
    | { type: "zset"; count: number; members: { value: string; score: number }[] }            // first 200 members
    | { type: "bloom"; count: number; items: string[] }                                       // first 200 items
    | null; // The key no longer exists
}
```

**Example**

```bash
curl -H "x-fastedge-token: <token>" "http://localhost:5179/api/storage/value?store=users&key=alice"
```

**Endpoint-specific errors:** `400` when `key` is missing or not exactly one of `dc` and `store` is given.

---

### POST /api/storage/kv/put

Replaces one Edge KV key, whatever its current type, and creates the store if it does not exist.

**Request Body**

```typescript
type KvPutBody =
  | { store: StoreName; key: string; type: "string"; value: StoredValue }
  | { store: StoreName; key: string; type: "zset"; members: [StoredValue, number][] } // [member, score]
  | { store: StoreName; key: string; type: "bloom"; items: string[] };
```

`key` must be non-empty.

**Response**

```typescript
{ ok: true }
```

**Example**

```bash
curl -X POST http://localhost:5179/api/storage/kv/put \
  -H "x-fastedge-token: <token>" \
  -H "Content-Type: application/json" \
  -d '{ "store": "users", "key": "alice", "type": "string", "value": "{\"plan\":\"pro\"}" }'
```

---

### POST /api/storage/kv/delete

Deletes one Edge KV key.

**Request Body**

```typescript
{ store: StoreName; key: string }
```

**Response**

```typescript
{ ok: true }
```

**Example**

```bash
curl -X POST http://localhost:5179/api/storage/kv/delete \
  -H "x-fastedge-token: <token>" \
  -H "Content-Type: application/json" \
  -d '{ "store": "users", "key": "alice" }'
```

---

### POST /api/storage/kv/store

Creates an empty Edge KV store.

**Request Body**

```typescript
{ store: StoreName }
```

**Response**

```typescript
{ ok: true }
```

**Example**

```bash
curl -X POST http://localhost:5179/api/storage/kv/store \
  -H "x-fastedge-token: <token>" \
  -H "Content-Type: application/json" \
  -d '{ "store": "users" }'
```

---

### POST /api/storage/kv/store/delete

Deletes an Edge KV store and every key in it.

**Request Body**

```typescript
{ store: StoreName }
```

**Response**

```typescript
{ ok: true }
```

**Example**

```bash
curl -X POST http://localhost:5179/api/storage/kv/store/delete \
  -H "x-fastedge-token: <token>" \
  -H "Content-Type: application/json" \
  -d '{ "store": "users" }'
```

---

### POST /api/storage/import

Imports data into an Edge KV store, creating the store if needed.

**Request Body**

```typescript
{
  store: StoreName;
  data: Record<string, unknown>; // Fixture format, or a plain key → value object
  replace?: boolean;             // Delete the store's current contents first (default: false)
}
```

`data` is read as the fixture format when its keys are only `strings`, `zsets` and `bloom` and each is an object:

```typescript
{
  strings?: Record<string, StoredValue>;
  zsets?: Record<string, [StoredValue, number][]>;
  bloom?: Record<string, string[]>;
}
```

Any other object is read as plain `key → value` pairs: string values are stored as they are and every other value is stored as its JSON text.

**Response**

```typescript
{
  ok: true;
  keys: number; // Number of keys written
}
```

**Example**

```bash
curl -X POST http://localhost:5179/api/storage/import \
  -H "x-fastedge-token: <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "store": "flags",
    "replace": true,
    "data": { "strings": { "beta": "on" }, "bloom": { "seen": ["a", "b"] } }
  }'
```

```json
{
  "ok": true,
  "keys": 2
}
```

#### Importing a FastEdge portal KV store

An agent can turn a KV store from the FastEdge portal into fixture data with the FastEdge API. Start with the store's id.

1. List the store's keys with `GET /fastedge/v1/kv/{store_id}/data`. The query parameters are `limit` (at most 200) and `offset`. The response is `{ count, entries: [{ key, datatype, payload? }] }`. Page until every entry is read.
2. Map each entry by `datatype`:
   - `kv`: the list carries `payload: { value, encoding }`. Set `strings[key]` to `value`, or to `{ base64: value }` when `encoding` is `base64`.
   - `sorted_set`: the list has no payload. Read the key with `GET /fastedge/v1/kv/{store_id}/data/{key}`, paginated the same way. The response is `{ payload: [{ value, encoding, score }] }`. Set `zsets[key]` to `[[value, score], ...]`.
   - `bloom_filter`: the list has no payload. Read the key the same way. The response is `{ payload: [{ value, encoding }] }`. Set `bloom[key]` to `[value, ...]`.
3. Send the result to `POST /api/storage/import` as `data`, or write it to `fixtures/stores/kv/<store>.json`.

What cannot be imported:

- A value with encoding `masked` or `sha256` cannot be recovered. Skip it and tell the user.
- BYOD stores keep their data outside the portal and cannot be imported this way.

---

### POST /api/storage/cache/put

Writes one cache entry in a datacenter.

**Request Body**

```typescript
{
  dc: string;          // Non-empty
  key: string;         // Non-empty
  value: StoredValue;  // Cache values may be empty
  ttlMs?: number;      // Integer >= 0; omitted uses the cache's default TTL
}
```

**Response**

```typescript
{ ok: true }
```

**Example**

```bash
curl -X POST http://localhost:5179/api/storage/cache/put \
  -H "x-fastedge-token: <token>" \
  -H "Content-Type: application/json" \
  -d '{ "dc": "local", "key": "session-1", "value": "abc", "ttlMs": 60000 }'
```

---

### POST /api/storage/cache/delete

Deletes one cache entry.

**Request Body**

```typescript
{ dc: string; key: string }
```

**Response**

```typescript
{ ok: true }
```

**Example**

```bash
curl -X POST http://localhost:5179/api/storage/cache/delete \
  -H "x-fastedge-token: <token>" \
  -H "Content-Type: application/json" \
  -d '{ "dc": "local", "key": "session-1" }'
```

---

### POST /api/storage/reset

Returns the stores to their fixtures: the cache is emptied for every datacenter and Edge KV is re-seeded. Edits not saved to fixtures are lost.

**Response**

```typescript
{ ok: true }
```

**Example**

```bash
curl -X POST -H "x-fastedge-token: <token>" http://localhost:5179/api/storage/reset
```

---

### POST /api/storage/advance-clock

Moves the storage service clock forward, so cache entries expire without waiting.

**Request Body**

```typescript
{ ms: number } // A finite number greater than 0
```

**Response**

```typescript
{ ok: true }
```

**Example**

```bash
curl -X POST http://localhost:5179/api/storage/advance-clock \
  -H "x-fastedge-token: <token>" \
  -H "Content-Type: application/json" \
  -d '{ "ms": 3600000 }'
```

**Endpoint-specific errors:** `400` when `ms` is missing, not a number, or not greater than 0.

---

### GET /api/storage/fixtures/diff

Lists the changes Save to fixtures would make: each Edge KV store's fixture file compared with what the service holds. Data that differs only in layout or key order is not a change.

**Response**

```typescript
type FixtureChange = {
  store: string;
  file: string;                          // Path relative to `root`
  status: "new" | "changed" | "deleted";
  current: string | null;                // The file now (null = no file)
  proposed: string | null;               // The file after saving (null = deleted)
  hash: string;                          // Pass back to the save endpoint
};

{
  ok: true;
  root: string;            // The stores root the files are relative to
  changes: FixtureChange[];
}
```

**Example**

```bash
curl -H "x-fastedge-token: <token>" http://localhost:5179/api/storage/fixtures/diff
```

```json
{
  "ok": true,
  "root": "/home/user/project",
  "changes": [
    {
      "store": "flags",
      "file": "fixtures/stores/kv/flags.json",
      "status": "new",
      "current": null,
      "proposed": "{\n  \"strings\": {\n    \"beta\": \"on\"\n  }\n}",
      "hash": "9f2c..."
    }
  ]
}
```

---

### POST /api/storage/fixtures/save

Writes or deletes exactly the fixture files the caller approved from the diff. Each file is sent with the `hash` the diff gave it, so only what the diff showed is written.

**Request Body**

```typescript
{
  files: { file: string; hash: string }[]; // At least one entry
}
```

**Response**

```typescript
{
  ok: true;
  saved: string[]; // The files written or deleted
}
```

**Example**

```bash
curl -X POST http://localhost:5179/api/storage/fixtures/save \
  -H "x-fastedge-token: <token>" \
  -H "Content-Type: application/json" \
  -d '{ "files": [{ "file": "fixtures/stores/kv/flags.json", "hash": "9f2c..." }] }'
```

```json
{
  "ok": true,
  "saved": ["fixtures/stores/kv/flags.json"]
}
```

**Endpoint-specific errors:** `409` when a listed file changed since the diff or was not in it. Request the diff again and resubmit. No file is written in that case.

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

`config` is returned as stored, even when `valid` is `false`. `TestConfig` is a discriminated union on `appType`. `ClientContext` and `EdgeContext` are defined under [`POST /api/load`](#post-apiload).

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
  origin?: Origin; // See POST /api/send
  properties: Record<string, unknown>;
  dotenv?: { enabled?: boolean; path?: string };
  stores?: boolean;
  dc?: string;
  client?: ClientContext;
  edge?: EdgeContext;
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
  stores?: boolean;
  dc?: string;
  client?: ClientContext;
  edge?: EdgeContext;
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
      },
      "client": { "preset": "us" }
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
| `400`  | Body failed validation (`config` invalid or `filePath` missing)            |
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

| Name                | Description                                |
| ------------------- | ------------------------------------------ |
| `api-load`          | Request body for `POST /api/load`          |
| `api-resource-load` | Request body for `POST /api/resource/load` |
| `api-send`          | Request body for `POST /api/send`          |
| `api-call`          | Request body for `POST /api/call`          |
| `api-config`        | Request body for `POST /api/config`        |

#### Response / Type Schemas

| Name                   | Description                                                      |
| ---------------------- | ---------------------------------------------------------------- |
| `fastedge-config.test` | Config file format for `fastedge-config.test.json`               |
| `hook-result`          | Shape of a single `HookResult`                                   |
| `hook-call`            | Shape of a `HookCall` input                                      |
| `full-flow-result`     | Shape of the `FullFlowResult` returned by full-flow endpoints    |
| `resource-result`      | Shape of the `POST /api/send` response when a resource is loaded |
| `http-request`         | Shape of an `HttpRequest` for HTTP-WASM execution                |
| `http-response`        | Shape of an `HttpResponse` returned by HTTP-WASM execution       |

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
| `409`  | Request conflicts with server state (no app with stores is loaded, stale fixture diff, resource file changed) |
| `500`  | Internal error during execution, I/O, or the storage service                                       |
| `503`  | The storage service is not available (Storage Explorer endpoints)                                  |

---

## See Also

- [WEBSOCKET.md](./WEBSOCKET.md) — WebSocket protocol and event types
- [DEBUGGER.md](./DEBUGGER.md) — Server startup, configuration, and environment variables
- [TEST_FRAMEWORK.md](./TEST_FRAMEWORK.md) — Programmatic test framework API
- [RUNNER.md](./RUNNER.md) — Runner API and WASM type detection
