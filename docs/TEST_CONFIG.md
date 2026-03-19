# Test Configuration: fastedge-config.test.json

## Purpose

`fastedge-config.test.json` is the test configuration file. It auto-loads in the visual debugger and can be loaded programmatically via `loadConfigFile()`. It persists request setup, WASM path, CDN properties, and log level. It does NOT store secrets or env vars inline — those go in dotenv files.

---

## Schema

| Field              | Type                   | Required         | Default | Notes                                                                                                        |
| ------------------ | ---------------------- | ---------------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| `$schema`          | string                 | optional         | —       | Path to `./node_modules/@gcoredev/fastedge-test/schemas/fastedge-config.test.schema.json` for IDE validation |
| `description`      | string                 | optional         | —       | Human label for this config                                                                                  |
| `wasm.path`        | string                 | required-if-wasm | —       | Relative or absolute path to compiled WASM binary                                                            |
| `wasm.description` | string                 | optional         | —       | Label for the loaded binary                                                                                  |
| `request.method`   | string                 | required         | `"GET"` | HTTP method                                                                                                  |
| `request.url`      | string                 | required         | —       | Full URL or path                                                                                             |
| `request.headers`  | object (string→string) | required         | `{}`    | Request headers                                                                                              |
| `request.body`     | string                 | required         | `""`    | Request body                                                                                                 |
| `response.headers` | object                 | optional         | —       | CDN only — mock origin response headers                                                                      |
| `response.body`    | string                 | optional         | —       | CDN only — mock origin response body                                                                         |
| `properties`       | object                 | required         | `{}`    | CDN property key/value pairs (e.g. `"request.country": "US"`)                                                |
| `dotenv`           | object                 | optional         | `{}`    | Dotenv configuration: `{ enabled: boolean, path?: string }`                                                  |
| `logLevel`         | integer 0–4            | optional         | `0`     | 0=trace, 1=debug, 2=info, 3=warn, 4=error                                                                    |

**Note on `response`**: only relevant for CDN (proxy-wasm) apps. Provides the mock origin response that the WASM filter can inspect and modify. Omit for HTTP-WASM apps.

---

## Runtime Secrets and Env Vars via Dotenv

`envVars` and secrets are NOT fields in `fastedge-config.test.json`. They are injected at runtime from dotenv files.

**Option A — single `.env` file with prefixes:**

```
FASTEDGE_VAR_ENV_API_URL=https://api.example.com
FASTEDGE_VAR_SECRET_JWT_KEY=my-secret
FASTEDGE_VAR_REQ_HEADER_X_CUSTOM=value
FASTEDGE_VAR_RSP_HEADER_CACHE_CONTROL=no-store
```

**Option B — separate files (no prefix needed):**

- `.env.variables` → env vars
- `.env.secrets` → secrets
- `.env.req_headers` → request headers
- `.env.rsp_headers` → response headers

**Priority order (highest to lowest):**

1. Direct `RunnerConfig` values
2. `.env` (prefixed)
3. `.env.variables` / `.env.secrets` / `.env.req_headers` / `.env.rsp_headers`
4. `fastedge-config.test.json` fallback

---

## CDN Example

```json
{
  "$schema": "./node_modules/@gcoredev/fastedge-test/schemas/fastedge-config.test.schema.json",
  "description": "CDN geo-filter app",
  "wasm": {
    "path": "./dist/filter.wasm",
    "description": "Geo-filter proxy-wasm binary"
  },
  "request": {
    "method": "GET",
    "url": "https://example.com/page",
    "headers": {
      "User-Agent": "Mozilla/5.0"
    },
    "body": ""
  },
  "response": {
    "headers": {
      "Content-Type": "text/html"
    },
    "body": "<html>Original content</html>"
  },
  "properties": {
    "request.country": "US",
    "client.ip": "1.2.3.4"
  },
  "dotenv": { "enabled": true },
  "logLevel": 0
}
```

---

## HTTP-WASM Example

```json
{
  "$schema": "./node_modules/@gcoredev/fastedge-test/schemas/fastedge-config.test.schema.json",
  "description": "HTTP API handler",
  "wasm": {
    "path": "./dist/app.wasm",
    "description": "HTTP-WASM binary"
  },
  "request": {
    "method": "GET",
    "url": "http://localhost/api/hello",
    "headers": {},
    "body": ""
  },
  "properties": {},
  "dotenv": { "enabled": true },
  "logLevel": 0
}
```

---

## What to Commit / Gitignore

**Commit:**

- `fastedge-config.test.json` — use placeholder values for any sensitive fields
- `.env.example` — document expected variable names, no real values

**Gitignore:**

```
.env
.env.*
!.env.example
```
