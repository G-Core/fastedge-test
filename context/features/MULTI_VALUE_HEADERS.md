# Multi-Value Header Support

## Overview

Multi-valued HTTP headers — where the same header name appears multiple times (e.g. `Set-Cookie`, or the Proxy-WASM ABI's `add_header("x-foo", a)` + `add_header("x-foo", b)`) — are preserved end-to-end through the test runner without lossy joining or last-wins truncation. `Set-Cookie` specifically is surfaced as a `string[]`, matching Node's `IncomingHttpHeaders` and RFC 6265 §3.

## Motivation

Two requirements converge here:

1. **Proxy-WASM ABI compliance.** The Rust FastEdge SDK's `cdn/headers` example exercises every header host function (`add`, `replace`, `remove`, `get_headers`, `get_header`) and validates their behaviour against the FastEdge CDN (nginx-based proxy-wasm runtime): multi-value `add_header` keeps separate entries (no comma-joining), `remove` deletes every entry for the key, and `get` on a missing or empty header reads `None` (FastEdge v0.8.5+: empty or missing value → `NotFound`; v0.9.11+: header reads answered from a FastEdge-side cache where remove deletes). See "Key implementation details".
2. **RFC 6265 §3 `Set-Cookie` correctness.** `Set-Cookie` is the canonical exception to HTTP's "combine duplicates with commas" rule. Browsers and every ecosystem tool (Node `http`, undici, supertest, axios, fetch's `Headers.getSetCookie()`) model it as an array. Collapsing multiple Set-Cookies to one string silently drops cookies — tests on a handler that sets `sid=…` plus `theme=…` would see only the last one.

Both requirements are satisfied in the same pipeline.

## Type layers

Three header representations coexist, each at its own boundary:

| Type | Shape | Role |
|------|-------|------|
| `HeaderMap` | `Record<string, string>` | **Simple input.** User-provided single-valued headers (e.g. `FlowOptions.requestHeaders`, `HttpRequest.headers`). Easy to construct, no duplicates. |
| `HeaderTuples` | `[string, string][]` | **Canonical internal.** Preserves insertion order and duplicates losslessly. Used by `HostFunctions` for the request/response/http-call response header maps. This is the WASM-visible view. |
| `HeaderRecord` | `Record<string, string \| string[]>` | **Wire / hook-result format.** Single-valued headers are `string`; multi-valued (e.g. `set-cookie`) are `string[]`. Used by `HookCall`, `HookResult`, `FullFlowResult.finalResponse.headers`, WebSocket event payloads, and JSON schemas. Matches Node's `IncomingHttpHeaders` shape. |

Additionally, the public `HttpResponse.headers` (returned from `HttpWasmRunner.execute()`) is typed as Node's `IncomingHttpHeaders` directly — common headers (`content-type`, `location`, `etag`, …) are narrowed to `string`; `set-cookie` is `string[]`.

## Architecture

```
WASM app
  │ proxy_add_header_map_value / proxy_get_header_map_pairs (binary tuples)
  ▼
HostFunctions.requestHeaders / responseHeaders : HeaderTuples     ◀── canonical, lossless
  │
  │ ─── get*Headers() ───▶ HeaderManager.tuplesToRecord()
  │                               │
  │                               ▼
  │                       HeaderRecord (lossless projection: multi-valued → string[])
  │                               │
  │                               ▼
  │                     HookResult.output.*.headers / FullFlowResult.finalResponse.headers
  │                               │
  │                               ▼
  │                     WebSocket events → Frontend Debugger UI
  │
  └── Origin fetch path (ProxyWasmRunner callFullFlow / proxy_http_call)
      │ response.headers.getSetCookie() preserves multiple Set-Cookie
      ▼
      HeaderTuples built directly, never goes through a lossy Record intermediate
```

For HTTP-WASM:

```
HttpWasmRunner.execute()
  │ fetch(...)
  ▼
HttpWasmRunner.parseFetchHeaders(headers)
  │ skips set-cookie in forEach; uses headers.getSetCookie() for array
  ▼
HttpResponse.headers : IncomingHttpHeaders
```

## HeaderManager API

