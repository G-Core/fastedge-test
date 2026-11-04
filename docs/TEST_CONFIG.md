# Test Configuration

Configuration file reference for `fastedge-config.test.json` — the per-test JSON file that defines the WASM binary, request, CDN properties, and dotenv loading for a single test scenario.

## Overview

Each test scenario is described by a `fastedge-config.test.json` file. The file is validated against a JSON Schema at load time. `loadConfigFile` applies Zod defaults at runtime, so fields with defaults do not need to be present in the file — but editors validating against the `$schema` URI flag missing required fields unless you supply them explicitly.

The config schema is a union of two variants selected by `appType`:

- **`proxy-wasm`** (CDN mode, default): The WASM module intercepts an upstream HTTP request. Uses `request.url` (full URL). The upstream response is generated at runtime — either by a real fetch against `request.url`, or by the built-in responder when `request.url === "built-in"`. There is no fixture-level mock response.
- **`http-wasm`**: The WASM module acts as an origin HTTP server. Uses `request.path` (path only).

**Required fields** (per the JSON Schema `required` arrays):

- Top-level, both variants: `properties`, `appType`, `request`
- Within `request` (CDN): `method`, `url`, `headers`, `body`
- Within `request` (HTTP-WASM): `method`, `path`, `headers`, `body`
- Within `wasm` (when present): `path`

**Runtime defaults**: The Zod runtime fills in `appType` (`"proxy-wasm"`, CDN variant only), `request.method`, `request.headers`, `request.body`, and `properties` when they are absent, so those fields are optional in practice. The JSON Schema still lists them in `required`, so editors flag them as missing. Supplying explicit values avoids editor warnings. For HTTP-WASM configs, `appType: "http-wasm"` has no runtime default and must be specified.

## Schema Reference

### Fields

| JSON Path          | Type      | Required          | Default        | Description                                                                           |
| ------------------ | --------- | ----------------- | -------------- | ------------------------------------------------------------------------------------- |
| `$schema`          | `string`  | No                | —              | URI of the JSON Schema file, used for IDE autocompletion and validation.              |
| `description`      | `string`  | No                | —              | Human-readable label for this test scenario.                                          |
| `wasm`             | `object`  | No                | —              | WASM binary configuration.                                                            |
| `wasm.path`        | `string`  | If `wasm` present | —              | Path to the compiled `.wasm` binary.                                                  |
| `wasm.description` | `string`  | No                | —              | Human-readable label for the WASM binary.                                             |
| `appType`          | `string`  | Yes               | `"proxy-wasm"` | `"proxy-wasm"` (CDN) or `"http-wasm"`. Default applies to CDN only.                   |
| `httpPort`         | `integer` | No                | —              | HTTP-WASM only. Pins the `fastedge-run` port (1024–65535) instead of pool allocation. |
| `request`          | `object`  | Yes               | —              | Incoming HTTP request to simulate.                                                    |
| `request.method`   | `string`  | Yes               | `"GET"`        | HTTP method (e.g. `"GET"`, `"POST"`).                                                 |
| `request.url`      | `string`  | Yes (CDN)         | —              | Full upstream URL (CDN only). Use `"built-in"` for the local responder.               |
| `request.path`     | `string`  | Yes (HTTP-WASM)   | —              | Request path, e.g. `"/api/submit"` (HTTP-WASM only).                                  |
| `request.headers`  | `object`  | Yes               | `{}`           | Request headers. Keys and values must be strings.                                     |
| `request.body`     | `string`  | Yes               | `""`           | Request body as a plain string.                                                       |
| `properties`       | `object`  | Yes               | `{}`           | CDN properties passed to the WASM context. Values may be any JSON type.               |
| `dotenv`           | `object`  | No                | —              | Dotenv file loading configuration.                                                    |
| `dotenv.enabled`   | `boolean` | No                | `false`        | Whether to load dotenv files.                                                         |
| `dotenv.path`      | `string`  | No                | —              | Directory containing the dotenv files (not a file).                                   |

`additionalProperties` is `false` at the top level and in `wasm`, `dotenv`, and `request`; unrecognised fields fail validation.

### Required vs. Default Distinction

