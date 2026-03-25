# send_http_response (Local Response Short-Circuit)

**Status**: ✅ Complete — Runner support + CDN redirect test app + 5 integration tests
**Last Updated**: March 24, 2026

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

1. **`HostFunctions.ts`**: `proxy_send_local_response` stores the response in `localResponse` state
2. **`ProxyWasmRunner.ts:279`**: After `onRequestHeaders`, if `returnCode === 1` (StopIteration) AND `hasLocalResponse()` is true:
   - Reads the local response (status, statusText, body)
   - Merges response headers from the hook's output
   - Returns `FullFlowResult` immediately — **no origin fetch, no onRequestBody/onResponseHeaders/onResponseBody**
3. Same check at **`ProxyWasmRunner.ts:328`** after `onRequestBody`

### Key Files

| File | Role |
|------|------|
| `server/runner/HostFunctions.ts:58-161` | `localResponse` state, `proxy_send_local_response` impl, `hasLocalResponse()`/`getLocalResponse()`/`resetLocalResponse()` |
| `server/runner/ProxyWasmRunner.ts:279-295` | Short-circuit after `onRequestHeaders` |
| `server/runner/ProxyWasmRunner.ts:328-345` | Short-circuit after `onRequestBody` |

---

## Test Application: cdn-redirect

**Path**: `test-applications/cdn-apps/cdn-redirect/`
**WASM Output**: `wasm/cdn-apps/redirect/redirect.wasm`

A simple CDN app that reads `x-redirect-url` from the request header and returns a 302 redirect:

- If `x-redirect-url` header is present: sets `Location` response header, calls `send_http_response(302, "Found", empty, [])`, returns `StopIteration`
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