Defined in `server/runner/HeaderManager.ts`:

| Method | Purpose |
|--------|---------|
| `normalize(headers)` | Lowercase keys. Accepts `HeaderMap \| HeaderRecord`, returns `HeaderRecord`. Multi-valued entries pass through as arrays. |
| `recordToTuples(headers)` | Convert `HeaderMap \| HeaderRecord` → `HeaderTuples`. Arrays are flattened to one tuple per element. (Boundary input.) |
| `tuplesToRecord(tuples)` | **Lossless** projection `HeaderTuples` → `HeaderRecord`. Keys with a single entry emit `string`; keys with multiple entries emit `string[]`. (Boundary output.) |
| `normalizeTuples(tuples)` | Lowercase tuple keys. |
| `serializeTuples(tuples)` | Encode `HeaderTuples` → proxy-wasm binary header map format. Preserves duplicates. |
| `deserializeBinaryToTuples(bytes)` | Decode binary header map → `HeaderTuples`. |
| `deserializeToTuples(payload)` | Decode null-separated string → `HeaderTuples`. |
| `firstValue(v)` | Coerce `string \| string[] \| undefined` → `string \| undefined` (first element for arrays). Use when a single scalar is required — property paths, fetch HeadersInit single keys, content-type reads. |
| `flattenToMap(headers)` | Collapse `HeaderRecord` → `HeaderMap` by joining multi-values with `", "`. Use only for consumers that cannot accept arrays (notably fetch's `HeadersInit`). **Never** use for Set-Cookie — route those through a separate channel. |

The legacy `serialize / deserialize / deserializeBinary` Record-based methods remain for backward compatibility.

## HostFunctions header storage

`server/runner/HostFunctions.ts` stores all three WASM-visible header maps as tuples:

```ts
private requestHeaders: HeaderTuples = [];
private responseHeaders: HeaderTuples = [];
private httpCallResponse: { tokenId, headers: HeaderTuples, body } | null = null;
```

All `proxy_*` header host functions operate on tuples directly (`tuples.push(...)`, `tuples.find(...)`, `tuples.filter(...)`), preserving duplicates and order. `proxy_get_header_map_size` reports the tuple count (not unique-key count).

| Function | Behaviour |
|----------|-----------|
| `proxy_add_header_map_value` | `tuples.push([key, value])` — creates a separate entry each call |
| `proxy_replace_header_map_value` | Filter out key, push `[key, value]` (replaces any duplicates with a single entry) |
| `proxy_remove_header_map_value` | Filter out every entry for the key (absent → no-op). |
| `proxy_get_header_map_value` | `tuples.find(...)` — first match. Absent or empty value → `NotFound` (SDKs see `None`/`null`). |
| `proxy_get_header_map_pairs` | `HeaderManager.serializeTuples(tuples)` |
| `proxy_set_header_map_pairs` | `HeaderManager.deserializeToTuples(payload)` |
| `setHttpCallResponse(token, headers, body)` | Accepts `HeaderMap \| HeaderRecord \| HeaderTuples`; stores as tuples. Response-phase `proxy_get_header_map_pairs` on `HttpCallResponseHeaders` sees duplicates (e.g. multiple `Set-Cookie` from an upstream fetch). |

Boundary conversions:
- **Input** (`setHeadersAndBodies`, `setHttpCallResponse`): record → tuples via `recordToTuples` / type-check.
- **Output** (`getRequestHeaders`, `getResponseHeaders`): tuples → `HeaderRecord` via lossless `tuplesToRecord`.

## Fetch ingestion sites

Three places in the runner parse a `Response.headers` from `fetch()` and must preserve Set-Cookie as separate entries:

1. **`HttpWasmRunner.parseFetchHeaders()`** — public response from an HTTP-WASM app. Uses `Headers.getSetCookie()`; returns `IncomingHttpHeaders`.
2. **`ProxyWasmRunner.callFullFlow` origin fetch (line ~505)** — Phase-2 real upstream fetch between request and response hooks. Builds `HeaderRecord` directly (skips `set-cookie` in `forEach`, then appends `getSetCookie()` as `string[]`).
3. **`ProxyWasmRunner` `proxy_http_call` upstream fetch (line ~867)** — WASM-dispatched side-call. Builds `HeaderTuples` directly (`forEach` for non-cookies, then `getSetCookie()` appended as tuples), passed to `HostFunctions.setHttpCallResponse` losslessly.

All three use `Headers.getSetCookie()` (Node 19.7+, always available under the project's `"engines": { "node": ">=22.12" }` floor) rather than `forEach`, which silently last-wins on duplicate Set-Cookie keys.

## Consumer behaviour

### `HttpWasmRunner.execute()` return

```ts
const response = await runner.execute({ path: "/login", method: "POST" });
response.headers["set-cookie"];    // string[] | undefined
response.headers["content-type"];  // string | undefined  (IncomingHttpHeaders known-keys)
response.headers["location"];      // string | undefined
```

### Hook results and final response

```ts
const result = await runner.callFullFlow(...);
result.finalResponse.headers["set-cookie"];     // string | string[] | undefined
result.hookResults.onResponseHeaders.output.response.headers["set-cookie"];
```

### Assertion helpers

`assertHttpHeader`, `assertResponseHeader`, `assertRequestHeader`, `assertFinalHeader` all accept `expected?: string | string[]`:
- **String expected** against a multi-valued header → `.includes()` semantics (passes if any value matches).
- **String[] expected** → strict ordered equality.
- Lookup is case-insensitive.

### PropertyResolver

`request.headers.<name>` / `response.headers.<name>` property paths return the first value when the underlying header is multi-valued (proxy-wasm properties are single-string). WASM apps needing all values must use `proxy_get_header_map_pairs` instead.

## Test applications

### CDN (proxy-wasm)

| Variant | Source (in-repo) | WASM output |
|---------|------------------|-------------|
| Rust strict-validation | `test-applications/cdn-apps/rust/cdn-headers/src/lib.rs` | `wasm/cdn-apps/rust/headers/headers.wasm` |
| AS strict-validation | `test-applications/cdn-apps/as/cdn-headers/assembly/headers.ts` | `wasm/cdn-apps/as/headers/headers.wasm` |
| AS header-injection (separate app) | `test-applications/cdn-apps/as/cdn-headers/assembly/headers-change.ts` | `wasm/cdn-apps/as/headers/headers-change.wasm` |

Both strict-validation variants:
- Add `new-header-01/02/03` across add/remove/replace sequences
- Add a duplicate to `new-header-03` → two entries, preserved through `get_headers`
- Validate diff against an expected set (returns error 552 on mismatch)
- Add two `Set-Cookie` headers (`sid=abc; Path=/; HttpOnly`, `theme=dark; Path=/`) in `onResponseHeaders` for end-to-end RFC 6265 coverage

The Rust app additionally exercises `_bytes` API variants (the AS SDK has no byte APIs).

The AS strict-validation app lives in this repo (`test-applications/cdn-apps/as/cdn-headers/`). It omits the Rust app's 551 empty-host check: AS strings are always truthy and the AS SDK's `get()` returns a non-nullable `string`, so missing and empty cannot be distinguished.

### HTTP-WASM

All three http-responder variants (`test-applications/http-apps/{js, rust/basic, rust/wasi}/http-responder/`) return two `Set-Cookie` headers when the request carries `x-set-cookies`. Exercises the full `fetch → parseFetchHeaders → IncomingHttpHeaders` path end-to-end across language runtimes.

## Integration tests

### CDN multi-value headers

`server/__tests__/integration/cdn-apps/headers/multi-value-headers.test.ts` — 22 tests, 11 per variant (Rust + AS). Coverage:
- Multi-value `add` creating separate entries (includes duplicate `new-header-03`)
- `replace` → single new value
- `remove` → every entry deleted
- Response-header access from request phase
- 550 (no headers) Pause path
- **Set-Cookie as `string[]`** (RFC 6265 §3) — runs on both Rust and AS
- **`new-header-03` as `string[]`** (lossless projection) — runs on both Rust and AS

Rust-only `_bytes` variant assertions stay behind the `hasBytesVariants` flag because they probe Rust SDK-specific APIs.

### HTTP-WASM http-responder

`server/__tests__/integration/http-apps/http-responder/http-responder.test.ts` — 3 variants × 3 tests = 9 tests:
- 302 redirect surfacing + relative Location reuse
- External-host redirect not followed
- Set-Cookie as `string[]` on `HttpResponse.headers`, including `.includes()` and exact-array `assertHttpHeader` semantics

### Unit

- `server/__tests__/unit/runner/HeaderManager.test.ts` — all tuple API methods + `tuplesToRecord` lossless projection + duplicate Set-Cookie preservation.
- `server/__tests__/unit/runner/HttpWasmRunner.test.ts` — `parseFetchHeaders` pure-function regression coverage for multi Set-Cookie, single-cookie string[], absence, non-cookie single-string shape; plus `assertHttpHeader` multi-value semantics.

## Key implementation details

### `remove` behaviour

`proxy_remove_header_map_value` deletes every entry for the key; a later `get` reads `None` and `get_headers` does not list it, in both phases. This is what the guest sees on the edge.

### Missing or empty `get`

`proxy_get_header_map_value` returns `NotFound` for a missing header and for one whose value is empty, so the Rust SDK sees `None` and AS sees `""`. Matches the FastEdge host since v0.8.5. A client header sent with an empty value is still listed by `get_headers` with value `""`.

### Response headers during request phase

On the real FastEdge CDN, response headers are accessible during `onRequestHeaders` (the map exists but is empty). The runner matches: WASM can add/modify/read response headers during request hooks. The test apps validate this by adding `new-response-header`, removing non-existent `cache-control`, and checking the response header count.

### Fixture: response-phase host header

The `onResponseHeaders` test fixtures pass `host: "example.com"`. The Rust app returns 551 if the response `host` reads `None`, and an empty value now reads `None`.

### Request-phase response headers merged with the origin's

Response headers a hook adds in the request phase are append-merged with the origin's
(`HeaderManager.appendMerge` in `cdnFlow.ts`): a name on both sides becomes a `string[]`, the
request-phase value first. Why: the runner only sees cumulative header state after each hook, so
it cannot tell `add_http_response_header` from `replace_http_response_header`. Append is right for
`add_` (the documented pattern) and lossy only for `replace_`. The inner merge of the
`onRequestHeaders` and `onRequestBody` outputs is a plain overwrite, since both are cumulative
snapshots of the same app.

### Trailers

The edge never calls `proxy_on_request_trailers` / `proxy_on_response_trailers`, and neither does
the runner. Trailer (and gRPC) header maps return `Unimplemented`; the Rust SDK panics on that, as
on the edge, which with `interrupt_on_error` ends the request with 531.

### Known divergences (deliberately not copied)

- On the edge, after a rejected header write, reads return the written value. The runner leaves
  the headers unchanged (`unsupportedMapStatus()` in `HostFunctions.ts`).
- On the edge, in body hooks, reading a missing response header returns `BadArgument` (Rust SDK
  getters panic). The runner returns `NotFound`.

## Testing

```bash
# Unit tests (HeaderManager tuple methods, HttpWasmRunner parseFetchHeaders)
pnpm run test:unit

# Integration tests (both AS + Rust variants for CDN; js/rust-basic/rust-wasi for HTTP)
pnpm -w run test:integration:cdn
pnpm -w run test:integration:http

# Everything
pnpm test
```

## Error code reference (cdn-headers WASM)

| Code | Trigger | Meaning |
|------|---------|---------|
| 550 | `get_headers()` empty | No headers present |
| 551 | *(Rust only)* `get_header("host")` is `None` | Host header missing in request phase |
| 552 | Header diff mismatch | add/replace/remove didn't produce the expected set |
| 553 | *(Rust only)* Unexpected `Some` | Request phase: response `host` read is not `None` (no response yet). Response phase: removed `new-header-01` read is not `None` |
| 555 | Response header count wrong | Unexpected number of response headers |
| 556 | Response header value wrong | Specific header name/value validation failed |

The AS app deliberately omits the 551 check — the AS SDK's `get()` returns non-nullable `string` with no way to distinguish missing from empty. Rust keeps the check because `Option::is_none()` discriminates correctly.
