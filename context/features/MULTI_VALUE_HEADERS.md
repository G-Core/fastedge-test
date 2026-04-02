# Multi-Value Header Support (Proxy-WASM ABI Compliance)

**Date:** April 1, 2026
**Status:** ✅ Implemented

## Overview

Changed the internal header storage in the proxy-wasm host functions from `Record<string, string>` (one value per key) to `[string, string][]` (ordered tuple array). This enables correct multi-valued header support as required by the proxy-wasm ABI — where `add_header("x-foo", "a")` + `add_header("x-foo", "b")` must produce two separate entries returned by `get_headers()`.

## Motivation

The FastEdge-sdk-rust `cdn/headers` example exercises all header host functions (add, replace, remove, get_headers, get_header) and validates their behavior against the real FastEdge CDN (nginx-based proxy-wasm runtime). Running this example against the test runner exposed three bugs:

1. **Multi-value headers concatenated** — `proxy_add_header_map_value` comma-joined values (`"val1,val2"`) instead of creating separate entries. The Rust SDK's `get_http_request_headers()` then saw one entry instead of two, causing diff validation to fail (error 552).

2. **`proxy_remove_header_map_value` deleted entries** — On nginx, removing a header sets it to empty string (the header entry persists). The runner was deleting entries entirely, causing the Rust example's diff validation to miss expected `("header-name", "")` entries.

3. **`proxy_remove` created entries for non-existent headers** — When removing a header that was never added, the runner should no-op. Instead, after the initial fix, it was creating a new empty-string entry, causing response header count validation to fail (error 555).

## Approach: Internal Tuple Storage

Only the **internal** header storage in `HostFunctions` changed. All external interfaces (`HeaderMap = Record<string, string>`) remain unchanged — conversion happens at the boundary. This minimizes the blast radius: frontend, API schemas, WebSocket events, and test framework assertions are untouched.

## Changes Implemented

### 1. New Type (`server/runner/types.ts`)
- Added `HeaderTuples = [string, string][]` — internal representation supporting duplicate keys

### 2. HeaderManager Tuple Methods (`server/runner/HeaderManager.ts`)
Added 6 new methods alongside existing Record-based ones:

| Method | Purpose |
|--------|---------|
| `recordToTuples()` | Convert `Record<string, string>` → tuples (boundary input) |
| `tuplesToRecord()` | Convert tuples → Record with comma-joining (boundary output) |
| `normalizeTuples()` | Lowercase all keys |
| `serializeTuples()` | Encode tuples to proxy-wasm binary format (supports dup keys) |
| `deserializeBinaryToTuples()` | Decode binary format preserving dup keys |
| `deserializeToTuples()` | Decode null-separated string preserving dup keys |

Existing `serialize()`, `deserializeBinary()`, `deserialize()`, `normalize()` kept unchanged for backward compatibility.

### 3. HostFunctions Internal Storage (`server/runner/HostFunctions.ts`)

**Storage change:**
```typescript
// Before:
private requestHeaders: HeaderMap = {};    // Record<string, string>
private responseHeaders: HeaderMap = {};

// After:
private requestHeaders: HeaderTuples = [];  // [string, string][]
private responseHeaders: HeaderTuples = [];
```

**Host function changes:**

| Function | Before | After |
|----------|--------|-------|
| `proxy_add_header_map_value` | `map[key] = existing ? existing+","+value : value` | `tuples.push([key, value])` |
| `proxy_replace_header_map_value` | `map[key] = value` | Filter out key, push `[key, value]` |
| `proxy_remove_header_map_value` | `delete map[key]` | If exists: filter out key, push `[key, ""]` (nginx behavior). If not exists: no-op |
| `proxy_get_header_map_value` | `map[key]` lookup | `tuples.find()` — first match. Missing → `Ok("")` (nginx behavior) |
| `proxy_get_header_map_pairs` | `HeaderManager.serialize(map)` | `HeaderManager.serializeTuples(tuples)` |
| `proxy_get_header_map_size` | `Object.keys(map).length` | `tuples.length` (includes dup keys) |
| `proxy_set_header_map_pairs` | `HeaderManager.deserialize()` | `HeaderManager.deserializeToTuples()` |

**Boundary conversions:**
- `setHeadersAndBodies()` — converts incoming `Record` → tuples via `recordToTuples()`
- `getRequestHeaders()` / `getResponseHeaders()` — converts tuples → `Record` via `tuplesToRecord()` (comma-joins multi-values)

**Private methods renamed:**
- `getHeaderMap()` → `getInternalHeaders()` (returns `HeaderTuples`)
- `setHeaderMap()` → `setInternalHeaders()` (accepts `HeaderTuples`)

