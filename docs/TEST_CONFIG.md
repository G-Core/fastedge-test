# Test Configuration

Configuration file reference for `fastedge-config.test.json` — the per-test JSON file that defines the WASM binary, request, CDN properties, client and edge context, origin, and dotenv loading for a single test scenario — and for the resource config file, which runs several apps on one request.

## Overview

Each test scenario is described by a `fastedge-config.test.json` file. The file is validated against a JSON Schema at load time. `loadConfigFile` applies Zod defaults at runtime, and the JSON Schema declares the same `default` values, so fields with defaults do not need to be present in the file.

The config schema is a union of two variants selected by `appType`:

- **`proxy-wasm`** (CDN mode, default): The WASM module intercepts an upstream HTTP request. Uses `request.url` (full URL). The response is generated at runtime — by a real fetch against `request.url`, by the built-in responder when `request.url === "built-in"`, or from the optional [`origin`](#origin-cdn). There is no fixture-level mock response.
- **`http-wasm`**: The WASM module acts as an origin HTTP server. Uses `request.path` (path only).

A separate file format, the [resource config](#resource-configuration), describes several apps running on one CDN request. It is documented in its own section.

**Required fields** (per the JSON Schema `required` arrays):

- `proxy-wasm` variant: `request`; within `request`: `url`
- `http-wasm` variant: `appType`, `request`; within `request`: `path`
- Within `wasm` (when present): `path`
- Within `origin`: `url` in the `{ url }` form, `builtIn` in the `{ builtIn }` form

**Defaults**: `appType` (`"proxy-wasm"`, CDN variant only), `request.method` (`"GET"`), `request.headers` (`{}`), `request.body` (`""`) and `properties` (`{}`) have defaults and are not in any `required` array. Omitting them passes both editor validation and `loadConfigFile`. `appType: "http-wasm"` has no default and must be specified for HTTP-WASM configs.

## Schema Reference

### Fields

| JSON Path                 | Type      | Required          | Default        | Description                                                                           |
| ------------------------- | --------- | ----------------- | -------------- | ------------------------------------------------------------------------------------- |
| `$schema`                 | `string`  | No                | —              | URI of the JSON Schema file, used for IDE autocompletion and validation.              |
| `description`             | `string`  | No                | —              | Human-readable label for this test scenario.                                          |
| `wasm`                    | `object`  | No                | —              | WASM binary configuration.                                                            |
| `wasm.path`               | `string`  | If `wasm` present | —              | Path to the compiled `.wasm` binary.                                                  |
| `wasm.description`        | `string`  | No                | —              | Human-readable label for the WASM binary.                                             |
| `appType`                 | `string`  | Yes (HTTP-WASM)   | `"proxy-wasm"` | `"proxy-wasm"` (CDN, the default) or `"http-wasm"`. HTTP-WASM has no default.         |
| `httpPort`                | `integer` | No                | —              | HTTP-WASM only. Pins the `fastedge-run` port (1024–65535) instead of pool allocation. |
| `request`                 | `object`  | Yes               | —              | Incoming HTTP request to simulate.                                                    |
| `request.method`          | `string`  | No                | `"GET"`        | HTTP method (e.g. `"GET"`, `"POST"`).                                                 |
| `request.url`             | `string`  | Yes (CDN)         | —              | Full URL the client asked for (CDN only). `"built-in"` selects the local responder.   |
| `request.path`            | `string`  | Yes (HTTP-WASM)   | —              | Request path, e.g. `"/api/submit"` (HTTP-WASM only).                                  |
| `request.headers`         | `object`  | No                | `{}`           | Request headers. Keys and values must be strings.                                     |
| `request.body`            | `string`  | No                | `""`           | Request body as a plain string.                                                       |
| `properties`              | `object`  | No                | `{}`           | CDN properties passed to the WASM context. Values may be any JSON type.               |
| `dotenv`                  | `object`  | No                | —              | Dotenv file loading configuration.                                                    |
| `dotenv.enabled`          | `boolean` | No                | `false`        | Whether to load dotenv files.                                                         |
| `dotenv.path`             | `string`  | No                | —              | Directory containing the dotenv files (not a file).                                   |
| `stores`                  | `boolean` | No                | `true`         | Enables the local cache and Edge KV. `false`: CDN cache / KV calls fail; HTTP apps use fastedge-run's own per-process cache. |
| `dc`                      | `string`  | No                | `"local"`      | Cache bucket name. Runners with the same `dc` share cache entries.                    |
| `client`                  | `object`  | No                | —              | Where the client is: a preset plus overrides.                                         |
| `client.preset`           | `string`  | No                | —              | Preset: `"de"`, `"nl"` or `"us"`.                                                     |
| `client.ip`               | `string`  | No                | —              | Client IP address.                                                                    |
| `client.asn`              | `string`  | No                | —              | Client ASN.                                                                           |
| `client.country`          | `string`  | No                | —              | Client country code.                                                                  |
| `client.countryName`      | `string`  | No                | —              | Client country name.                                                                  |
| `client.city`             | `string`  | No                | —              | Client city.                                                                          |
| `client.region`           | `string`  | No                | —              | Client region.                                                                        |
| `client.continent`        | `string`  | No                | —              | Client continent.                                                                     |
| `client.lat`              | `string`  | No                | —              | Client latitude.                                                                      |
| `client.long`             | `string`  | No                | —              | Client longitude.                                                                     |
| `edge`                    | `object`  | No                | —              | Which edge POP runs the app: a preset plus overrides.                                 |
| `edge.preset`             | `string`  | No                | —              | Preset: `"de"`, `"nl"` or `"us"`.                                                     |
| `edge.dc`                 | `string`  | No                | —              | POP data center; the cache bucket unless top-level `dc` is set.                       |
| `edge.region`             | `string`  | No                | —              | Edge POP region.                                                                      |
| `edge.country`            | `string`  | No                | —              | Edge POP country.                                                                     |
| `edge.city`               | `string`  | No                | —              | Edge POP city.                                                                        |
| `edge.hostname`           | `string`  | No                | —              | Edge POP hostname.                                                                    |
| `edge.popLat`             | `string`  | No                | —              | POP latitude.                                                                         |
| `edge.popLong`            | `string`  | No                | —              | POP longitude.                                                                        |
| `edge.popReg`             | `string`  | No                | —              | POP region.                                                                           |
| `edge.popCity`            | `string`  | No                | —              | POP city.                                                                             |
| `edge.popContinent`       | `string`  | No                | —              | POP continent.                                                                        |
| `edge.popCountryCode`     | `string`  | No                | —              | POP country code.                                                                     |
| `edge.popCountryName`     | `string`  | No                | —              | POP country name.                                                                     |
| `origin`                  | `object`  | No                | —              | CDN only. Where the response comes from: `{ "url" }` or `{ "builtIn" }`.              |
| `origin.url`              | `string`  | Yes (`url`)       | —              | Origin URL. `"built-in"` selects the built-in responder.                              |
| `origin.builtIn`          | `object`  | Yes (`builtIn`)   | —              | Declared response: a fixed response or a folder served by request path.               |
| `origin.builtIn.status`   | `integer` | No                | —              | Response status, 100–599. Not allowed together with `files`.                          |
| `origin.builtIn.headers`  | `object`  | No                | —              | Response headers. Names must be valid header names; values cannot hold CR, LF or NUL. |
| `origin.builtIn.body`     | `string`  | No                | —              | Response body string. At most one of `body`, `bodyFile` and `files`.                  |
| `origin.builtIn.bodyFile` | `string`  | No                | —              | File whose bytes are the body. Relative to the config file.                           |
| `origin.builtIn.files`    | `string`  | No                | —              | Folder served by request path. Relative to the config file.                           |

The schema rejects unrecognised fields in `client`, `edge`, `origin` and `origin.builtIn`. `dc` must be a non-empty string. `client` and `edge` values are all strings, including `lat`, `long`, `popLat`, and `popLong`.

### Required vs. Default Distinction

The JSON Schema `required` arrays drive editor validation. Fields that carry a `default` in the schema (`request.method`, `request.headers`, `request.body`, `properties`, and `appType` on the CDN variant) are not listed in those arrays, so a validator does not flag them when they are missing. The Zod schema fills in their defaults (`"GET"`, `{}`, `""`, `{}` and `"proxy-wasm"`), so `loadConfigFile` accepts configs that omit them.

`appType` is required in the `http-wasm` variant and has no default. A config without `appType` is validated as a CDN (`proxy-wasm`) config.

`request.url` (CDN) and `request.path` (HTTP-WASM) are required and have no default.

### Client and Edge Context

`client` describes where the request comes from, and `edge` describes which edge POP runs the app. Each takes a `preset` (`"de"`, `"nl"` or `"us"`) plus per-field overrides. Explicit `properties` and request headers take precedence over values derived from `client` and `edge`.

`edge.dc` is the cache bucket unless the top-level `dc` is set. Runners that resolve to the same bucket share cache entries.

```json
{
  "$schema": "./node_modules/@gcoredev/fastedge-test/schemas/fastedge-config.test.schema.json",
  "appType": "proxy-wasm",
  "wasm": {
    "path": "./dist/handler.wasm"
  },
  "request": {
    "url": "built-in"
  },
  "client": {
    "preset": "de",
    "ip": "203.0.113.7"
  },
  "edge": {
    "preset": "nl",
    "city": "Amsterdam"
  }
}
```

### Origin (CDN)

`origin` is available in `proxy-wasm` configs. It sets where the response comes from, separately from the URL the client asked for.

- **`origin` unset**: the response comes from `request.url` — a real fetch, or the built-in responder when `request.url` is `"built-in"`.
- **`origin` set**: `request.url` is only what the client asked for. The request's path and query go to the origin, as in a resource.

`origin` takes one of two forms:

- `{ "url": string }`: a URL to fetch. `"built-in"` selects the built-in responder.
- `{ "builtIn": { ... } }`: a declared built-in response. Either a fixed response (`status`, `headers`, and one of `body` or `bodyFile`), or a folder served by request path (`files`).

Rules for `builtIn`:

- Set at most one of `body`, `bodyFile` and `files`.
- `files` sets the status itself (200, or 404 for a missing file), so it cannot be combined with `status`.
- With `files`, `GET /a/b.png` answers with `<folder>/a/b.png`. The extension gives the content type. Dotfiles are never served. `"."` is the config file's own folder.
- `bodyFile` is a file whose bytes are the body (binary is fine); its extension gives the content type.
- `bodyFile` and `files` are relative to the config file.
- A declared `builtIn` response takes precedence over the request's `x-debugger-*` headers.

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

`httpPort` is an optional integer field (1024–65535) available only in HTTP-WASM configs (`appType: "http-wasm"`). It pins the `fastedge-run` subprocess to a fixed port instead of allocating one from the dynamic pool (8100–8199). The field is defined only in the `http-wasm` variant; proxy-wasm configs do not use it.

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

Pinning a port inside the 8100–8199 dynamic pool is allowed by the schema but risks collisions with dynamic allocations made by other debug sessions. For production-like or shared setups, choose a port outside the pool (e.g. 8250).

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
    "path": "/health"
  },
  "httpPort": 8250
}
```

## Resource Configuration

A resource config file describes a CDN resource with several apps on one request, as configured on the edge. The default location is `.fastedge-debug/fastedge-cdn-resource.test.json` at the workspace root. `main` assigns an app to each hook and sets the origin. Rules override the hooks and/or the origin for requests whose path matches. The file is separate from `fastedge-config.test.json` and has no `appType`; every app in it is a CDN (proxy-wasm) app, except an HTTP app used as the origin.

All paths in the file (`apps.<name>.config`, `apps.<name>.wasm`, `apps.<name>.dotenv.path`) are relative to the resource config file. In the debugger, every file the resource references must be inside the workspace, so debug a multi-project resource from a folder that holds all of its apps.

### Resource Fields

| JSON Path                      | Type                 | Required | Default   | Description                                                                                     |
| ------------------------------ | -------------------- | -------- | --------- | ----------------------------------------------------------------------------------------------- |
| `$schema`                      | `string`             | No       | —         | URI of the JSON Schema file.                                                                    |
| `description`                  | `string`             | No       | —         | Human-readable label for the resource.                                                          |
| `apps`                         | `object`             | Yes      | —         | Map of app name to app definition. Hooks and origins refer to apps by these names.              |
| `apps.<name>.config`           | `string`             | No       | —         | Another project's `fastedge-config.test.json`. Its `wasm` and `dotenv` are used.                |
| `apps.<name>.wasm`             | `string`             | No       | —         | Path to the built `.wasm`. Overrides the `wasm` of the referenced config.                       |
| `apps.<name>.dotenv`           | `object`             | No       | —         | Dotenv loading for this app. Same fields and rules as [`dotenv`](#dotenv-configuration).        |
| `apps.<name>.dotenv.enabled`   | `boolean`            | No       | `false`   | Whether to load dotenv files for this app.                                                      |
| `apps.<name>.dotenv.path`      | `string`             | No       | —         | Directory containing the dotenv files for this app.                                             |
| `main`                         | `object`             | Yes      | —         | Default hooks and origin for requests that match no rule.                                       |
| `main.hooks`                   | `object`             | No       | `{}`      | App for each hook.                                                                              |
| `main.hooks.onRequestHeaders`  | `string` or `object` | No       | —         | App name, or `{ app, interruptOnError }`.                                                       |
| `main.hooks.onRequestBody`     | `string` or `object` | No       | —         | App name, or `{ app, interruptOnError }`.                                                       |
| `main.hooks.onResponseHeaders` | `string` or `object` | No       | —         | App name, or `{ app, interruptOnError }`.                                                       |
| `main.hooks.onResponseBody`    | `string` or `object` | No       | —         | App name, or `{ app, interruptOnError }`.                                                       |
| `main.origin`                  | `object`             | Yes      | —         | `{ "url" }`, `{ "builtIn" }` or `{ "app" }`. See [Origin](#origin).                             |
| `rules`                        | `array`              | No       | `[]`      | Ordered rules. The first rule whose `match` matches the request path applies.                   |
| `rules[].name`                 | `string`             | No       | —         | Label for the rule.                                                                             |
| `rules[].match`                | `string`             | Yes      | —         | Regular expression tested against the request path.                                             |
| `rules[].hooks`                | `object`             | No       | —         | Same shape as `main.hooks`. When set, replaces the hooks of `main` completely.                  |
| `rules[].origin`               | `object`             | No       | —         | Same shape as `main.origin`. When set, replaces the origin of `main`.                           |
| `properties`                   | `object`             | No       | `{}`      | CDN properties passed to the apps. Values may be any JSON type.                                 |
| `stores`                       | `boolean`            | No       | `true`    | Enables the local cache and Edge KV. `false`: CDN cache / KV calls fail; HTTP apps use fastedge-run's own per-process cache. |
| `dc`                           | `string`             | No       | `"local"` | Cache bucket name; must be non-empty.                                                           |
| `client`                       | `object`             | No       | —         | Where the client is. Same fields as [`client`](#client-and-edge-context).                       |
| `edge`                         | `object`             | No       | —         | Which edge POP runs the apps. Same fields as [`edge`](#client-and-edge-context).                |
| `request`                      | `object`             | No       | —         | The request to simulate. Same fields as the CDN `request` (`method`, `url`, `headers`, `body`). |

Unrecognised fields fail validation in `apps.<name>`, `main`, `main.hooks`, `main.origin`, each rule, and the hook object form. An app on a hook must be a proxy-wasm app; an origin `app` must be an HTTP app.

### Hook Apps

Each hook takes an app name from `apps`, or an object:

| Field              | Type      | Required | Default | Description                                                                                                                              |
| ------------------ | --------- | -------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `app`              | `string`  | Yes      | —       | Name of an entry in `apps`.                                                                                                              |
| `interruptOnError` | `boolean` | No       | `true`  | On a hook error, `true` ends the request with status 531; `false` lets the request go on as if the hook had not run (matching the edge). |

### Origin

`origin` is one of:

- `{ "url": string }` — a URL to fetch. `"built-in"` selects the built-in responder (no network).
- `{ "builtIn": { ... } }` — a declared built-in response. Same fields and rules as [`origin.builtIn`](#origin-cdn); paths are relative to the resource config file.
- `{ "app": string }` — an HTTP app from `apps` that acts as the origin.

### Rules

Rules are checked in order against the request path. The first rule whose `match` regular expression matches applies. If it sets `hooks`, those hooks replace `main.hooks` completely (hooks not listed in the rule do not run). If it sets `origin`, that origin replaces `main.origin`. A field the rule omits keeps the value from `main`.

### Resource Example

```json
{
  "$schema": "./node_modules/@gcoredev/fastedge-test/schemas/resource-config.schema.json",
  "description": "Auth app on request headers, rewrite app on response body",
  "apps": {
    "auth": {
      "config": "./auth/fastedge-config.test.json"
    },
    "rewrite": {
      "wasm": "./rewrite/dist/rewrite.wasm",
      "dotenv": { "enabled": true, "path": "./rewrite/fixtures" }
    }
  },
  "main": {
    "hooks": {
      "onRequestHeaders": "auth",
      "onResponseBody": { "app": "rewrite", "interruptOnError": false }
    },
    "origin": { "url": "built-in" }
  },
  "rules": [
    {
      "name": "public assets skip auth",
      "match": "^/public/",
      "hooks": {
        "onResponseBody": "rewrite"
      }
    }
  ],
  "request": {
    "method": "GET",
    "url": "https://example.com/account"
  }
}
```

## Examples

### Minimal CDN Configuration

The smallest config that passes JSON Schema validation: `request.url` is the only required field of the CDN variant. `appType` defaults to `"proxy-wasm"` and is included here for clarity.

```json
{
  "$schema": "./node_modules/@gcoredev/fastedge-test/schemas/fastedge-config.test.schema.json",
  "appType": "proxy-wasm",
  "wasm": {
    "path": "./dist/handler.wasm"
  },
  "request": {
    "url": "https://example.com/"
  }
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

An HTTP-WASM scenario simulating a `POST` request with a JSON body. `appType` must be `"http-wasm"` — there is no default for this variant. Use `request.path` (not `request.url`); the WASM module acts as the origin server and receives only the path portion of the request.

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
  }
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
    "url": "built-in"
  },
  "properties": {
    "CACHE_TTL": 86400
  }
}
```

The default built-in response is a full JSON echo of the request. The `x-debugger-*` request headers (deprecated) change it: `x-debugger-status` sets the HTTP status; `x-debugger-content: status-only` omits the body; `x-debugger-content: body-only` echoes only the request body (with its inferred content-type).

To declare the response in the config instead, set `origin.builtIn`. It takes precedence over the `x-debugger-*` headers, and `request.url` stays the URL the client asked for:

```json
{
  "$schema": "./node_modules/@gcoredev/fastedge-test/schemas/fastedge-config.test.schema.json",
  "description": "CDN handler against a declared 404 response",
  "appType": "proxy-wasm",
  "wasm": {
    "path": "./dist/handler.wasm"
  },
  "request": {
    "url": "https://example.com/api/missing"
  },
  "origin": {
    "builtIn": {
      "status": 404,
      "headers": {
        "content-type": "application/json"
      },
      "body": "{\"error\": \"not found\"}"
    }
  }
}
```

To serve a folder by request path, use `files` instead of `status` and `body`:

```json
{
  "$schema": "./node_modules/@gcoredev/fastedge-test/schemas/fastedge-config.test.schema.json",
  "appType": "proxy-wasm",
  "wasm": {
    "path": "./dist/handler.wasm"
  },
  "request": {
    "url": "https://example.com/images/logo.png"
  },
  "origin": {
    "builtIn": {
      "files": "./fixtures/origin"
    }
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

The schema file is included in the published package at `schemas/fastedge-config.test.schema.json`. The path in `$schema` should be relative to the config file's location. Resource config files use `schemas/resource-config.schema.json` the same way.

**VSCode**: No additional extensions are needed. The built-in JSON language server resolves `$schema` automatically. You get:

- Field name autocompletion
- Type validation (e.g. strings vs. objects)
- Inline documentation on hover
- Errors for unrecognised fields in `client`, `edge`, `origin` and `origin.builtIn`

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

`loadConfigFile` reads the file, parses JSON, and validates it through the Zod schema (applying defaults). It throws a descriptive `Error` if the file cannot be read, is not valid JSON, or fails schema validation. A relative `dotenv.path` in the returned config is resolved to an absolute path against the config file's directory. The `bodyFile` and `files` paths of a CDN `origin.builtIn` are resolved against that directory too.

The returned `TestConfig` type is a union discriminated by `appType`:

```typescript
type TestConfig = CdnConfig | HttpConfig;

type ContextPreset = "de" | "nl" | "us";

type ClientContext = {
  preset?:      ContextPreset;
  ip?:          string;
  asn?:         string;
  country?:     string;
  countryName?: string;
  city?:        string;
  region?:      string;
  continent?:   string;
  lat?:         string;
  long?:        string;
};

type EdgeContext = {
  preset?:         ContextPreset;
  dc?:             string;
  region?:         string;
  country?:        string;
  city?:           string;
  hostname?:       string;
  popLat?:         string;
  popLong?:        string;
  popReg?:         string;
  popCity?:        string;
  popContinent?:   string;
  popCountryCode?: string;
  popCountryName?: string;
};

type BuiltInOrigin = {
  status?:   number;                       // 100–599; not with files
  headers?:  Record<string, string>;
  body?:     string;                       // at most one of body, bodyFile, files
  bodyFile?: string;
  files?:    string;
};

type Origin = { url: string } | { builtIn: BuiltInOrigin };

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
  origin?:     Origin;                     // where the response comes from
  properties: Record<string, unknown>;     // default: {}
  dotenv?: {
    enabled?: boolean;
    path?:    string;                      // directory containing the dotenv files
  };
  stores?: boolean;                        // local cache and Edge KV; on by default
  dc?:     string;                         // cache bucket; default "local"
  client?: ClientContext;
  edge?:   EdgeContext;
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
  stores?: boolean;                        // local cache and Edge KV; on by default
  dc?:     string;                         // cache bucket; default "local"
  client?: ClientContext;
  edge?:   EdgeContext;
};
```

Use `appType` to narrow the union before accessing variant-specific fields:

```typescript
import { loadConfigFile } from "@gcoredev/fastedge-test/test";

const config = await loadConfigFile("./fastedge-config.test.json");

if (config.appType === "proxy-wasm") {
  console.log(config.request.url);   // string — CDN full URL
  console.log(config.origin);        // Origin | undefined
} else {
  console.log(config.request.path);  // string — HTTP-WASM path
  console.log(config.httpPort);      // number | undefined
}
```

`loadConfigFile` loads `fastedge-config.test.json` files only; it does not load resource config files.

## See Also

- [TEST_FRAMEWORK.md](./TEST_FRAMEWORK.md) — using `loadConfigFile` in test suites, `runFlow`, and the full test framework API
- [API.md](./API.md) — `GET /api/config` and `POST /api/config` REST endpoints for reading and writing config at runtime
- [RUNNER.md](./RUNNER.md) — runner configuration and WASM execution options
