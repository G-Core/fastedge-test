# Resources (several apps on one request)

A resource runs one request through several apps, as a CDN resource does on the edge: one CDN
(proxy-wasm) app per hook, and an origin that is a URL, the built-in responder or an HTTP app.
Code: `server/runner/resource.ts` (config, rules, apps), `server/runner/cdnFlow.ts` (the request
flow, shared with single apps), `server/schemas/config.ts` (`ResourceConfigSchema`).

## Config

```jsonc
{
  "apps": {
    "filter": { "config": "cdn-filter/.fastedge-debug/fastedge-config.test.json" },
    "auth":   { "wasm": "auth-app/.fastedge-debug/app.wasm", "dotenv": { "enabled": true, "path": "auth-app" } }
  },
  "main":  { "hooks": { "onRequestHeaders": "filter" }, "origin": { "url": "https://shop.example" } },
  "rules": [ { "match": "^/auth/", "origin": { "app": "auth" } } ],
  "client": { "preset": "de" }, "edge": { "preset": "de" },
  "request": { "method": "GET", "url": "https://shop.example/account" }
}
```

- **Apps:** a `wasm` path, or `config` (another project's `fastedge-config.test.json`: its wasm and
  dotenv, paths relative to it). Fields set here win. Paths are relative to the resource file.
- **Hooks:** an app name, or `{ "app", "interruptOnError" }` (default true). A hook with no app is
  skipped and the request passes through it unchanged.
- **Rules:** the first rule whose `match` regex matches the request path wins. Its `hooks`, when
  set, replace main's completely (measured on the edge); `hooks` or `origin` left out are main's.
- **One `client` / `edge` per resource**, applied once to the request every app sees. `dc`,
  `stores` and `properties` as for a single app.
- **Load errors:** an unknown app, a nested resource (`config` pointing at a resource), an HTTP app
  on a hook, a CDN app as origin, an unbuilt app ("build X first").

## Edge behaviour (measured with `test-applications/cdn-apps/rust/cdn-resource-probe`)

- Every hook starts with a fresh instance, even when one app runs them all: no memory carries over.
- Custom properties belong to the request: one written in `onRequestBody` or later is readable by
  later hooks, whichever app runs them. One written in `onRequestHeaders` returns Ok and is never
  seen again (nginx runs that hook and does not keep it).
- Headers and bodies pass from hook to hook; `onResponseBody` gets the origin's body.
- `interrupt_on_error`: a trap is status 531. With it on, the request ends with 531; off, the
  request goes on as if the hook had not run.

In the flow, `HookCall.customProperties` / `HookResult.customProperties` carry the request's custom
properties from hook to hook; a flow hook starts with exactly those (none from an earlier request).
`HookResult.localResponse` carries a `send_http_response` answer.

## Using it

- **Tests:** `createResource(fileOrObject, { stores, root })`, `resource.request({ url, method,
  headers, body, properties })` → `{ rule, hooks: { [hook]: { app, result } }, origin: { kind,
  app?, response, storeCalls? }, finalResponse }`. Vitest fixture `resource`; `runTestSuite({
  resource, tests })` gives each test a fresh resource on its own stores.
- **Debugger API:** `POST /api/resource/load` (`{ configPath }` or `{ config }`), then `/api/send`.
  Websocket `resource_loaded`, `resource_request_completed`. JSON schemas `resource-config`,
  `api-resource-load`, `resource-result`.
- **Workspace bound:** in the debugger every file a resource reads (its config, each wasm,
  referenced config and dotenv folder) must be inside the workspace. A resource spanning several
  projects is debugged from a folder holding them all (a monorepo). `createResource` takes the same
  bound as `root`.
- **Rebuilds:** before each request, an app whose wasm changed since it loaded is reloaded.
- **Stores:** all apps share the stores of the resource (cache bucket from `dc` / `edge`), and the
  fixtures of the stores root (nearest git root), as single apps do.

## Known differences from the edge

- **KV store attachment:** on the edge an app opens only the KV stores attached to it; here every
  app of a resource can open every fixture store. A resource that works here can fail on the edge
  with an access-denied open when a store is attached to a different app.
- **onRequestHeaders after cache** (a separate portal option, run by core-proxy) is not modelled.
- **Shield:** `execute_on_shield` is not simulated; hooks run as on an edge node.
- A request body's own `client` / `edge` is not applied to a resource; the resource's are.
