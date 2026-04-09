# Test Configuration

Configuration file reference for `fastedge-config.test.json` — the per-test JSON file that defines the WASM binary, request, response, CDN properties, and environment variable loading for a single test scenario.

## Overview

Each test scenario is described by a `fastedge-config.test.json` file. The file is validated against a JSON Schema at load time. The test runner (and `loadConfigFile`) applies Zod defaults at runtime, so fields with defaults do not need to be present in the file — but editors validating against the `$schema` URI will flag missing required fields unless you supply them explicitly.

The config schema is a union of two variants selected by `appType`:

- **`proxy-wasm`** (CDN mode, default): The WASM module intercepts an upstream HTTP request. Uses `request.url` (full URL). Supports a mock origin `response`.
- **`http-wasm`**: The WASM module acts as an origin HTTP server. Uses `request.path` (path only). No `response` field.

**Required fields** (per JSON Schema `required` arrays):
- Top-level: `properties`, `appType`, and `request`
- Within `request` (CDN): `method`, `url`, `headers`, `body`
- Within `request` (HTTP-WASM): `method`, `path`, `headers`, `body`

**Runtime defaults**: The Zod runtime fills in `appType` (`"proxy-wasm"` for CDN), `method`, `headers`, `body`, and `properties` if absent, so those fields are optional in practice. The JSON Schema marks them required because it cannot express Zod's default-filling behaviour. Supplying explicit values avoids editor warnings. For HTTP-WASM configs, `appType: "http-wasm"` has no runtime default and **must** be specified.

## Schema Reference

### Top-Level Fields

| JSON Path            | Type      | Required (Schema)                      | Default          | Description                                                                                           |
| -------------------- | --------- | -------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------- |
| `$schema`            | `string`  | No                                     | —                | URI pointing to the JSON Schema file for IDE autocompletion and validation.                           |
| `description`        | `string`  | No                                     | —                | Human-readable label for this test scenario.                                                          |
| `wasm`               | `object`  | No                                     | —                | WASM binary configuration. Required when running without a programmatic `wasmBuffer`.                 |
| `wasm.path`          | `string`  | Yes (if `wasm` present)                | —                | Path to the compiled `.wasm` binary, relative to the config file or absolute.                        |
| `wasm.description`   | `string`  | No                                     | —                | Human-readable label for the WASM binary.                                                             |
| `appType`            | `string`  | Yes (schema) / CDN has runtime default | `"proxy-wasm"`   | App variant. `"proxy-wasm"` for CDN mode; `"http-wasm"` for HTTP mode. HTTP-WASM has no default.    |
| `request`            | `object`  | **Yes**                                | —                | Incoming HTTP request to simulate.                                                                    |
| `request.method`     | `string`  | Yes (schema) / runtime default         | `"GET"`          | HTTP method (e.g. `"GET"`, `"POST"`).                                                                 |
| `request.url`        | `string`  | **Yes** (CDN only)                     | —                | Full URL for the simulated upstream request (e.g. `"https://example.com/api"`). CDN mode only.       |
| `request.path`       | `string`  | **Yes** (HTTP-WASM only)               | —                | Request path (e.g. `"/api/submit"`). HTTP-WASM mode only. The WASM module acts as the origin server. |
| `request.headers`    | `object`  | Yes (schema) / runtime default         | `{}`             | Key/value map of request headers. All keys and values must be strings.                                |
| `request.body`       | `string`  | Yes (schema) / runtime default         | `""`             | Request body as a plain string. Use an empty string for requests with no body.                        |
| `response`           | `object`  | No                                     | —                | Mock origin response for CDN mode. Not applicable to HTTP-WASM.                                       |
| `response.headers`   | `object`  | Yes (if `response` present)            | `{}`             | Key/value map of mock origin response headers.                                                        |
| `response.body`      | `string`  | Yes (if `response` present)            | `""`             | Mock origin response body as a plain string.                                                          |
| `properties`         | `object`  | **Yes** (schema) / runtime default     | `{}`             | CDN property key/value pairs passed to the WASM execution context. Values may be any JSON type.      |
| `dotenv`             | `object`  | No                                     | —                | Dotenv file loading configuration.                                                                    |
| `dotenv.enabled`     | `boolean` | No                                     | —                | Whether to load a `.env` file before execution.                                                       |
| `dotenv.path`        | `string`  | No                                     | —                | Path to the `.env` file. If omitted, resolves `.env` relative to the config file directory.          |

### Required vs. Default Distinction

The JSON Schema's `required` arrays drive editor validation. Fields like `appType`, `request.method`, `request.headers`, `request.body`, and `properties` appear in the schema's `required` array, so a strict JSON Schema validator will flag them as missing. At runtime, the Zod schema fills in their defaults (`"proxy-wasm"`, `"GET"`, `{}`, `""`, and `{}` respectively), so the test runner accepts configs that omit them — with the exception of `appType: "http-wasm"`, which has no Zod default and must always be specified for HTTP-WASM configs.

