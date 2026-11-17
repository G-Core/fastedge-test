# Resources (several apps on one request)

A resource runs one request through several apps, as a CDN resource does on the edge: one CDN
(proxy-wasm) app per hook, and an origin that is a URL, the built-in responder (echo, or declared with `builtIn`: fixed
response or a folder of files, see BUILT_IN_RESPONDER.md) or an HTTP app.
Code: `server/runner/resource.ts` (config, rules, apps), `server/runner/cdnFlow.ts` (the request
flow, shared with single apps), `server/schemas/config.ts` (`ResourceConfigSchema`).

## Config

Default file: `.fastedge-debug/fastedge-cdn-resource.test.json` at the workspace root (what
`POST /api/resource/load` with no body loads); any file with `apps` is a resource.

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
  `api-resource-load`, `resource-result`. `GET /api/resource/config?path=` reads a resource file
  as written (`config: null` = no file yet); `POST /api/resource/save { configPath?, config }`
  checks it against the schema and writes it as given (no defaults filled in; never through a
  symlink). Both default to the default file and stay inside the workspace.
- **Resource page** (`views/ResourceView/`, the Debugger page with the **Multi-app (CDN resource)**
  toggle on; the toggle is replaced by a note while an HTTP app is loaded, and follows websocket
  loads: a resource load turns it on, an app load off): opens the default file (or any path),
  edits apps (config / wasm / dotenv), main and rules (an app or off per hook, interrupt on error,
  origin), saves and loads it, and sends requests. The result shows the matched rule and a flow
  strip of the steps in order, consecutive steps of one app grouped under its name, and for the
  selected hook the Debugger's own hook detail (`HookDetail`: logs at the Debugger's log level,
  storage calls, inputs, outputs with properties). Fields the page does not edit (properties, client, edge,
  request…) are kept. Loading a resource clears the Debugger's app and loading an app unloads
  the resource (the server holds one or the other). It follows websocket events, so a resource an
  agent loads or runs through the API shows there too. **Send** runs what is on screen: with
  unsaved edits it is "Save, load and send", before a load "Load and send". The file bar sticks to
  the top with an "Unsaved changes" marker; Ctrl/Cmd+S saves. **Overwrite check:**
  `GET /api/resource/config` returns the file's `version` (content hash); `POST /api/resource/save`
  with `expectedVersion` answers 409 `{ conflict, version }` when the file changed since (an agent,
  an editor), unless `force` (without `expectedVersion`: no check). The page asks before
  overwriting. Every save emits `resource_saved { configPath, version }`: a page showing that file
  reloads it, or warns when it has unsaved edits. Edits made on disk without the API are caught
  only at save time. Path fields (resource file, config, wasm,
  dotenv folder) offer the workspace's `.wasm` files, `*.test.json` files and `.env` folders as a
  dropdown, written relative to the resource file (`GET /api/workspace/files`: workspace-relative
  lists, `node_modules`, `.git` and cargo's `deps`/`build` skipped, symlinks not followed, 500 per
  list). The browser's own file picker cannot be used: it gives a file's contents, never its path.
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

- **Apps referenced by config:** a referenced `fastedge-config.test.json`'s `wasm.path` is read as
  the debugger reads it: relative to the app's project root (nearest folder with a `Cargo.toml` or
  `package.json`), with `<workspace>` meaning that root; its `dotenv.path` is relative to the
  config file.
