# HTTP Callout (proxy_http_call) Implementation

**Status**: ✅ Complete
**Last Updated**: February 27, 2026

---

## Overview

`proxy_http_call` is the proxy-wasm HTTP callout ABI. It lets a WASM binary dispatch an async HTTP request from within a hook (e.g. `onRequestHeaders`) and resume execution once the response arrives. This is the core mechanism for "side-car" patterns where CDN edge code calls a backend API during request processing.

The debugger implements the full callout loop with production parity — WASM binaries that use `dispatch_http_call` run identically in the debugger and on the FastEdge CDN.

---

## How It Works (Host ↔ WASM Protocol)

```
WASM hook execution
  ↓
WASM calls proxy_http_call(upstream, headers, body, ...) → returns tokenId
  ↓
WASM hook returns Action::Pause (value 1)
  ↓
HOST: PAUSE loop detects pending http call
  ↓
HOST: performs actual HTTP fetch (Node.js fetch())
  ↓
HOST: calls proxy_on_http_call_response(contextId, tokenId, numHeaders, bodySize, 0)
                                         ↑ SAME WASM INSTANCE ↑
  ↓
WASM: reads response via proxy_get_header_map_pairs(HttpCallResponseHeaders)
       and proxy_get_buffer_bytes(HttpCallResponseBody, ...)
  ↓
WASM: calls proxy_continue_stream() or proxy_close_stream()
  ↓
HOST: re-runs the original hook on the SAME WASM instance
  ↓
WASM: hook now returns Action::Continue (0)
  ↓
PAUSE loop exits — callHook returns
```

**Critical invariant**: The WASM instance is NOT destroyed between step 2 and the final step. WASM code typically sets internal state (e.g. `self.state = 1`) in `on_http_call_response` and reads it on the second hook invocation. Instance continuity is what makes this possible.

---

## Enum Values

```typescript
// server/runner/types.ts
BufferType.HttpCallResponseBody     = 4
MapType.HttpCallResponseHeaders     = 6
MapType.HttpCallResponseTrailers    = 7
```

---

## Key Implementation Details

### 1. PAUSE Loop (`ProxyWasmRunner.ts` — `callHook`)

```
let returnCode = callIfExported(exportName, ...args);

while (returnCode === 1 /* PAUSE */ && hostFunctions.hasPendingHttpCall()) {
  // Get the pending call recorded by proxy_http_call
  pending = hostFunctions.takePendingHttpCall();

  // Build URL: :authority, :scheme, :path from pending.headers
  url = `${scheme}://${authority}${path}`;

  // HTTP fetch (real network call)
  resp = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(timeoutMs) });

  // Store response for WASM to read back
  hostFunctions.setHttpCallResponse(tokenId, responseHeaders, responseBodyBytes);

  // Call back into the SAME instance
  callIfExported('proxy_on_http_call_response', contextId, tokenId, numHeaders, bodySize, 0);

  if (hostFunctions.isStreamClosed()) break; // WASM called proxy_close_stream

  // Re-run original hook — WASM should now return Continue
  returnCode = callIfExported(exportName, ...args) ?? 0;
}

this.instance = null;  // Only null AFTER the loop
```

### 2. `proxy_http_call` Host Function

Records the pending call synchronously; does NOT perform the HTTP request.

```typescript
proxy_http_call: (upstreamPtr, upstreamLen,
                  headerPairsPtr, headerPairsLen,
                  bodyPtr, bodyLen,
                  _trailerPairsPtr, _trailerPairsLen,
                  timeoutMs, tokenIdPtr) => {
  const upstream = memory.readString(upstreamPtr, upstreamLen);
  const headerBytes = memory.readBytes(headerPairsPtr, headerPairsLen);
  const headers = HeaderManager.deserializeBinary(headerBytes);  // ← binary format!
  const body = bodyLen > 0 ? memory.readBytes(bodyPtr, bodyLen) : null;
  const tokenId = this.nextTokenId++;
  this.pendingHttpCall = { tokenId, upstream, headers, body, timeoutMs };
  memory.writeU32(tokenIdPtr, tokenId);
  return ProxyStatus.Ok;
}
```

### 3. Binary Header Format

The Rust proxy-wasm SDK serializes `dispatch_http_call` headers in a binary format:

```
[num_pairs: u32 LE]
[key1_len: u32 LE][val1_len: u32 LE]
[key2_len: u32 LE][val2_len: u32 LE]
...
[key1_bytes][0x00][val1_bytes][0x00]
[key2_bytes][0x00][val2_bytes][0x00]
...
```

**Use `HeaderManager.deserializeBinary(bytes: Uint8Array)`** to parse this format.
Do NOT use `HeaderManager.deserialize(string)` — that format (null-split string) is incompatible with the binary format.

### 4. URL Construction from Pseudo-Headers

The WASM passes both an `upstream` string and headers containing pseudo-headers. The host uses headers for the actual URL:

```typescript
const authority = headers[':authority'] || upstream;
const scheme    = headers[':scheme']    || 'https';
const path      = headers[':path']      || '/';
const method    = headers[':method']    || 'GET';
const url = `${scheme}://${authority}${path}`;