The JSON Schema `required` arrays drive editor validation. `appType`, `request.method`, `request.headers`, `request.body`, and `properties` appear in those arrays, so a strict JSON Schema validator flags them when missing. At runtime, the Zod schema fills in their defaults (`"proxy-wasm"`, `"GET"`, `{}`, `""`, and `{}` respectively), so `loadConfigFile` accepts configs that omit them. The exception is `appType: "http-wasm"`, which has no default and must always be specified for HTTP-WASM configs.

`request.url` (CDN) and `request.path` (HTTP-WASM) are required and have no default.

## Dotenv Configuration

When `dotenv.enabled` is `true`, the runner loads dotenv files and supplies their values to the app as its environment variables and secrets — the values the app reads through the SDK's env and secret APIs. The values are not merged into the Node.js `process.env`. `dotenv.enabled` defaults to `false`.

**`dotenv.path` is a directory**, not a file. The runner reads these files from it:

- `.env` — a key with a `FASTEDGE_VAR_ENV_` prefix is an env var and a key with a `FASTEDGE_VAR_SECRET_` prefix is a secret; the prefix is stripped. A key with no `FASTEDGE_VAR_` prefix is an env var. Any other `FASTEDGE_VAR_` key (headers, KV) is neither an env var nor a secret.
- `.env.secrets` — secrets. Unprefixed keys only; keys starting with `FASTEDGE_VAR_` are skipped.
- `.env.variables` — env vars. Unprefixed keys only; keys starting with `FASTEDGE_VAR_` are skipped.

Missing files are skipped.

**Path resolution:**

1. If `dotenv.path` is relative, `loadConfigFile` resolves it against the directory containing the config file. An absolute path is used as-is.
2. If `dotenv.path` is omitted, the runner uses the process current working directory, not the config file's directory.

**Key rules (both app types):** Env vars and secrets follow the same rules for CDN (proxy-wasm) and HTTP-WASM apps. CDN apps load the files in the runner; HTTP-WASM apps pass the directory to `fastedge-run --dotenv`, which applies the same rules.

- In `.env`, a key with no `FASTEDGE_VAR_` prefix is an env var. Any other `FASTEDGE_VAR_` key (headers, KV) is neither an env var nor a secret.
- In `.env.secrets` and `.env.variables`, keys that start with `FASTEDGE_VAR_` are skipped.
- `.env` is read first and later files only fill keys that are not set yet, so for the same key `.env` wins over `.env.secrets` and `.env.variables`.

**HTTP-WASM only:** `fastedge-run` also reads `.env.req_headers`, `.env.rsp_headers` and `.env.kv_stores`, and the matching `.env` prefixes `FASTEDGE_VAR_REQ_HEADER_` and `FASTEDGE_VAR_RSP_HEADER_`. CDN apps do not.

**Security note**: Do not commit files that contain secrets. Add them to `.gitignore`. Point `dotenv.path` at a directory, not a file — a path to a file such as `./.env.test` is treated as a directory and no files are found in it.

## HTTP Port Pinning

`httpPort` is an optional integer field (1024–65535) available only in HTTP-WASM configs (`appType: "http-wasm"`). It pins the `fastedge-run` subprocess to a fixed port instead of allocating one from the dynamic pool (8100–8199). The schema rejects `httpPort` on proxy-wasm configs.

### Default Behaviour

Without `httpPort`, the runner allocates a port from the 8100–8199 range. The allocated port is not stable across runs.

### When to Use Port Pinning

- **Codespaces / Docker port-forwarding**: Port-forward rules reference a specific port number. Without pinning, the port changes between runs and breaks the forwarding rule.
- **Stable live-preview URLs**: Browser tabs or external tooling pointing at a fixed URL (e.g. `http://localhost:8250`) require a stable port.
- **External tooling integration**: Monitoring, load testing, or proxy configurations that hard-code a target address.

### Fail-Fast Semantics

If the pinned port is already in use, `HttpWasmRunner.load()` throws an `Error` immediately:

```
fastedge-run port 8250 is not available — release it or choose a different httpPort in fastedge-config.test.json
```

There is no fallback to dynamic allocation. Free the port or choose a different one before running.

### Port Range Considerations

