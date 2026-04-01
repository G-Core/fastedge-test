# Built-In Responder

**Status**: Complete
**Last Updated**: April 1, 2026

---

## Overview

The built-in responder generates a local origin response inside the CDN proxy-wasm runner, eliminating the need to spawn an external HTTP service (like `http-responder`) for tests that only care about WASM hook behavior.

**Trigger**: Pass `"built-in"` (shorthand) or `"http://fastedge-builtin.debug"` (canonical URL) as the target URL.

The shorthand `"built-in"` is normalised to `http://fastedge-builtin.debug` early in the runner so all downstream code (URL parsing, pseudo-header derivation, property extraction) works with a valid URL. The canonical URL is defined as `BUILTIN_URL` and the shorthand as `BUILTIN_SHORTHAND` in `server/runner/ProxyWasmRunner.ts`, re-exported from `server/runner/index.ts`.

---

## URL Normalisation Flow

```
Developer types "built-in"
        ↓
API schema (Zod) accepts z.union([z.literal("built-in"), z.string().url()])
        ↓
callFullFlowLegacy() substitutes → "http://fastedge-builtin.debug"
        ↓
extractRuntimePropertiesFromUrl() parses valid URL (host=fastedge-builtin.debug, path=/)
        ↓
Pseudo-headers derived (:authority, :path, :scheme, :method)
        ↓
Host header auto-injected from URL
        ↓
WebSocket "request_started" event sends canonical URL back to UI
        ↓
UI URL bar updates to "http://fastedge-builtin.debug" (server is single source of truth)
```

After the first send, the UI shows the canonical URL. Subsequent sends use either form — both trigger the built-in responder.

---

## Control Headers

Two request headers control the built-in responder's behavior. They are read from the modified request headers **after** `onRequestBody` completes (so WASM can set them dynamically). Both are stripped before building the response.

| Header | Values | Default | Behavior |
|--------|--------|---------|----------|
| `x-debugger-status` | Any HTTP status code | `200` | Sets the response status code |
| `x-debugger-content` | `"body-only"`, `"status-only"` | full JSON echo | Controls response body format |

**Why `x-debugger-*`?** Avoids collision with application headers. The `x-response-*` prefix was considered but rejected as too likely to clash with developer-defined headers.

Both headers are available as unchecked defaults in the proxy-wasm request headers UI panel (`ProxyWasmView.tsx` `defaultHeaders`), so developers can discover and enable them without typing.

---

## Response Modes

### Default (full JSON echo)

No `x-debugger-content` header, or any unrecognized value.

```json
{
  "method": "GET",
  "reqHeaders": { "host": "fastedge-builtin.debug", "x-custom": "value" },
  "reqBody": "",
  "requestUrl": "http://fastedge-builtin.debug"
}
```

Response `Content-Type`: `application/json`

Similar to the `http-responder` test app but without the `"hello": "http-responder works!"` field.

### `body-only`

Returns the request body as-is as the response body. `Content-Type` is mirrored from the request's `content-type` header (falls back to `text/plain`).

Use case: testing WASM apps that transform content (HTML, XML, etc.) without needing a real origin.

### `status-only`

Returns an empty body with the specified status code. `Content-Type`: `text/plain`.

Use case: testing WASM error-handling hooks (e.g., how the app reacts to 404, 500) without a real origin.

---

## How It Works

**Location**: `server/runner/ProxyWasmRunner.ts`, inside `callFullFlowLegacy()`.

The hook flow is unchanged — all four hooks fire normally:

```
onRequestHeaders  ->  onRequestBody  ->  [built-in response]  ->  onResponseHeaders  ->  onResponseBody
```

The built-in responder replaces only the origin fetch (between `onRequestBody` and `onResponseHeaders`). The response variables (`responseHeaders`, `responseBody`, `responseStatus`, etc.) are set by the built-in logic instead of `fetch()`, then the shared response hook code runs identically.

---

## Key Implementation Details

- **Constants**: `BUILTIN_URL = "http://fastedge-builtin.debug"` and `BUILTIN_SHORTHAND = "built-in"` in `ProxyWasmRunner.ts`
- **Detection**: `isBuiltIn` flag matches both the shorthand and canonical URL
- **API validation**: `server/schemas/api.ts` — `ApiSendBodySchema` uses `z.union([z.literal("built-in"), z.string().url()])` to accept the shorthand
- **Test framework**: `server/test-framework/suite-runner.ts` — `runFlow()` normalises the shorthand before pseudo-header derivation, with a clear error message for invalid URLs
- **UI defaults**: `x-debugger-status` and `x-debugger-content` appear as unchecked default headers in the proxy-wasm request panel

---

## Usage

### In Integration Tests

```typescript
const result = await runFlow(cdnRunner, {
  url: 'built-in',
  method: 'POST',
  requestHeaders: {
    'content-type': 'application/json',
    'x-debugger-status': '201',
    'x-debugger-content': 'body-only',
  },
  requestBody: JSON.stringify({ data: 'test' }),
});
```

### Via the API

```json
POST /api/send
{
  "url": "built-in",
  "request": {
    "method": "GET",
    "headers": { "x-debugger-status": "404" }
  }
}
```

### Performance

Built-in responder tests complete in ~46ms vs ~7340ms for downstream HTTP app tests (160x faster). No port allocation, no process spawning, no network I/O.

---

## Test Coverage

**File**: `server/__tests__/integration/cdn-apps/full-flow/built-in-responder.test.ts` (8 tests)

1. Default full JSON echo
2. `x-debugger-*` headers stripped from echo
3. `x-debugger-status` sets response status
4. `body-only` mode echoes request body with mirrored content-type
5. `status-only` mode returns empty body
6. All four hooks execute
7. WASM-injected response headers present
8. WASM-injected request headers appear in echo

---

## Which Tests Use http-responder vs Built-In

| Test File | Origin | Why |
|-----------|--------|-----|
| `full-flow/built-in-responder.test.ts` | Built-in | Testing WASM hook behavior, no real origin needed |
| `full-flow/headers-change-with-downstream.test.ts` | http-responder | Validates real HTTP fetch + header forwarding through network stack |
| `http-call/all-hooks-http-call.test.ts` | http-responder | `proxy_http_call` from within WASM — different mechanism (WASM initiates the call, not the runner) |

The downstream tests (`headers-change-with-downstream`) could be migrated to `"built-in"` for speed, but keeping them validates the real fetch path for production parity.
