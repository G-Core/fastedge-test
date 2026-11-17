# Production-Parity Headers

The CDN runner gives hooks and origins headers close to what the edge produces: optional browser
default headers in the UI, an automatic `Host` header, and proxy headers on the origin fetch.

## Motivation

On the edge a request reaching the app carries headers such as:

```
Host: example.com
X-Forwarded-Host: example.com
X-Forwarded-For: 2001:db8::1
X-Real-IP: 2001:db8::1
X-Forwarded-Proto: https
X-Forwarded-Port: 443
user-agent: Mozilla/5.0 (...)
accept: text/html,...
```

WASM code that reads these must see them locally too.

## Browser default headers (UI)

The CDN view's request panel (`frontend/src/views/ProxyWasmView/ProxyWasmView.tsx`) offers
`user-agent` (Firefox), `accept`, `accept-language`, `accept-encoding`, `host` (calculated from
the URL), `content-type` (calculated from the body) and `Authorization`. All start disabled.

## Host header

Before any hook runs, `cdnFlow.ts` adds `host` from the target URL when the request has none
(port included only when it is not 80/443): `https://example.com:8080/x` → `example.com:8080`.

## Proxy headers on the origin fetch

`fetchOrigin()` in `cdnFlow.ts` adds:

- `x-forwarded-host` — the request's `host` (fetch overrides `Host` itself)
- `x-forwarded-proto` — scheme of the effective URL
- `x-forwarded-port` — 443 for https, 80 for http
- `x-real-ip`, `x-forwarded-for` — from `request.x_real_ip`, when set

## Use cases

User-agent/bot detection, IP-based routing (`x-real-ip`), HTTPS enforcement
(`x-forwarded-proto`), content negotiation (`accept`, `accept-language`).

## What's Still Missing (Production-Only)

Headers that remain production-only and are **not critical** for most testing:

### CDN-Specific Headers

- `X-CDN-Node-Addr` - CDN node IP address
- `X-CDN-Real-Host` - Original host before CDN processing
- `X-CDN-Rule-ID` - CDN routing rule identifier
- `CDN-Loop` - Loop detection counter
- `X-TCPINFO-RTT` - TCP round-trip time

### Connection Headers

- `Connection` - HTTP connection type
- `priority` - HTTP/3 priority hints

### Security/Tracing

- `traceparent` - OpenTelemetry distributed tracing
- `sec-fetch-*` - Fetch metadata headers
- `dnt`, `sec-gpc` - Privacy headers
- `upgrade-insecure-requests` - Browser upgrade requests

**When to add these manually:**

- If your WASM specifically checks for CDN loop detection
- If you're testing distributed tracing integration
- If you're implementing security policies based on sec-fetch headers

For most WASM testing, these aren't needed. The runner provides the **essential** headers.

## Design Decisions

### Why Default Headers Start Disabled?

**Reason:** Keep test environment clean by default, opt-in to complexity.

**Benefits:**

- Simpler output for basic testing
- Developers add only what they need
- Clear visibility of what's being tested

**How it works:**

- Headers appear in UI with checkboxes unchecked
- Click to enable specific headers
- Modify values as needed

### Why Auto-Inject Proxy Headers?

**Reason:** Proxy headers are fundamental to CDN behavior, should be automatic.

**Rationale:**

- Every production request has these headers
- They're derived from request context (URL, properties)
- No manual setup needed - just works

**Headers auto-injected:**

- `x-forwarded-proto` - From URL scheme
- `x-forwarded-port` - From protocol
- `x-forwarded-host` - From Host header
- `x-real-ip`, `x-forwarded-for` - From property (if set)

### Why is the client IP a property?

**Reason:** One source, several headers, as on the edge (nginx sets the client data; the app reads
properties and headers).

- `request.x_real_ip` comes from the client preset or an explicit property
  (see [REQUEST_CONTEXT.md](REQUEST_CONTEXT.md)); the preset also sets the `X-Real-IP` request
  header the hooks see.
- On the origin fetch the runner derives `x-real-ip` and `x-forwarded-for` from it.