Pinning a port inside the 8100–8199 dynamic pool is allowed by the schema but risks collisions with dynamic allocations made by other debug sessions. For production-like setups or shared environments, choose a port outside the pool (e.g. 8250).

### Example

```json
{
  "$schema": "./node_modules/@gcoredev/fastedge-test/schemas/fastedge-config.test.schema.json",
  "description": "HTTP-WASM handler with pinned port for Codespaces",
  "appType": "http-wasm",
  "wasm": {
    "path": "./dist/http-handler.wasm"
  },
  "request": {
    "method": "GET",
    "path": "/health",
    "headers": {},
    "body": ""
  },
  "properties": {},
  "httpPort": 8250
}
```

## Examples

### Minimal CDN Configuration

The smallest config that passes JSON Schema validation. `appType`, `request`, and `properties` are required by the schema; `appType` and the `request` fields `method`, `headers`, and `body` have runtime defaults and can be omitted in practice, but are included here for schema compliance.

```json
{
  "$schema": "./node_modules/@gcoredev/fastedge-test/schemas/fastedge-config.test.schema.json",
  "appType": "proxy-wasm",
  "wasm": {
    "path": "./dist/handler.wasm"
  },
  "request": {
    "method": "GET",
    "url": "https://example.com/",
    "headers": {},
    "body": ""
  },
  "properties": {}
}
```

### CDN with Properties and Secrets

A CDN scenario that passes property values to the WASM context and loads secrets and env vars from a `fixtures` directory next to the config file.

```json
{
  "$schema": "./node_modules/@gcoredev/fastedge-test/schemas/fastedge-config.test.schema.json",
  "description": "CDN handler with feature flags and auth secret",
  "appType": "proxy-wasm",
  "wasm": {
    "path": "./dist/handler.wasm",
    "description": "Production CDN handler"
  },
  "request": {
    "method": "GET",
    "url": "https://example.com/api/data",
    "headers": {
      "accept": "application/json",
      "x-request-id": "test-001"
    },
    "body": ""
  },
  "properties": {
    "FEATURE_FLAG_NEW_CACHE": "true",
    "UPSTREAM_HOST": "origin.example.com",
    "MAX_AGE": 3600
  },
  "dotenv": {
    "enabled": true,
    "path": "./fixtures"
  }
}
```

Corresponding `fixtures/.env.secrets`:

```
API_SECRET=supersecret
```

Corresponding `fixtures/.env.variables`:

```
DEBUG_MODE=false
```

The app reads `API_SECRET` through the SDK's secret API and `DEBUG_MODE` through its env API. The equivalent entries in a single `fixtures/.env` file use prefixes for secrets (an unprefixed key is an env var, so the `FASTEDGE_VAR_ENV_` prefix is optional):

```
FASTEDGE_VAR_SECRET_API_SECRET=supersecret
FASTEDGE_VAR_ENV_DEBUG_MODE=false
```

### HTTP-WASM Configuration

An HTTP-WASM scenario simulating a `POST` request with a JSON body. `appType` must be `"http-wasm"` — there is no runtime default for this variant. Use `request.path` (not `request.url`); the WASM module acts as the origin server and receives only the path portion of the request.

```json
{
  "$schema": "./node_modules/@gcoredev/fastedge-test/schemas/fastedge-config.test.schema.json",
  "description": "HTTP-WASM POST handler",
  "appType": "http-wasm",
  "wasm": {
    "path": "./dist/http-handler.wasm"
  },
  "request": {
    "method": "POST",
    "path": "/submit",
    "headers": {
      "content-type": "application/json",
      "authorization": "Bearer test-token"
    },
    "body": "{\"key\": \"value\"}"
  },
  "properties": {}
}
```

### Built-In Responder (No Network)

A CDN scenario that uses the test runner's built-in responder instead of reaching out to a real origin. Set `request.url` to `"built-in"` — the runner generates a local response and skips the upstream fetch, so the scenario does not depend on network reachability.

```json
{
  "$schema": "./node_modules/@gcoredev/fastedge-test/schemas/fastedge-config.test.schema.json",
  "description": "CDN handler against the built-in responder",
  "appType": "proxy-wasm",
  "wasm": {
    "path": "./dist/handler.wasm"
  },
  "request": {
    "method": "GET",
    "url": "built-in",
    "headers": {},
    "body": ""
  },
  "properties": {
    "CACHE_TTL": 86400
  }
}
```

