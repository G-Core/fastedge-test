# Test Configuration

Configuration file schema for `fastedge-config.test.json` — defines the WASM binary, request inputs, mock origin response, CDN properties, and environment variable loading for a single test scenario.

## Overview

Each test scenario is described by a `fastedge-config.test.json` file. The file is loaded and validated against the schema before execution. Fields with defaults are optional at runtime; fields marked required must be present.

The configuration covers two execution modes:

- **CDN mode** — runs the WASM binary through the full CDN request/response lifecycle, including mock origin responses and CDN property values.
- **HTTP-WASM mode** — runs the WASM binary as an HTTP filter without CDN-specific properties or origin response simulation.

## Schema Reference

| JSON path | Type | Required | Default | Description |
|---|---|---|---|---|
| `$schema` | `string` | No | — | URI to the JSON schema file for IDE validation and autocompletion. |
| `description` | `string` | No | — | Human-readable label for the configuration, shown in the UI. |
| `wasm.path` | `string` | Yes (if no inline binary) | — | Path to the compiled `.wasm` binary, relative to the config file. |
| `wasm.description` | `string` | No | — | Human-readable label for the WASM binary. |
| `request.method` | `string` | No | `"GET"` | HTTP method for the simulated incoming request. |
| `request.url` | `string` | Yes | — | Full URL or path for the simulated incoming request (e.g. `https://example.com/path` or `/path`). |
| `request.headers` | `Record<string, string>` | No | `{}` | HTTP headers to include on the simulated incoming request. |
| `request.body` | `string` | No | `""` | Body of the simulated incoming request. |
| `response.headers` | `Record<string, string>` | No | `{}` | CDN only: headers returned by the mock origin server. |
| `response.body` | `string` | No | `""` | CDN only: body returned by the mock origin server. |
| `properties` | `Record<string, unknown>` | No | `{}` | CDN property key/value pairs made available to the WASM binary via the properties API. |
| `dotenv.enabled` | `boolean` | No | — | When `true`, loads a `.env` file before executing the WASM binary. |
| `dotenv.path` | `string` | No | — | Path to the `.env` file, relative to the config file. Defaults to `.env` in the same directory as the config file when `dotenv.enabled` is `true` and no path is specified. |

### Type Definitions

```typescript
interface WasmConfig {
  path: string;
  description?: string;
}

interface RequestConfig {
  method: string;       // default: "GET"
  url: string;
  headers: Record<string, string>;  // default: {}
  body: string;         // default: ""
}

interface ResponseConfig {
  headers: Record<string, string>;  // default: {}
  body: string;         // default: ""
}

interface TestConfig {
  $schema?: string;
  description?: string;
  wasm?: WasmConfig;
  request: RequestConfig;
  response?: ResponseConfig;
  properties?: Record<string, unknown>;  // default: {}
  dotenv?: {
    enabled?: boolean;
    path?: string;
  };
}
```

### Required Fields

Only two fields are required by the schema:

- `request` — the object itself (with `url` inside it)
- `request.url` — the URL for the simulated request

All other fields either have defaults or are fully optional. The `wasm` object is optional in the JSON schema to support programmatic usage where the binary is supplied via `wasmBuffer` rather than a file path. When loading configs for file-based execution, `wasm.path` must be set.

## Dotenv Configuration

When `dotenv.enabled` is `true`, the runner loads a `.env` file and merges its values into the environment before executing the WASM binary.

**File resolution:**

1. If `dotenv.path` is set, that path is resolved relative to the config file's directory.
2. If `dotenv.path` is not set, the runner looks for `.env` in the same directory as the config file.

**Precedence:** Values from the `.env` file do not override environment variables that are already set in the process environment. Variables present in the `.env` file but absent from the process environment are added.

**CDN vs HTTP-WASM:** Dotenv works the same way in both modes. Loaded values are available to the WASM binary through the environment API. In CDN mode, environment variables are separate from CDN `properties` — they are different access mechanisms.

**Security note:** Do not commit `.env` files containing secrets to source control. Use `.env` for local development and CI secret injection for production pipelines.

## Examples

### Minimal CDN Configuration

