# Behaviour

What a wasm app observes when fastedge-test runs it, and every place that differs from the edge.
The rule behind all of it: an app must succeed and fail here exactly as it does on the edge.
Read this before changing a host function, property, header, origin, dotenv or store behaviour,
and record any new or closed difference in [Known differences from the edge](#known-differences-from-the-edge).

How the code is built (modules, flow, worker, protocols) is in [ARCHITECTURE.md](ARCHITECTURE.md);
setup and tests in [DEVELOPMENT.md](DEVELOPMENT.md). Config fields, API bodies and runner calls
are in the user docs: [TEST_CONFIG.md](../docs/TEST_CONFIG.md), [API.md](../docs/API.md),
[RUNNER.md](../docs/RUNNER.md), [TEST_FRAMEWORK.md](../docs/TEST_FRAMEWORK.md).

Differences are cited as **[Dn]**, a row of the table at the end.

---

## CDN request flow (as the app sees it)

```
onRequestHeaders → onRequestBody → origin → onResponseHeaders → onResponseBody
```

- **Fresh instance per hook.** Every hook runs on a new instance of the module, even when one app
  runs them all: no wasm memory carries from hook to hook (as on the edge). Global state an app
  sets in `onRequestHeaders` is gone in `onRequestBody`.
- **Root context first.** Each instance gets `proxy_on_context_create(root, 0)`, then
  `proxy_on_vm_start`, then `proxy_on_configure`, then the stream context. The Rust SDK panics
  ("invalid context_id") if `on_vm_start` comes before the root context exists, and the panic
  leaves its dispatcher `RefCell` borrowed, so every later call panics too. Keep this order.
- **What passes between hooks:** request headers and body, response headers and body, the
  request's properties, and custom properties written in `onRequestBody` or later
  ([custom properties](#custom-properties-across-hooks)). `onResponseBody` gets the origin's body;
  only its own output is the final body.
- **Ending early:** `send_http_response` ends the flow ([below](#send_http_response)).
- **Traps:** in a [resource](#resources), a trap is status 531: with `interruptOnError` (default
  on) the client gets 531, off the request goes on as if the hook had not run (both measured on
  the edge). A single app's trap ends the run with an error instead of a response **[D17]**.
- **Trailers:** the edge never calls `proxy_on_request_trailers` / `proxy_on_response_trailers`;
  neither does the runner.
- **Logs:** every log level is captured; filtering is a UI concern.

---

## Properties (CDN apps)

### Sources

1. **User-provided** (wins): `properties` in a config or `/api/send` body, the debugger's raw
   Properties editor, and the client context expansion ([Request context](#request-context)).
2. **Calculated** (fallback): parsed from the target URL at flow start, plus the request method
   and, in response hooks, the response status.

A user value overrides a calculated one of the same name; any other name is a custom property.
Paths are normalised: the `\0` separators SDKs send are read as `.`.

### Reference

Calculated from `https://example.com:8080/api/users.json?page=1&limit=10`:

| Property | Value | Note |
|---|---|---|
| `request.url` | the full URL | the only routing property ([Routing](#routing-only-requesturl-reroutes)) |
| `request.host` | `example.com:8080` | hostname, plus the port when the URL has one |
| `request.path` | `/api/users.json?page=1&limit=10` | path **and** query, like the edge and `:path` |
| `request.query` | `page=1&limit=10` | no leading `?` |
| `request.scheme` | `https` | `request.protocol` is an alias |
| `request.extension` | `json` | last path segment only, after its last dot |
| `request.method` | `GET` | any string: WebDAV and custom methods work |

From the client context or explicit properties: `request.x_real_ip`, `request.asn`,
`request.country`, `request.country.name`, `request.city`, `request.region`, `request.continent`,
`request.geo.lat`, `request.geo.long`.

Header and response access:

| Property | Value |
|---|---|
| `request.headers.<name>`, `response.headers.<name>` | first value of the header (all values: use the header-map functions) |
| `request.content_type`, `response.content_type` | the `content-type` header |
| `response.status`, `response.code`, `response.status_code` | **2-byte big-endian u16**, as on the edge, not a decimal string (Rust: `u16::from_be_bytes`) |
| `response.code_details` | status text, e.g. `OK` |

Response properties have values only in response hooks.

### Encoding and misses

- String values are returned as their bytes; any other user value (number, object) as its JSON
  text (`3600` → `"3600"`).
- A property nobody set and nothing calculates returns `Ok` with an empty value.
- A read the per-hook rules deny returns `NotFound` with an empty value and logs
  `Property access denied: Cannot read ...` (Warn).

### Access per hook

| Property | onRequestHeaders | onRequestBody | onResponseHeaders | onResponseBody |
|---|---|---|---|---|
| `request.url`, `.host`, `.path`, `.query` | read-write | read-only | read-only | read-only |
| `request.scheme`, `.method`, `.extension` | read-only | read-only | read-only | read-only |
| `request.x_real_ip`, `.country`, `.country.name`, `.city`, `.asn`, `.region`, `.continent`, `.geo.lat`, `.geo.long` | read-only | read-only | read-only | read-only |
| `nginx.log_field1` | write-only | not accessible | not accessible | not accessible |
| `response.status` | not accessible | not accessible | read-only | read-only |

The rules are always enforced: the `enforceProductionPropertyRules` option of `runFlow` /
`callFullFlow` is accepted but does not turn them off.

### What a refused write returns

"Read-only" means the write never changes the value. What the call returns follows the edge:

| Hook | Write fails (`BadArgument`) | Write applied | Everything else |
|---|---|---|---|
| `onRequestHeaders` | never | url, host, path, query, `nginx.log_field1`, custom | `Ok`, no effect |
| later hooks | `request.url`, `.host`, `.path`, `.scheme`, `.method`, `.extension`, `.query`, `.x_real_ip` | custom properties | `Ok`, no effect (e.g. `response.status`, geo) |

"Ok, no effect" writes log `set_property '<path>' in <hook> has no effect` (Warn). Apps that
`unwrap()` the write (the Rust SDK does) keep running, as on the edge: setting `response.status`
in `onResponseBody` does not change the status. Read-back of a `request.url` write differs
**[D1]**; writes pointing at a non-public host differ **[D3]**.

### Routing: only `request.url` reroutes

The origin fetch goes to `request.url` as it stands after the request hooks, falling back to the
target URL. Writes to `request.path`, `.host`, `.scheme` or `.query` are accepted and read back,
but they do not change where the request goes, as on the edge. To reroute, write the full
`request.url`.

With a declared origin (a config `origin` or a resource), `request.url` gives the path and query
and the origin gives the host ([Origins](#origins)).

### Custom properties across hooks

- A custom property written in `onRequestBody` or later belongs to the request: every later hook
  reads it, whichever app runs that hook (measured on the edge).
- One written in `onRequestHeaders` returns `Ok` and is never seen by a later hook (nginx runs that
  hook and does not keep it); a later write of the same name creates a new property there. Within
  the same hook it differs **[D2]**.
- To pass state out of `onRequestHeaders`, add a request header: headers added there reach every
  later hook.
- Custom property writes never fail.

### Config properties

`vm_config` / `vmConfig` and `plugin_config` / `pluginConfig` properties are handed to
`proxy_on_vm_start` / `proxy_on_configure`. When unset or `{}` they default to
`{"test_mode":true}` (plus `root_id` when a root id property is set). `root_id` and its aliases
(`plugin_root_id`, `root_context`, …) resolve to the derived root id.

---

## Headers

### Header host functions (CDN apps)

Header maps keep every entry in order, duplicates included; names are lowercased.

| Call | Behaviour |
|---|---|
| `add` | appends a separate entry each time (no comma-joining) |
| `replace` | removes every entry for the name, then adds one |
| `remove` | removes every entry for the name; absent is a no-op |
| `get` | first entry; **missing or empty value → `NotFound`** (Rust SDK `None`; AS `""`) |
| `get_pairs` | every entry; a client header with an empty value is listed with `""` |
| `get_size` | number of entries, not of unique names |

Which maps and phases accept a call (measured on the edge):

| Map / phase | Result |
|---|---|
| request and response headers, read | served in every hook; the response map exists (empty) in request hooks |
| response headers written in request hooks | allowed; [merged with the origin's](#merge-rules) |
| request headers written in `onResponseHeaders` | `replace` → `NotFound`, other writes → `BadArgument` |
| any header write in `onRequestBody` / `onResponseBody` | `NotFound` |
| `proxy_http_call` response headers | read-only: writes → `Unimplemented` |
| trailer and gRPC maps | `Unimplemented` (the Rust SDK panics on it, as on the edge) |
| unknown map type | `BadArgument` |

A rejected write leaves the headers unchanged **[D4]**. A missing response header read in body
hooks differs **[D5]**.

### Headers the runner adds

- **`host`:** before any hook, from the target URL when the request has none; the port is
  included unless it is 80 / 443.
- **Client and edge context:** `GeoIP-*`, `X-Real-IP`, `X-ID` ([Request context](#request-context)).
- **On the origin fetch:** `x-forwarded-host` (the request's `host`; fetch sets `Host` itself),
  `x-forwarded-proto` and `x-forwarded-port` (443 / 80) from the effective URL, and `x-real-ip` +
  `x-forwarded-for` from `request.x_real_ip` when set. The client IP is a property because the
  edge derives several headers from one client address.
- The debugger's CDN request panel offers browser headers (`user-agent`, `accept`,
  `accept-language`, `accept-encoding`, `host`, `content-type`, `Authorization`); all start off.

Other edge headers (`X-CDN-*`, `CDN-Loop`, `X-TCPINFO-RTT`, `traceparent`, `sec-fetch-*`, …) are
not added **[D19]**: set them by hand if an app reads them.

### Pseudo-headers

- `runFlow` (test framework) adds `:method`, `:path`, `:authority`, `:scheme` to the request
  headers, derived from the URL; explicit request headers win. The debugger and resources send
  only the headers given.
- Pseudo-headers are stripped before any outgoing HTTP/1.1 call: the origin fetch, an HTTP-app
  origin and `proxy_http_call`.

### Merge rules

- **Request-phase response headers and the origin's:** response headers a request hook adds are
  append-merged with the origin's: a name on both sides becomes a list, request-phase value first.
  The runner sees only cumulative header state after each hook, so it cannot tell
  `add_http_response_header` (append is right) from `replace_http_response_header` **[D6]**.
- **Within the request phase:** `onRequestBody`'s output replaces `onRequestHeaders`' (both are
  cumulative snapshots of one request).
- **`send_http_response`:** see [below](#send_http_response).
- **Origin fetch request headers:** multi-valued request headers are comma-joined (fetch takes one
  string per name).

### Multi-value headers for consumers

- Every `Set-Cookie` an origin, `proxy_http_call` target or HTTP app returns is kept as its own
  entry (`getSetCookie()`), never comma-joined or last-wins.
- Hook results, `finalResponse.headers` and websocket events use `HeaderRecord`: a name with one
  entry is a `string`, with several a `string[]`.
- `HttpWasmRunner.execute()` returns Node's `IncomingHttpHeaders`: `set-cookie` is always
  `string[]`.
- Header assertions (`assertHttpHeader`, `assertResponseHeader`, `assertRequestHeader`,
  `assertFinalHeader`) match names without case; a `string` expected passes if any value matches,
  a `string[]` expected must equal the values in order.

---

## send_http_response

`send_http_response(status, text, body, headers)` (`proxy_send_local_response`) answers from a
hook without the origin.

- The flow ends when a hook returns `StopIteration` (1) **and** called `send_http_response`: no
  origin fetch, no later hooks. A local response with any other return code is ignored.
- Final headers: the response headers the hook built through the response map, with the call's
  4th-argument headers append-merged on top. Both patterns reach the client: headers set through
  the map plus `[]`, or headers passed directly (`[["www-authenticate", "API-Key"]]`).
- The body is binary when its `content-type` is binary (as for origin bodies); otherwise text.
- The runner checks after every hook, so a response hook can answer too.
- Each hook starts with no local response.

---

## Origins

Where a CDN request's response comes from. Config shapes are in
[TEST_CONFIG.md](../docs/TEST_CONFIG.md#origin) and [RUNNER.md](../docs/RUNNER.md#built-in-responder).
The origin is not part of FastEdge (on the edge it is the customer's server), so the built-in
origin only has to answer like an HTTP server.

### Which origin

| Config | Origin |
|---|---|
| no `origin` | the request URL: `request.url` after the hooks, fetched; `built-in` URLs go to the echo |
| `origin: { url }` | that URL's host, with the request's path and query (as a CDN forwards it) |
| `origin: { url: "built-in" }` | the echo |
| `origin: { builtIn: {...} }` | a fixed response or a folder |
| resource `origin: { app }` | an HTTP app of the resource ([Resources](#resources)) |

With a declared `origin`, `request.url` is only what the client asked for.

### URL origins (real fetch)

- Redirects are not followed: a 3xx reaches the response hooks as is.
- A body is sent only for POST, PUT and PATCH.
- Binary response types (`image/*`, `video/*`, `audio/*`, octet-stream, PDF, zip) travel as
  base64 with `isBase64`; hooks see the raw bytes.
- Egress policy (also for `proxy_http_call`): http and https only; addresses in link-local
  (169.254/16, fe80::/10), ULA (fc00::/7) and cloud metadata ranges are refused, IPv4-mapped
  forms included. Loopback and private LAN addresses are allowed so local origins work.
- An unreachable origin gives status 0, `Fetch Failed`, the error as body, and the response hooks
  do not run **[D18]**.

### The echo (`built-in`)

`built-in` is shorthand for `http://fastedge-builtin.debug`; that URL with any path or query also
selects the echo. The shorthand is replaced by the canonical URL before any hook, so URL parsing,
properties and `host` work as for a real URL. All four hooks run; only the fetch is replaced.

| Request header | Effect |
|---|---|
| (none) | 200, JSON `{ method, reqHeaders, reqBody, requestUrl }`; `requestUrl` is `request.url` after the hooks |
| `x-debugger-status: <n>` | that status; outside 100–599 or not a number → 400 |
| `x-debugger-content: body-only` | the request body as body, `content-type` mirrored (default `text/plain`) |
| `x-debugger-content: status-only` | empty body, `text/plain` |

The headers are read after `onRequestBody` (so a hook can set them) and removed before the echo
and the response hooks. They are **deprecated**: declare `origin.builtIn` instead.

### Declared built-in origin (`origin.builtIn`)

- **Fixed:** `status` (default 200), `headers`, and `body` (text) or `bodyFile` (the file's bytes;
  content type from the extension).
- **Folder:** `files`: `GET /a/b.png` answers with `<folder>/a/b.png`; 200 or 404, it sets the
  status itself.
- At most one body source. `headers` apply over the generated ones. HEAD gets the headers without
  the body. Responses carry `x-content-type-options: nosniff`.
- **The config wins:** with `builtIn` declared, `x-debugger-*` headers are ignored, with a log
  line.
- Paths are relative to the config file (`/api/send`: to the workspace; `GET /api/config` returns them
  resolved against the config's folder) and must lie inside the
  workspace in the debugger, or inside `root` for `createResource`. An empty path is refused (use
  `"."` for the config's own folder).

### File-serving safety

A request path from the client, or from a hook, picks the file, so serving is hardened:

- the path is percent-decoded once; malformed encoding, NUL, backslashes and colons are refused;
- dot segments and dotfiles (`.env`, `.git`, `.fastedge-debug`) are never served, and a dotfile
  `bodyFile` is refused at load;
- the folder and `bodyFile` are fixed to their real paths when the config loads, and a requested
  file's real path must lie inside the folder; a file-system root cannot be served;
- the file opened (`O_NOFOLLOW`, then checked by its fd path on Linux or its inode elsewhere) must
  be the one checked. Off Linux, a symlink swapped in and back within that window is not caught
  (it needs write access to the served folder);
- regular files only, at most 32 MiB, read with a hard cap; GET and HEAD only (others → 405);
- errors never show file-system paths.

---

## Request context

Where the client is and which edge POP runs the app: `client` and `edge`, each a preset (`de`,
`nl`, `us`) plus field overrides. Fields and where they are set:
[TEST_CONFIG.md](../docs/TEST_CONFIG.md#client-and-edge-context), [RUNNER.md](../docs/RUNNER.md#request-context).

| | CDN app | HTTP app |
|---|---|---|
| `client` | `request.*` geo properties incl. `request.asn`, `request.x_real_ip`; headers `x-real-ip`, `geoip-asn`, `-country-code`, `-city`, `-reg`, `-continent`, `-lat`, `-long` (no country name) | the same headers plus `geoip-country-name` |
| `edge` | dictionary `dc`, `region`, `country`, `city`, `hostname`; header `x-id` (= hostname); no `pop-*` | headers `dc`, `pop-lat`, `-long`, `-reg`, `-city`, `-continent`, `-country-code`, `-country-name` |

- **Explicit wins:** properties, request headers (any case) and dotenv dictionary entries win over
  the expansion. The top-level `dc` wins over the edge's `dc`.
- **Presets** were captured on the edge: edge DE = Frankfurt `fr5` (dictionary inferred), NL =
  Amsterdam `am3`, US = San Jose `sv5` (`pop-*` coordinates approximate); client DE / NL / US
  from `geoip-*` captures, with RFC 5737 documentation IPs. Dictionary names differ from header
  names on the edge (`Netherlands` vs `The Netherlands`); the presets keep that.
- **Cache bucket:** `dc ?? edge dc ?? createStores() dc ?? "local"`, fixed at load.
- **No block, no change:** without `client` / `edge` nothing is added.
- **Per request:** a body naming `client` or `edge` uses them for that request only (one left out
  is none); a body naming neither gets the runner's. Overlapping CDN flows keep their own context.
- **Once per flow:** the context is applied at flow start; hooks do not get it again (a hook may
  remove a header and it stays removed).

---

## Dotenv

Env vars and secrets from `.env` files, as the FastEdge VS Code extension and `fastedge-run` read
them. Off unless `dotenv.enabled` is true. Config shape:
[TEST_CONFIG.md](../docs/TEST_CONFIG.md#dotenv-configuration).

### Files

| File | Holds |
|---|---|
| `.env` | `FASTEDGE_VAR_SECRET_<name>` → secret; `FASTEDGE_VAR_ENV_<name>` or an unprefixed key → env var; other `FASTEDGE_VAR_*` keys skipped |
| `.env.secrets` | secrets, no prefix |
| `.env.variables` | env vars, no prefix |
| `.env.req_headers`, `.env.rsp_headers`, `.env.kv_stores` | HTTP apps only (read by `fastedge-run`) |

- A repeated prefix is stripped in full (`FASTEDGE_VAR_ENV_FASTEDGE_VAR_ENV_X` → `X`).
- `FASTEDGE_VAR_*` keys in `.env.secrets` / `.env.variables` are skipped.
- `#` comments, quoted values and empty values are parsed.

### Precedence

- Between files: `.env` is read first; `.env.secrets` / `.env.variables` only fill names not set
  yet.
- CDN apps: dotenv values override secrets and dictionary entries the runner was given, and the
  edge context's dictionary keys sit under both.

### Where the files are

- Directory: `dotenv.path` if given (relative to the app root, within the workspace root), else the app root (VS Code), else the process CWD.
- A relative `dotenv.path` in a config file is relative to **that config file**, in every loading
  flow (CLI `loadConfigFile`, `GET /api/config`, VS Code); a config dropped into a browser cannot
  give its folder, so the server resolves the rest against the workspace.
- In the debugger the directory must be inside the workspace, and none of the dotenv files may be
  a symlink leading out of it (a request is refused with 400).

### CDN vs HTTP

- **CDN apps:** the runner reads the files itself and fills the secret store and dictionary
  before any hook. `PATCH /api/dotenv` / `applyDotenv()` resets both and reloads, without
  recompiling.
- **HTTP apps:** `fastedge-run` reads the files (`--dotenv <path>`, bare `--dotenv` = CWD). A
  change takes effect when the process restarts, which `applyDotenv()` does.

---

## Variables and secrets (CDN apps)

| App call | Host function | Source |
|---|---|---|
| `getEnv(name)` (WASI env) | `environ_get` | the dictionary's own entries |
| `getDictionary(name)` | `proxy_dictionary_get` | dictionary entries, then edge context keys |
| `getSecret(name)` | `proxy_get_secret` / `proxy_secret_get` | secret store |
| effective-at secret read | `proxy_get_effective_at_secret` | the secret value effective at `t` |

- A missing name (or an empty secret) is `NotFound`.
- Secrets may hold a rotation list `[{ value, effectiveAt }]`: the value with the latest
  `effectiveAt` not after the time asked (now, for `proxy_get_secret`) wins; none → `NotFound`.
- The edge always provides a WASI env table; Node's WASI rejects an empty one, which breaks the
  AssemblyScript shim mid-init. So when the dictionary is empty the runner sets
  `__FASTEDGE_RUNNER__=1` **[D16]**.
- Secret values never appear in logs (only their length); dictionary values do.

---

## proxy_http_call

- `proxy_http_call` only records the call and returns a token; the hook returns `Pause`. The
  runner then fetches, calls `proxy_on_http_call_response(context, token, numHeaders, bodySize,
  0)` on **the same instance**, and re-runs the hook on it, until the hook returns `Continue`.
  Instance continuity is what lets an app set state in the callback and read it on the re-run.
- `proxy_close_stream` in the callback ends the loop without re-running the hook;
  `proxy_continue_stream` is a no-op.
- **URL:** `:scheme://:authority:path` from the call's headers; `:authority` falls back to the
  upstream name, `:scheme` to `https`, `:path` to `/`, `:method` to `GET`.
- The call's timeout is honoured. Redirects are not followed. A body is dropped for GET and HEAD.
  The [egress policy](#url-origins-real-fetch) applies; other hosts are allowed **[D7]**.
- **Failure** (timeout, network, egress refusal): the callback gets `numHeaders = 0`,
  `bodySize = 0`, and a `[host] http_call failed for <url>` Warn log is added to the app's logs.
- Request headers the app repeats are all sent; Node's `fetch` joins them onto one line
  (`, `, or `; ` for `cookie`).
- The response headers keep duplicates (every `Set-Cookie`); they are read-only. Trailers:
  `num_trailers` is always 0 and the trailer map is `Unimplemented`, as on the edge.
- Calls are sequential: one pending call per hook invocation.

Other standard functions: `proxy_get_shared_data` and `proxy_call_foreign_function` return
`NotFound`, `proxy_set_shared_data` is `Ok` with no effect, shared queues and gRPC are no-ops,
`proxy_get_current_time_nanoseconds` is the host clock.

---

## Resources

A resource runs one request through several apps, as a CDN resource does on the edge: one CDN app
per hook, and an origin that is a URL, the built-in origin or an HTTP app. Config shape:
[TEST_CONFIG.md](../docs/TEST_CONFIG.md#resource-configuration); calls:
[RUNNER.md](../docs/RUNNER.md#resources).

- **Hooks:** an app name, or `{ app, interruptOnError }` (default true). A hook with no app is
  skipped and the request passes through it unchanged.
- **Rules:** the first rule whose `match` regex matches the request **path** (not the query) wins.
  Its `hooks`, when set, replace main's completely (measured on the edge); `hooks` or `origin`
  left out are main's.
- **One `client` / `edge` per resource,** applied once to the request every app sees. A request
  body's own `client` / `edge` is not applied to a resource.
- **Load errors:** an unknown app, a nested resource, an HTTP app on a hook, a CDN app as origin,
  an unbuilt app.
- **HTTP-app origin:** gets the request's path and query, method, headers (pseudo-headers removed,
  multi-values comma-joined) and body; a binary body a hook made reaches it as base64 text **[D11]**.
- **Apps by config:** a referenced `fastedge-config.test.json`'s `wasm.path` is relative to that
  app's project root (nearest folder with `Cargo.toml` or `package.json`; `<workspace>` means that
  root); its `dotenv.path` is relative to the config file. Fields set in the resource win.
- **Rebuilds:** an app whose wasm changed since it loaded is reloaded before the next request.
- **Workspace bound:** in the debugger every file a resource reads must be inside the workspace.
- **Stores:** all apps share the resource's stores and cache bucket.

Measured on the edge and matched: every hook gets a fresh instance; headers and bodies pass from
hook to hook; [custom properties](#custom-properties-across-hooks) belong to the request; the
531 / `interrupt_on_error` behaviour in [the flow](#cdn-request-flow-as-the-app-sees-it).
Not modelled: per-app KV attachment **[D8]**, `onRequestHeaders` after cache **[D9]**, shield
**[D10]**.

---

## Stores (cache and Edge KV)

CDN apps (`proxy_cache_*`, `proxy_kv_store_*`) and HTTP apps (through `fastedge-run`) share one
cache and Edge KV per stores root, as the edge shares the cache per account per POP between HTTP
and CDN apps. The service, its API and the Storage panel are in [ARCHITECTURE.md](ARCHITECTURE.md);
fixtures and test stores in [TEST_FRAMEWORK.md](../docs/TEST_FRAMEWORK.md#createstores).

### Statuses (CDN host functions)

- A key, pattern or item that is not UTF-8 → `BadArgument`.
- Cache: `set` TTL 0 = default, negative → `BadArgument`; `get` of a missing key is `Ok` with the
  out-params untouched; an empty value is a real empty value.
- KV `open`: a store with a fixture is attached; any other → `BadArgument` (the SDK's
  `AccessDenied`). A key of the wrong type, or `zrange_by_score` with min > max → `BadArgument`;
  anything else (an invalid glob too) → `InternalFailure`.
- Stores off (`stores: false`, or the service cannot start): the functions still link, every call
  returns `InternalFailure`, and the first call in a hook logs `[host] stores are off: ...`.
- Each call blocks the hook (5 s deadline); a failure is `InternalFailure` and is never retried.

### Edge semantics matched

As measured on the edge and read from the edge cache backend:

- default TTL = max TTL = 4 days; a larger TTL is clamped; `expire` with a negative TTL gets the
  default; `expire` on a missing key is `false`;
- `incr` takes canonical decimal i64 only; an existing key keeps its TTL;
- a stored empty value reads back empty, not missing;
- `purge` clears the whole `dc` bucket; `purge-prefix` is a literal prefix (no glob);
- KV `scan` uses the edge's glob: `*`, `?`, `[..]`, `[^..]` (`!` is literal), ranges (reversed
  too), `\` escapes. A `]` outside a set, a `[` inside one (even escaped), an unclosed set, `[x-]`
  and a trailing `\` are errors, not non-matches; `[]` matches nothing;
- KV `zscan` matches only the literal prefix before the first wildcard (`a*z` returns every member
  starting with `a`), sorted by member, not score; the pattern is still validated;
- `zrange_by_score` with min > max is an error; a wrong-type key is a WRONGTYPE error;
- one clock for every runner: advancing it moves expiry for HTTP and CDN apps together.

### Fixtures

```
fixtures/stores/kv/<store>.json   { "strings": { key: value }, "zsets": { key: [[member, score]] }, "bloom": { key: [item] } }
fixtures/stores/cache/<dc>.json   { key: { "value": "text" } | { "base64": "..." }, optional "ttl_ms" }
```

- A value or member is a UTF-8 string or `{ "base64": "..." }`. Edge KV values cannot be empty
  (the edge API refuses them); cache values can.
- KV is read-only to apps, so KV fixtures replace all KV data when loaded. Cache fixtures overwrite
  their keys with a fresh TTL and leave other entries alone.
- A KV store is attached when it has a fixture; there is no app-level store configuration.
- Cache keys are scoped by `dc` only **[D14]**. `incr` on a missing key **[D12]**, bloom filters
  **[D13]** and a service restart on a new port **[D15]** differ too.

---

## HTTP apps

HTTP apps run in `fastedge-run`, the public FastEdge runtime, so host behaviour is the runtime's
own. What fastedge-test adds or decides:

- the [request context](#request-context) headers, under the request's own;
- [dotenv](#cdn-vs-http) through `--dotenv`;
- [stores](#stores-cache-and-edge-kv) through the shared service, when the `fastedge-run` build
  supports it (otherwise the app keeps `fastedge-run`'s in-memory cache);
- the response is read without following redirects (the edge returns them to the client), and
  every `Set-Cookie` is kept ([consumers](#multi-value-headers-for-consumers)).

---

## Known differences from the edge

Every behaviour that is not the edge's. Sections above cite these rows; a change that adds or
closes one updates this table.

| ID | Area | On the edge | In fastedge-test |
|---|---|---|---|
| D1 | `request.url` read after write | the read does not reflect the write | the read returns the written value |
| D2 | Custom property in `onRequestHeaders`, same hook | not kept even for that hook: a later read finds nothing | kept until the hook ends |
| D3 | `request.url` / `request.host` write to a non-public host | ignored | applied, so local origins work |
| D4 | Header read after a rejected header write | returns the written value | headers unchanged; returns the old value |
| D5 | Missing response header read in `onRequestBody` / `onResponseBody` | `BadArgument` (Rust SDK getters panic) | `NotFound` |
| D6 | Response header replaced in a request hook, also sent by the origin | the request-phase value replaces the origin's | both values (append-merge; the runner cannot tell `add_` from `replace_`) |
| D7 | `proxy_http_call` to a non-public host | refused (`is_public_host`) | allowed; only link-local, ULA and cloud-metadata addresses are refused |
| D8 | Edge KV attachment in a resource | an app opens only stores attached to it | every app opens every store with a fixture |
| D9 | `onRequestHeaders` after cache (core-proxy) | a separate portal option | not modelled |
| D10 | `execute_on_shield` | hooks can run on the shield | not simulated; hooks run as on an edge node |
| D11 | Binary request body to an HTTP-app origin | raw bytes | base64 text |
| D12 | Cache `incr` on a missing key | no TTL; escapes `purge` until a server restart | default TTL; purgeable |
| D13 | Bloom filters | probabilistic (false positives possible) | exact sets, no false positives |
| D14 | Cache key scope | per account and `dc` | per `dc` only (one service = one account) |
| D15 | Stores service restarted on a new port | n/a | CDN runners follow; a running `fastedge-run` keeps the old address until its runner reloads |
| D16 | WASI env with no env vars | empty table | `__FASTEDGE_RUNNER__=1` (Node's WASI rejects an empty table) |
| D17 | Trap in a single app | 531 with `interrupt_on_error`, else the request goes on | the run ends with an error, no response |
| D18 | Origin unreachable | the CDN answers with its own error status | status 0, `Fetch Failed`, error text as body; response hooks do not run |
| D19 | Edge-only request headers | `X-CDN-*`, `CDN-Loop`, `X-TCPINFO-RTT`, `traceparent`, `sec-fetch-*`, … | not added; set them by hand |