The default built-in response is a full JSON echo of the request. Override via control headers on the request: `x-debugger-status` sets the HTTP status; `x-debugger-content: status-only` omits the body; `x-debugger-content: body-only` echoes only the request body (with its inferred content-type).

## IDE Integration

Adding `$schema` to your config file enables JSON Schema validation and autocompletion in VSCode and any editor that supports the JSON Language Server.

```json
{
  "$schema": "./node_modules/@gcoredev/fastedge-test/schemas/fastedge-config.test.schema.json"
}
```

The schema file is included in the published package at `schemas/fastedge-config.test.schema.json`. The path in `$schema` should be relative to the config file's location.

**VSCode**: No additional extensions are needed. The built-in JSON language server resolves `$schema` automatically. You get:

- Field name autocompletion
- Type validation (e.g. strings vs. objects)
- Inline documentation on hover
- Errors for unrecognised fields (`additionalProperties: false` is set at the top level and in `wasm`, `dotenv`, and `request`)

**Other editors**: Any editor using the JSON Language Server (Neovim via `nvim-lspconfig`, IntelliJ IDEA, etc.) also picks up the schema from the `$schema` field without additional configuration.

## Programmatic Usage

To load and validate a config file at runtime in a test script:

```typescript
import { loadConfigFile } from "@gcoredev/fastedge-test/test";
import type { TestConfig } from "@gcoredev/fastedge-test/test";

const config: TestConfig = await loadConfigFile("./fastedge-config.test.json");

console.log(config.appType);       // "proxy-wasm" | "http-wasm"
console.log(config.properties);    // Record<string, unknown>
console.log(config.wasm?.path);    // string | undefined
```

`loadConfigFile` reads the file, parses JSON, and validates it through the Zod schema (applying defaults). It throws a descriptive `Error` if the file cannot be read, is not valid JSON, or fails schema validation. A relative `dotenv.path` in the returned config is resolved to an absolute path against the config file's directory.

The returned `TestConfig` type is a union discriminated by `appType`:

```typescript
type TestConfig = CdnConfig | HttpConfig;

type CdnConfig = {
  $schema?:     string;
  description?: string;
  appType:      "proxy-wasm";              // default applied at runtime
  wasm?: {
    path:         string;
    description?: string;
  };
  request: {
    method:  string;                       // default: "GET"
    url:     string;
    headers: Record<string, string>;       // default: {}
    body:    string;                       // default: ""
  };
  properties: Record<string, unknown>;     // default: {}
  dotenv?: {
    enabled?: boolean;
    path?:    string;                      // directory containing the dotenv files
  };
};

type HttpConfig = {
  $schema?:     string;
  description?: string;
  appType:      "http-wasm";               // no default — must be specified
  wasm?: {
    path:         string;
    description?: string;
  };
  request: {
    method:  string;                       // default: "GET"
    path:    string;
    headers: Record<string, string>;       // default: {}
    body:    string;                       // default: ""
  };
  httpPort?:    number;                    // pin subprocess port (1024–65535); throws if busy
  properties: Record<string, unknown>;     // default: {}
  dotenv?: {
    enabled?: boolean;
    path?:    string;                      // directory containing the dotenv files
  };
};
```

Use `appType` to narrow the union before accessing variant-specific fields:

```typescript
import { loadConfigFile } from "@gcoredev/fastedge-test/test";

const config = await loadConfigFile("./fastedge-config.test.json");

if (config.appType === "proxy-wasm") {
  console.log(config.request.url);   // string — CDN full URL
} else {
  console.log(config.request.path);  // string — HTTP-WASM path
  console.log(config.httpPort);      // number | undefined
}
```

## See Also

- [TEST_FRAMEWORK.md](./TEST_FRAMEWORK.md) — using `loadConfigFile` in test suites, `runFlow`, and the full test framework API
- [API.md](./API.md) — `GET /api/config` and `POST /api/config` REST endpoints for reading and writing config at runtime
- [RUNNER.md](./RUNNER.md) — runner configuration and WASM execution options
