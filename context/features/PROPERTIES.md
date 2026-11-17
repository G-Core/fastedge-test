# Properties (CDN apps)

How `proxy_get_property` / `proxy_set_property` behave in the CDN (proxy-wasm) runner, and why.

Code: `server/runner/PropertyResolver.ts` (values), `server/runner/PropertyAccessControl.ts`
(per-hook rules), `server/runner/HostFunctions.ts` (host functions), `server/runner/cdnFlow.ts`
(flow and origin fetch).

## Where values come from

1. **User-provided properties** (highest priority): the `properties` object in config files and
   `/api/send` bodies, the raw Properties editor in the Request Context panel, and the client
   preset expansion (see [REQUEST_CONTEXT.md](REQUEST_CONTEXT.md)).
2. **Runtime-calculated properties** (fallback): parsed from the target URL at flow start
   (`extractRuntimePropertiesFromUrl`), plus the request method and, in response hooks, the
   response status.

A user value overrides a calculated one of the same name. Any other name is a custom property.
Paths are normalized: `\0` separators (as the SDKs send them) are treated as `.`.

## Property Reference

### Runtime-calculated (from the target URL)

Examples use the `de` client preset below. Example URL: `https://example.com:8080/api/users.json?page=1&limit=10`

| Property            | Example                    | Source                                       |
| ------------------- | -------------------------- | -------------------------------------------- |
| `request.url`       | the full URL               | Target URL                                   |
| `request.host`      | `example.com:8080`         | URL hostname + port                          |
| `request.path`      | `/api/users.json?page=1&limit=10` | URL pathname + search (like the edge and proxy-wasm `:path`) |
| `request.query`     | `page=1&limit=10`          | URL search, without the leading `?`          |
| `request.scheme`    | `https`                    | URL protocol (`request.protocol` is an alias) |
| `request.extension` | `json`                     | Last segment of the pathname only, after the dot |
| `request.method`    | `POST`                     | Request method                               |

`request.method` is an open string (no enum in the config or API schemas), so WebDAV and custom
methods work. The UI dropdown offers GET, POST, PUT, DELETE, PATCH, HEAD (the HTTP view adds
OPTIONS); any other method (OPTIONS for CDN apps, TRACE, CONNECT, WebDAV) is set in the config
file or the API body.

### Client / geo (user-provided or from the client preset)

| Property               | Example        |
| ---------------------- | -------------- |
| `request.x_real_ip`    | `192.0.2.10`   |
| `request.asn`          | `62240`        |
| `request.country`      | `DE`           |
| `request.country.name` | `Germany`      |
| `request.city`         | `Frankfurt am Main` |
| `request.geo.lat`      | `50.09710`     |
| `request.geo.long`     | `8.59520`      |
| `request.region`       | `HE`           |
| `request.continent`    | `EU`           |
| (any custom name)      | (any value)    |

The client presets (`de`, `nl`, `us`) fill all of these, including `request.x_real_ip` and
`request.asn`; explicit properties win over the preset.

### Header access

| Property                  | Example                         | Source           |
| ------------------------- | ------------------------------- | ---------------- |
| `request.headers.{name}`  | `request.headers.content-type`  | Request headers  |
| `response.headers.{name}` | `response.headers.content-type` | Response headers |
| `request.content_type`, `response.content_type` | `application/json` | `content-type` header |

A multi-valued header returns its first value; use the header-map host functions for all values.

### Response

| Property                | Value                                   |
| ----------------------- | --------------------------------------- |
| `response.status`, `response.code`, `response.status_code` | Status as a **2-byte big-endian u16** (as on the edge), not a decimal string. Rust apps decode with `u16::from_be_bytes`. |
| `response.code_details` | Status text, e.g. `OK`                  |

Response properties have values only in response hooks.

## Access rules per hook

Enforced by `PropertyAccessControl` (always on in the debugger server; `runFlow` in the test
framework takes `enforceProductionPropertyRules`, default `true`).

