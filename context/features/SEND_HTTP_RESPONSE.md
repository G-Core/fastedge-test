# send_http_response (Local Response Short-Circuit)

**Status**: ✅ Complete — Runner support + additionalHeaders merge + CDN redirect test app + 5 integration tests
**Last Updated**: May 18, 2026

---

## Overview

`send_http_response` allows a CDN proxy-wasm app to return a response directly from a hook (e.g., `onRequestHeaders`) without contacting the origin server. The runner short-circuits the normal flow — no origin fetch, no subsequent hooks.

This is the CDN equivalent of returning an early response (redirects, auth failures, cached responses, etc.) without forwarding to upstream.

---

## How It Works

### WASM Side (AssemblyScript)

```typescript
import { send_http_response, stream_context, FilterHeadersStatusValues } from "@gcoredev/proxy-wasm-sdk-as/assembly";

onRequestHeaders(a: u32, end_of_stream: bool): FilterHeadersStatusValues {
  // Set response headers via stream_context
  stream_context.headers.response.add("location", "https://example.com");

  // Send local response — maps to proxy_send_local_response ABI call
  send_http_response(302, "Found", new ArrayBuffer(0), []);

  // StopIteration tells the runner not to continue the hook chain
  return FilterHeadersStatusValues.StopIteration;
}
```

`send_http_response(statusCode, statusText, body, additionalHeaders)` calls the `proxy_send_local_response` host function under the hood.

### Runner Side (ProxyWasmRunner)

The runner checks for a local response after each request-phase hook:

1. **`HostFunctions.ts`**: `proxy_send_local_response` stores the response in `localResponse` — includes `statusCode`, `statusText`, `body`, and **`headers`** (the `additionalHeaders` 4th argument, stored as `HeaderTuples` to preserve order and duplicate-name semantics).
2. **`ProxyWasmRunner.ts`**: After `onRequestHeaders`, if `returnCode === 1` (StopIteration) AND `hasLocalResponse()` is true:
   - Reads `local.headers` from `localResponse`
   - **Merges two header sources** via `HeaderManager.appendMerge`:
     - Left/base: headers accumulated via `stream_context.headers.response.add/set()` during the hook (`hookResult.output.response.headers`)
     - Right/overlay: `additionalHeaders` from `send_http_response()` (`local.headers`)
   - Returns `FullFlowResult` immediately — **no origin fetch, no onRequestBody/onResponseHeaders/onResponseBody**
3. Same merge at the post-`onRequestBody` short-circuit.

**Why two sources?** The proxy-wasm pattern is to set headers via `stream_context` in the hook body, then call `send_http_response` with an empty `[]` for `additionalHeaders`. But the ABI equally supports passing headers directly as the 4th argument (e.g. `send_http_response(401, "Unauthorized", body, [["WWW-Authenticate", "API-Key"]])`). Both paths now reach `finalResponse.headers`.

### Key Files

| File | Role |
|------|------|
| `server/runner/HostFunctions.ts` | `localResponse` state (includes `headers: HeaderTuples`), `proxy_send_local_response` impl, `hasLocalResponse()`/`getLocalResponse()`/`resetLocalResponse()` |
| `server/runner/ProxyWasmRunner.ts` | Short-circuit after `onRequestHeaders` + after `onRequestBody`; `appendMerge` of stream_context headers with additionalHeaders |

---

## Test Application: cdn-redirect

**Path**: `test-applications/cdn-apps/cdn-redirect/`
**WASM Output**: `wasm/cdn-apps/redirect/redirect.wasm`

A simple CDN app that reads `x-redirect-url` from the request header and returns a 302 redirect:

- If `x-redirect-url` header is present: calls `send_http_response(302, "Found", empty, [["location", url]])`, returns `StopIteration` — the `Location` header is passed as `additionalHeaders` (the 4th argument), directly exercising the header-merge path
- If absent: returns `Continue` (normal flow — allows testing both paths)

### Build

```bash
cd test-applications/cdn-apps/cdn-redirect
pnpm run build  # compiles AS → copies to wasm/cdn-apps/redirect/
```

---

## Integration Tests

**Path**: `server/__tests__/integration/cdn-apps/redirect/cdn-redirect.test.ts`
**Tests**: 5

| Test | What It Verifies |
|------|-----------------|
| 302 + Location header | `assertFinalStatus(result, 302)` + `assertFinalHeader(result, 'location', ...)` |
| Short-circuit (no origin fetch) | Only `onRequestHeaders` in `hookResults` — onRequestBody/onResponseHeaders/onResponseBody undefined |
| StopIteration return code | `assertReturnCode(result.hookResults.onRequestHeaders, 1)` |
| Normal flow without redirect | `returnCode === 0` when `x-redirect-url` absent |
| Empty body on redirect | `result.finalResponse.body === ''` |

### Dogfooding the Test Framework

These tests use `runFlow()` + framework assertions instead of raw `callFullFlow()` + vitest `expect()`:

```typescript
import { runFlow, assertFinalStatus, assertFinalHeader, assertReturnCode } from '../../../../test-framework';

const result = await runFlow(runner, {
  url: 'http://unused.test/',
  requestHeaders: { 'x-redirect-url': 'https://example.com/landing' },
});

assertFinalStatus(result, 302);
assertFinalHeader(result, 'location', 'https://example.com/landing');
assertReturnCode(result.hookResults.onRequestHeaders, 1);
```

This validates both the `send_http_response` feature AND the test framework API surface.

> **Note (May 18, 2026):** `cdn-redirect` was updated so the `Location` header is passed via `additionalHeaders` (4th arg of `send_http_response`) rather than via `stream_context.headers.response.add()`. The `assertFinalHeader(result, 'location', ...)` assertion therefore directly covers the additionalHeaders merge path — not just the stream_context path.