### 4. Rust Test Application (`test-applications/cdn-apps/rust/cdn-headers/`)
- Copied from `FastEdge-sdk-rust/examples/cdn/headers/` — the reference implementation
- Added to Rust workspace (`test-applications/cdn-apps/rust/Cargo.toml`)
- Built to `wasm/cdn-apps/rust/headers/headers.wasm`

### 5. AssemblyScript Test Application (`proxy-wasm-sdk-as/examples/headers/`)
- Updated to match Rust behavior: expected headers now include removed headers as empty-string entries
- Added `validateHeadersExact()` for strict onResponseHeaders validation
- Added response header cross-map validation (553-556 error codes)
- Host check uses `get_headers()` iteration instead of `get()` string comparison
- Built to `wasm/cdn-apps/as/headers/headers.wasm`

### 6. Integration Test (`server/__tests__/integration/cdn-apps/headers/multi-value-headers.test.ts`)
- 20 tests total: 10 per variant (AS + Rust), using the variant pattern from `shared/variants.ts`
- Tests both `onRequestHeaders` and `onResponseHeaders` hooks
- Validates: multi-value add, replace, remove→empty, response cross-map access, error paths (550)
- `_bytes` header assertions gated by `hasBytesVariants` flag (Rust only)

### 7. Unit Tests (`server/__tests__/unit/runner/HeaderManager.test.ts`)
- Added tests for all 6 new tuple methods
- Round-trip tests: `recordToTuples` ↔ `tuplesToRecord`
- Multi-value serialization: `serializeTuples` with dup keys → `deserializeBinaryToTuples` preserves them
- `tuplesToRecord` comma-joining validation

## Key Implementation Details

### nginx Remove Behavior
`proxy_remove_header_map_value` on nginx sets the header value to empty string rather than deleting the entry. This is because nginx's internal header structure doesn't support true deletion. The runner now matches this:
- Header exists → filter out all entries, add one with empty value
- Header doesn't exist → no-op (don't create a phantom entry)

### Missing Header Behavior
`proxy_get_header_map_value` for a non-existent header returns `Ok` with empty string (not `NotFound`). This matches nginx behavior where missing headers return a zero-length string. The Rust SDK interprets a non-null return pointer as `Some("")`, which is distinct from `None` (null pointer). Our `writeStringResult("")` always writes a non-null pointer, so the behavior aligns.

### Response Headers During Request Phase
On the real FastEdge CDN, response headers are accessible during `onRequestHeaders` (the map exists but is empty). The runner matches this: WASM can add/modify/read response headers during request hooks. The Rust example validates this by adding `new-response-header`, removing non-existent `cache-control`, and checking the response header count.

### Fixture: Response Host Header
The onResponseHeaders test fixture uses `host: ""` (empty string), not `host: "example.com"`. On the real server, the response header map has a pre-allocated "host" field initialized to empty. The WASM validates `get_response_header("host")` returns `Some("")` — non-empty values trigger error 554.

## Files Modified
- `server/runner/types.ts` — Added `HeaderTuples` type
- `server/runner/HeaderManager.ts` — 6 new tuple methods
- `server/runner/HostFunctions.ts` — Internal storage + all proxy_* functions
- `server/__tests__/unit/runner/HeaderManager.test.ts` — New tuple method tests

## Files Created
- `test-applications/cdn-apps/rust/cdn-headers/` — Rust test crate (Cargo.toml + src/lib.rs)
- `wasm/cdn-apps/rust/headers/headers.wasm` — Compiled Rust WASM
- `wasm/cdn-apps/as/headers/headers.wasm` — Compiled AS WASM
- `server/__tests__/integration/cdn-apps/headers/multi-value-headers.test.ts` — Integration test

## Cross-Repo Changes
- `proxy-wasm-sdk-as/examples/headers/assembly/index.ts` — Updated to match nginx/Rust behavior
- `test-applications/cdn-apps/rust/Cargo.toml` — Added `cdn-headers` to workspace members

## Testing

```bash
# Unit tests (HeaderManager tuple methods)
pnpm run test:unit

# Integration tests (both AS + Rust variants)
NODE_OPTIONS='--no-warnings' npx vitest run --config vitest.integration.cdn.config.ts server/__tests__/integration/cdn-apps/headers/

# All tests
pnpm test
```

## Error Code Reference (cdn-headers WASM)

| Code | Trigger | Meaning |
|------|---------|---------|
| 550 | `get_headers()` empty | No headers present |
| 551 | `get_header("host")` is None | Host header missing (request phase only) |
| 552 | Header diff mismatch | add/replace/remove didn't produce expected results |
| 553 | Response header inaccessible | `get_response_header()` returned None |
| 554 | Response header non-empty | Expected empty value for pre-allocated header |
| 555 | Response header count wrong | Unexpected number of response headers |
| 556 | Response header value wrong | Specific header name/value validation failed |
