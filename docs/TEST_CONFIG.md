# Test Configuration

Configuration file reference for `fastedge-config.test.json` — the per-test JSON file that defines the WASM binary, request, response, CDN properties, and environment variable loading for a single test scenario.

## Overview

Each test scenario is described by a `fastedge-config.test.json` file. The file is validated against a JSON Schema at load time. The test runner (and `loadConfigFile`) applies Zod defaults at runtime, so fields with defaults do not need to be present in the file — but editors validating against the `$schema` URI will flag missing required fields unless you supply them explicitly.

**Required fields** (per JSON Schema `required` array): `request` and `properties` at the top level; `method`, `url`, `headers`, and `body` within `request`.

**Runtime defaults**: The Zod runtime fills in `method`, `headers`, and `body` if absent, so those fields are optional in practice. Similarly, `properties` defaults to `{}` at runtime even though the JSON Schema marks it required. The JSON Schema marks them as required because it cannot express Zod's default-filling behaviour. Supplying explicit values avoids editor warnings.

## Schema Reference

### Top-Level Fields

| JSON Path           | Type      | Required (Schema)                  | Default | Description                                                                                      |
| ------------------- | --------- | ---------------------------------- | ------- | ------------------------------------------------------------------------------------------------ |
| `$schema`           | `string`  | No                                 | —       | URI pointing to the JSON Schema file for IDE autocompletion and validation.                      |
| `description`       | `string`  | No                                 | —       | Human-readable label for this test scenario.                                                     |
| `wasm`              | `object`  | No                                 | —       | WASM binary configuration. Required when running without a programmatic `wasmBuffer`.            |
| `wasm.path`         | `string`  | Yes (if `wasm` present)            | —       | Path to the compiled `.wasm` binary, relative to the config file or absolute.                   |
| `wasm.description`  | `string`  | No                                 | —       | Human-readable label for the WASM binary.                                                        |
| `request`           | `object`  | **Yes**                            | —       | Incoming HTTP request to simulate.                                                               |
| `request.method`    | `string`  | Yes (schema) / runtime default     | `"GET"` | HTTP method (e.g. `"GET"`, `"POST"`).                                                            |
| `request.url`       | `string`  | **Yes**                            | —       | Full URL or path for the simulated request (e.g. `"https://example.com/api"`).                  |
| `request.headers`   | `object`  | Yes (schema) / runtime default     | `{}`    | Key/value map of request headers. All keys and values must be strings.                           |
| `request.body`      | `string`  | Yes (schema) / runtime default     | `""`    | Request body as a plain string. Use an empty string for requests with no body.                   |
| `response`          | `object`  | No                                 | —       | Mock origin response for CDN mode. Not applicable to HTTP-WASM.                                  |
| `response.headers`  | `object`  | Yes (if `response` present)        | `{}`    | Key/value map of mock origin response headers.                                                   |
| `response.body`     | `string`  | Yes (if `response` present)        | `""`    | Mock origin response body as a plain string.                                                     |
| `properties`        | `object`  | **Yes** (schema) / runtime default | `{}`    | CDN property key/value pairs passed to the WASM execution context. Values may be any JSON type. |
| `dotenv`            | `object`  | No                                 | —       | Dotenv file loading configuration.                                                               |
| `dotenv.enabled`    | `boolean` | No                                 | —       | Whether to load a `.env` file before execution.                                                  |
| `dotenv.path`       | `string`  | No                                 | —       | Path to the `.env` file. If omitted, resolves `.env` relative to the config file.               |

### Required vs. Default Distinction

The JSON Schema's `required` arrays drive editor validation. Fields like `request.method`, `request.headers`, `request.body`, and `properties` appear in the schema's `required` array (or top-level `required`), so a strict JSON Schema validator will flag them as missing. At runtime, the Zod schema fills in their defaults (`"GET"`, `{}`, `""`, and `{}` respectively), so the test runner accepts configs that omit them.

To avoid editor warnings while keeping configs concise, either supply the fields explicitly or add the `$schema` field and accept that your editor may warn on omission.

## Dotenv Configuration

When `dotenv.enabled` is `true`, the runner loads a `.env` file and merges its contents into `process.env` before executing the WASM binary. This allows secrets and environment-specific values to be injected without embedding them in the config file.

**File resolution order:**
1. If `dotenv.path` is set, that path is used (relative to the working directory or absolute).
2. If `dotenv.path` is omitted, `.env` is resolved relative to the directory containing the config file.

**CDN mode**: Properties passed to the WASM context come from the `properties` field in the config. Dotenv variables are available to the Node.js host process but are not automatically injected as CDN properties. To expose a `.env` value as a CDN property, reference `process.env.VAR_NAME` programmatically when constructing the runner config.

**HTTP-WASM mode**: Dotenv loading works the same way. The WASM module receives the simulated HTTP request; host environment variables are available to any host-side logic but are not part of the WASM execution context directly.

**Security note**: Do not commit `.env` files containing secrets. Add `.env` to `.gitignore` and use `dotenv.enabled: true` with `dotenv.path` pointing to a file that exists only in the local or CI environment.

## Examples

### Minimal CDN Configuration

The smallest valid config. `request` and `properties` are required; all other fields use runtime defaults or are omitted.

```json
{
  "$schema": "./node_modules/@gcoredev/fastedge-test/schemas/fastedge-config.test.schema.json",
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

An HTTP-WASM scenario simulating a `POST` request with a JSON body. The `response` field is not relevant to HTTP-WASM execution; `properties` is still required by the schema and defaults to `{}` at runtime.

```json
{
  "$schema": "./node_modules/@gcoredev/fastedge-test/schemas/fastedge-config.test.schema.json",
  "description": "HTTP-WASM POST handler",
  "wasm": {
    "path": "./dist/http-handler.wasm"
  },
  "request": {
    "method": "POST",
    "url": "https://api.example.com/submit",
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

console.log(config.request.url);       // string
console.log(config.properties);        // Record<string, unknown>
console.log(config.wasm?.path);        // string | undefined
```

`loadConfigFile` reads the file, parses JSON, and validates it through the Zod schema (applying defaults). It throws a descriptive `Error` if the file cannot be read, is not valid JSON, or fails schema validation.

The returned `TestConfig` type reflects the Zod-inferred shape after defaults are applied:

```typescript
type TestConfig = {
  $schema?: string;
  description?: string;
  wasm?: {
    path: string;
    description?: string;
  };
  request: {
    method: string;                    // default: "GET"
    url: string;
    headers: Record<string, string>;   // default: {}
    body: string;                      // default: ""
  };
  response?: {
    headers: Record<string, string>;   // default: {}
    body: string;                      // default: ""
  };
  properties: Record<string, unknown>; // default: {}
  dotenv?: {
    enabled?: boolean;
    path?: string;
  };
};
```

## See Also

- [TEST_FRAMEWORK.md](./TEST_FRAMEWORK.md) — using `loadConfigFile` in test suites, `runFlow`, and the full test framework API
- [API.md](./API.md) — `GET /api/config` and `POST /api/config` REST endpoints for reading and writing config at runtime
- [RUNNER.md](./RUNNER.md) — runner configuration and WASM execution options