To avoid editor warnings while keeping configs concise, either supply the fields explicitly or add the `$schema` field and accept that your editor may warn on omission.

## Dotenv Configuration

When `dotenv.enabled` is `true`, the runner loads a `.env` file and merges its contents into `process.env` before executing the WASM binary. This allows secrets and environment-specific values to be injected without embedding them in the config file.

**File resolution order:**
1. If `dotenv.path` is set, that path is used (relative to the directory containing the config file, or absolute).
2. If `dotenv.path` is omitted, `.env` is resolved relative to the directory containing the config file.

**CDN mode**: Properties passed to the WASM context come from the `properties` field in the config. Dotenv variables are available to the Node.js host process but are not automatically injected as CDN properties. To expose a `.env` value as a CDN property, reference `process.env.VAR_NAME` programmatically when constructing the runner config.

**HTTP-WASM mode**: Dotenv loading works the same way. The WASM module receives the simulated HTTP request; host environment variables are available to any host-side logic but are not part of the WASM execution context directly.

**Security note**: Do not commit `.env` files containing secrets. Add `.env` to `.gitignore` and use `dotenv.enabled: true` with `dotenv.path` pointing to a file that exists only in the local or CI environment.

## Examples

### Minimal CDN Configuration

The smallest valid config. `appType`, `request`, and `properties` are required by the schema; `appType` and the `request` sub-fields `method`, `headers`, and `body` have runtime defaults and can be omitted in practice, but are included here for schema compliance.

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

A CDN scenario that passes property values to the WASM context and loads secrets from a `.env` file.

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
    "path": "./.env.test"
  }
}
```

Corresponding `.env.test`:

```
API_SECRET=supersecret
DEBUG_MODE=false
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

### Custom Origin Response

A CDN scenario where the mock origin returns a specific response. Use this to test how the WASM handler transforms or conditionally passes through origin responses.

```json
{
  "$schema": "./node_modules/@gcoredev/fastedge-test/schemas/fastedge-config.test.schema.json",
  "description": "CDN handler with custom mock origin response",
  "appType": "proxy-wasm",
  "wasm": {
    "path": "./dist/handler.wasm"
  },
  "request": {
    "method": "GET",
    "url": "https://example.com/cached-resource",
    "headers": {},
    "body": ""
  },
  "response": {
    "headers": {
      "content-type": "application/json",
      "cache-control": "max-age=86400"
    },
    "body": "{\"status\": \"ok\", \"data\": []}"
  },
  "properties": {
    "CACHE_TTL": 86400
  }
}
```

## IDE Integration

Adding `$schema` to your config file enables JSON Schema validation and autocompletion in VSCode and any editor that supports the JSON Language Server.

```json
{
  "$schema": "./node_modules/@gcoredev/fastedge-test/schemas/fastedge-config.test.schema.json"
}
```

The schema file is included in the published package at `schemas/fastedge-config.test.schema.json`. The path in `$schema` should be relative to the config file's location.

**VSCode**: No additional extensions are needed. The built-in JSON language server resolves `$schema` automatically. You will get:
- Field name autocompletion
- Type validation (e.g. strings vs. objects)
- Inline documentation on hover
- Errors for unrecognised fields (`additionalProperties: false` is set at every object level)

**Other editors**: Any editor using the JSON Language Server (Neovim via `nvim-lspconfig`, IntelliJ IDEA, etc.) will also pick up the schema from the `$schema` field without additional configuration.

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

`loadConfigFile` reads the file, parses JSON, and validates it through the Zod schema (applying defaults). It throws a descriptive `Error` if the file cannot be read, is not valid JSON, or fails schema validation.

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
  response?: {
    headers: Record<string, string>;       // default: {}
    body:    string;                       // default: ""
  };
  properties: Record<string, unknown>;     // default: {}
  dotenv?: {
    enabled?: boolean;
    path?:    string;
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
  properties: Record<string, unknown>;     // default: {}
  dotenv?: {
    enabled?: boolean;
    path?:    string;
  };
};
```

Use `appType` to narrow the union before accessing variant-specific fields:

```typescript
import { loadConfigFile } from "@gcoredev/fastedge-test/test";

const config = await loadConfigFile("./fastedge-config.test.json");

if (config.appType === "proxy-wasm") {
  console.log(config.request.url);   // string — CDN full URL
  console.log(config.response);      // ResponseConfig | undefined
} else {
  console.log(config.request.path);  // string — HTTP-WASM path
}
```

## See Also

- [TEST_FRAMEWORK.md](./TEST_FRAMEWORK.md) — using `loadConfigFile` in test suites, `runFlow`, and the full test framework API
- [API.md](./API.md) — `GET /api/config` and `POST /api/config` REST endpoints for reading and writing config at runtime
- [RUNNER.md](./RUNNER.md) — runner configuration and WASM execution options