| Property Path          | Type    | onRequestHeaders | onRequestBody | onResponseHeaders | onResponseBody |
| ---------------------- | ------- | ---------------- | ------------- | ----------------- | -------------- |
| `request.url`          | String  | Read-write       | Read-only     | Read-only         | Read-only      |
| `request.host`         | String  | Read-write       | Read-only     | Read-only         | Read-only      |
| `request.path`         | String  | Read-write       | Read-only     | Read-only         | Read-only      |
| `request.query`        | String  | Read-write       | Read-only     | Read-only         | Read-only      |
| `request.scheme`       | String  | Read-only        | Read-only     | Read-only         | Read-only      |
| `request.method`       | String  | Read-only        | Read-only     | Read-only         | Read-only      |
| `request.extension`    | String  | Read-only        | Read-only     | Read-only         | Read-only      |
| `request.x_real_ip`    | String  | Read-only        | Read-only     | Read-only         | Read-only      |
| `request.country`      | String  | Read-only        | Read-only     | Read-only         | Read-only      |
| `request.city`         | String  | Read-only        | Read-only     | Read-only         | Read-only      |
| `request.asn`          | String  | Read-only        | Read-only     | Read-only         | Read-only      |
| `request.geo.lat`      | String  | Read-only        | Read-only     | Read-only         | Read-only      |
| `request.geo.long`     | String  | Read-only        | Read-only     | Read-only         | Read-only      |
| `request.region`       | String  | Read-only        | Read-only     | Read-only         | Read-only      |
| `request.continent`    | String  | Read-only        | Read-only     | Read-only         | Read-only      |
| `request.country.name` | String  | Read-only        | Read-only     | Read-only         | Read-only      |
| `nginx.log_field1`     | String  | Write-only       | Not accessible| Not accessible    | Not accessible |
| `response.status`      | Integer | Not accessible   | Not accessible| Read-only         | Read-only      |

A denied read returns `NotFound` with an empty value and logs
`Property access denied: Cannot read ...` (Warn).

### What a refused write returns

"Read-only" means the write never changes the value. What the app gets back follows the edge:

| Hook | Write fails (BadArgument) | Write applied | Everything else |
|---|---|---|---|
| `onRequestHeaders` | never | url, host, path, query, `nginx.log_field1` | Ok, no effect |
| `onRequestBody`, `onResponseHeaders`, `onResponseBody` | `request.url`, `.host`, `.path`, `.scheme`, `.method`, `.extension`, `.query`, `.x_real_ip` | custom properties | Ok, no effect (e.g. `response.status`, geo) |

- "Ok, no effect" writes are logged as `set_property '<path>' in <hook> has no effect` (Warn), not
  as access violations. Apps that `unwrap()` the write (the Rust SDK does) keep running, as on
  the edge; e.g. setting `response.status` from `onResponseBody` does not change the status.
- Code: `EDGE_REFUSED_WRITES` and `AccessCheckResult.ignored` in `PropertyAccessControl.ts`.

## Routing: only `request.url` reroutes

The origin fetch goes to `request.url` (after the request hooks), falling back to the target URL.
Writes to `request.path`, `request.host`, `request.scheme` or `request.query` are accepted and
read back, but they do **not** change where the request goes, as on the edge. To reroute, write
the full `request.url` (the `geoRedirect` example pattern).

## Custom properties across hooks

- A custom property written in `onRequestBody` or later is readable by every later hook of the
  same request, including hooks of later apps in a resource (on the edge custom properties belong
  to the request).
- A custom property written in `onRequestHeaders` is never kept for later hooks. A later hook's
  write to the same name creates a new property in that hook.
- To pass state from `onRequestHeaders` to later hooks, add a request header: request headers
  added in `onRequestHeaders` are visible to the response hooks.
- Custom property writes never fail.

```rust
fn on_http_response_headers(&mut self, _: usize, _: bool) -> Action {
    // Created in onResponseHeaders: readable in onResponseBody.
    self.set_property(vec!["response.markdown"], Some(b"true"));
    Action::Continue
}
```

## Known divergences

- After `set_property("request.url", …)` the runner returns the written value on read; on the
  edge the read does not reflect the write.
- In `onRequestHeaders` the edge does not keep a custom property even for that hook (a later read
  in the same hook finds nothing); the runner keeps it until the hook ends.
- The edge ignores a `request.url` / `request.host` write that points at a non-public host; the
  runner applies it, so local origins work.

## UI

- Each hook's Inputs and Outputs tabs show the properties before and after the hook, with a diff.
- Calculated `request.*` values arrive with `request_completed` as `calculatedProperties` and are
  stored separately (`setCalculatedProperties` in `frontend/src/App.tsx`) for read-only display.
  They are never merged into the editable `properties` and never sent back, so they cannot go
  stale or override the next request's URL.

## Debugging

`PROXY_RUNNER_DEBUG=1` logs each `get_property` / `set_property` with its access decision and
reason, URL parsing, and property misses.