```json
{
  "$schema": "./node_modules/@gcoredev/fastedge-test/schemas/fastedge-config.test.schema.json",
  "wasm": {
    "path": "./dist/main.wasm"
  },
  "request": {
    "url": "https://example.com/api/hello",
    "method": "GET"
  },
  "properties": {}
}
```

### CDN with Properties and Secrets

```json
{
  "$schema": "./node_modules/@gcoredev/fastedge-test/schemas/fastedge-config.test.schema.json",
  "description": "Auth middleware — production-like config",
  "wasm": {
    "path": "./dist/auth.wasm",
    "description": "Auth middleware binary"
  },
  "request": {
    "method": "GET",
    "url": "https://example.com/protected/resource",
    "headers": {
      "authorization": "Bearer test-token-abc123",
      "x-forwarded-for": "203.0.113.42"
    },
    "body": ""
  },
  "properties": {
    "auth_mode": "jwt",
    "allowed_origins": "example.com,api.example.com",
    "rate_limit": 100
  },
  "dotenv": {
    "enabled": true,
    "path": "./.env.test"
  }
}
```

The `.env.test` file for the above:

```ini
JWT_SECRET=dev-secret-do-not-use-in-production
TOKEN_ISSUER=https://auth.example.com
```

### HTTP-WASM Configuration

HTTP-WASM mode does not use `response` or `properties`. Omit them or leave `properties` as `{}`.

```json
{
  "$schema": "./node_modules/@gcoredev/fastedge-test/schemas/fastedge-config.test.schema.json",
  "description": "Header rewrite filter",
  "wasm": {
    "path": "./dist/header-rewrite.wasm"
  },
  "request": {
    "method": "POST",
    "url": "https://example.com/submit",
    "headers": {
      "content-type": "application/json",
      "x-request-id": "abc-123"
    },
    "body": "{\"key\": \"value\"}"
  },
  "properties": {}
}
```

### Custom Origin Response

Use `response` to control what the mock origin returns to the WASM binary during CDN execution. This lets you test how your binary handles different upstream responses without running a real origin server.

```json
{
  "$schema": "./node_modules/@gcoredev/fastedge-test/schemas/fastedge-config.test.schema.json",
  "description": "Test binary behavior on 404 from origin",
  "wasm": {
    "path": "./dist/error-handler.wasm"
  },
  "request": {
    "method": "GET",
    "url": "https://example.com/missing-page",
    "headers": {}
  },
  "response": {
    "headers": {
      "content-type": "text/plain",
      "x-origin-error": "not-found"
    },
    "body": "Not Found"
  },
  "properties": {
    "custom_404_page": "/errors/404.html"
  }
}
```

## IDE Integration

Set `$schema` to enable JSON schema validation, field autocompletion, and inline documentation in VSCode and other editors that support JSON Schema Draft 2020-12.

```json
{
  "$schema": "./node_modules/@gcoredev/fastedge-test/schemas/fastedge-config.test.schema.json"
}
```

The schema file is published as part of the package at `schemas/fastedge-config.test.schema.json`. Use a relative path from the config file to the schema inside `node_modules`.

For monorepos or non-standard `node_modules` locations, adjust the path accordingly:

```json
{
  "$schema": "../../node_modules/@gcoredev/fastedge-test/schemas/fastedge-config.test.schema.json"
}
```

## Programmatic Usage

To load and validate a `fastedge-config.test.json` file in code, use `loadConfigFile` from the test framework:

```typescript
import { loadConfigFile } from '@gcoredev/fastedge-test';

const config = await loadConfigFile('./fastedge-config.test.json');
// config is a validated TestConfig — all fields have their defaults applied
console.log(config.request.method); // "GET"
```

`loadConfigFile` reads the file, parses JSON, and validates against the schema. It throws a descriptive error if the file cannot be read, contains invalid JSON, or fails schema validation.

The returned `TestConfig` type has all optional fields resolved with their defaults — for example, `request.headers` is always `Record<string, string>` (never `undefined`) after validation.

## See Also

- [TEST_FRAMEWORK.md](./TEST_FRAMEWORK.md) — using `loadConfigFile`, `defineTestSuite`, and `runTestSuite` in test code
- [API.md](./API.md) — `GET /api/config` and `POST /api/config` endpoints for reading and writing config via REST