// Strip pseudo-headers before passing to fetch()
const fetchHeaders = Object.fromEntries(
  Object.entries(headers).filter(([k]) => !k.startsWith(':'))
);
```

### 5. Error Handling (Timeout / Network Failure)

Per the proxy-wasm spec: a failed HTTP call delivers `numHeaders = 0` to `proxy_on_http_call_response`. The WASM is expected to check this and handle the failure. Our implementation matches this:

```typescript
} catch (err) {
  responseHeaders = {};
  responseBody = new Uint8Array(0);
}
// numHeaders = 0, bodySize = 0 → WASM sees failed call
```

### 6. `proxy_continue_stream` / `proxy_close_stream`

- `proxy_continue_stream`: no-op (the PAUSE loop defaults to Continue after `on_http_call_response`)
- `proxy_close_stream`: sets `streamClosed = true` → host checks `isStreamClosed()` and breaks the loop without re-running the hook

---

## Rust SDK Initialization Order (Critical)

The Rust proxy-wasm SDK uses a `RefCell` internally for the dispatcher. **If `proxy_on_vm_start` is called before `proxy_on_context_create(rootContextId, 0)`, the SDK panics** ("invalid context_id"), leaving the RefCell in a permanently borrowed state. All subsequent calls then also panic ("RefCell already borrowed").

**Correct initialization order** (as implemented in `ensureInitialized`):

```
1. proxy_on_context_create(rootContextId, 0)   ← root context FIRST
2. proxy_on_vm_start(rootContextId, vmConfigSize)
3. proxy_on_configure(rootContextId, pluginConfigSize)
```

This order also works for AssemblyScript SDK (which is more lenient).

---

## State Fields in `HostFunctions`

```typescript
private nextTokenId = 0;
private pendingHttpCall: { tokenId, upstream, headers, body, timeoutMs } | null = null;
private httpCallResponse: { tokenId, headers, body: Uint8Array } | null = null;
private streamClosed = false;
```

**Public accessor methods** (called by the PAUSE loop in `ProxyWasmRunner`):
- `hasPendingHttpCall()` — check before entering loop
- `takePendingHttpCall()` — consume and clear the pending call
- `setHttpCallResponse(tokenId, headers, body)` — store response for WASM to read
- `clearHttpCallResponse()` — called after instance is nulled
- `isStreamClosed()` / `resetStreamClosed()` — track proxy_close_stream calls

---

## Standard Proxy-Wasm Stubs

The Rust proxy-wasm SDK binary imports many standard functions. All are provided as no-op stubs in `HostFunctions.createImports()`. Notably:

| Function | Behavior |
|---|---|
| `proxy_get_status` | Returns 200 |
| `proxy_get_shared_data` | Returns `NotFound` |
| `proxy_set_shared_data` | Returns `Ok` (no-op) |
| `proxy_get_current_time_nanoseconds` | Writes `Date.now()` in nanoseconds as u64 |
| `proxy_done` | No-op |
| `proxy_register/resolve/enqueue/dequeue_shared_queue` | No-ops / NotFound |
| `proxy_grpc_*` | All no-ops |
| `proxy_call_foreign_function` | Returns `NotFound` |

---

## Files

| File | Role |
|---|---|
| `server/runner/types.ts` | `BufferType.HttpCallResponseBody`, `MapType.HttpCallResponseHeaders/Trailers` |
| `server/runner/HeaderManager.ts` | `deserializeBinary(bytes)` — parse binary header map format |
| `server/runner/HostFunctions.ts` | State, `proxy_http_call`, `proxy_continue/close_stream`, stubs, buffer/map extensions |
| `server/runner/ProxyWasmRunner.ts` | PAUSE loop in `callHook`, init order fix in `ensureInitialized` |
| `wasm/cdn-apps/http-call/http-call.wasm` | Compiled Rust example for integration testing |
| `rust_host/proxywasm/examples/http_call/` | Source for the test binary (reads `:authority`/`:scheme` from incoming headers) |
| `server/__tests__/integration/cdn-apps/http-call/http-call.test.ts` | Hermetic integration test |

---

## Integration Test

The test starts a local Node.js HTTP server, loads the `http-call.wasm` binary, and points it at the local server via the `:authority` pseudo-header:

```typescript
const result = await runner.callHook(createHookCall('onRequestHeaders', {
  ':method': 'GET',
  ':path': '/test',
  ':authority': `127.0.0.1:${port}`,  // ← local test server
  ':scheme': 'http',
}));

expect(result.returnCode).toBe(0);  // Continue (not Pause)
expect(logsContain(result, 'Received http call response with token id: 0')).toBe(true);
expect(logsContain(result, 'User-Agent: Some(')).toBe(true);
expect(logsContain(result, 'HTTP call response was received successfully')).toBe(true);
```

The test server responds with `user-agent: fastedge-test-server/1.0` in its headers, which the WASM binary reads and logs. No external network dependency.

---

## Constraints / Limitations

- **No `is_public_host` check**: All hosts are allowed in the debugger (unlike production Rust runtime).
- **Sequential callouts only**: Multiple http_calls can be made sequentially (one at a time per hook invocation). Concurrent calls from the same hook are not supported (not part of the proxy-wasm spec either).
- **No trailer support**: `HttpCallResponseTrailers` returns an empty map (trailers are uncommon in practice).

---

## Testing

```bash
pnpm test:integration:cdn
# → server/__tests__/integration/cdn-apps/http-call/http-call.test.ts (1 test, ~100ms)
```

Runs hermetically — no external network access needed.
