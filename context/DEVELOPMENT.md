# Development

How to build fastedge-test, run its tests, and follow its conventions.

- How the code is structured, data flow, where a module lives: [ARCHITECTURE.md](ARCHITECTURE.md)
- What an app observes, and every known difference from the edge: [BEHAVIOUR.md](BEHAVIOUR.md)
- The public surface (REST API, test framework, runner, config schema): [`docs/`](../docs/), starting at [quickstart.md](../docs/quickstart.md)

`package.json` is the full list of scripts. This page names the ones a contributor needs and the rules that are not written down anywhere else.

---

## 1. Setup

### Prerequisites

| Tool | Why | Where the version comes from |
|---|---|---|
| Node.js | Everything. Stores use `node:sqlite`, so older Node fails. | `engines.node` in `package.json`; `.node-version` for the exact dev version |
| pnpm | The repo is a pnpm workspace: the test apps under `test-applications/` are workspace packages | `pnpm-lock.yaml` (install with `--frozen-lockfile` to match CI) |
| Rust + `wasm32-wasip1` and `wasm32-wasip2` targets | Building the Rust test apps | Stable toolchain, except the CDN apps: their `rust-toolchain.toml` pins Rust 1.99 (proxy-wasm 0.2.5's `main!` does not link on 1.100+; rustup installs the pin on first build). Each Rust workspace picks its target in `.cargo/config.toml` |
| `fastedge-run` | Runs HTTP apps (and HTTP-app origins). CDN apps do not need it. | `.fastedge-cli-version` (the version CI tests with and releases ship) |

AssemblyScript and `fastedge-build` (the JS SDK compiler) come in as dev dependencies; nothing to install separately.

### Getting `fastedge-run`

`fastedge-run` is published on the releases page of the public `G-Core/FastEdge-lib` repository. The server looks for it in this order (`server/utils/fastedge-cli.ts`):

1. `FASTEDGE_RUN_PATH` (an absolute path to the binary)
2. The package's own copy: `dist/fastedge-cli/<binary>` when installed from npm, `fastedge-run/<binary>` in this source tree
3. `fastedge-run` on `PATH`

For development, put the binary for your platform in `fastedge-run/` (gitignored) under the platform name: `fastedge-run-linux-x64`, `fastedge-run-darwin-arm64` or `fastedge-run.exe`. Use the version in `.fastedge-cli-version`; a different version can pass or fail HTTP-app tests for reasons unrelated to your change.

### Install and build

```bash
pnpm install
pnpm run build            # debugger (schemas + backend + frontend) and the library, in parallel
pnpm run build:test-apps  # every CDN and HTTP test app → wasm/
```

`pnpm run build:ci-test` does both builds at once; it is what CI runs before `pnpm test`.

---

## 2. Running the debugger

```bash
pnpm start        # serves the built dist/ on 127.0.0.1:5179
pnpm run dev      # backend watch (esbuild) + Vite dev server with hot reload
```

- The server prints an `Open:` URL to stderr with the session token in the fragment (`#token=…`). Open that URL; a bare `http://127.0.0.1:5179` gets `401` on every API call. Under `pnpm run dev` it also prints a `Dev:` URL for the Vite server (port 5173) carrying the same token.
- If 5179 is busy the server takes the next free port, up to 5228. Read the printed URL rather than assuming the port.
- `pnpm run dev` is Linux/macOS only (`dev:backend` uses `sleep`). On Windows run `dev:backend:esbuild`, `dev:backend:server` and `dev:frontend` in separate terminals.

### Environment variables you will meet while developing

| Variable | Effect |
|---|---|
| `PROXY_RUNNER_DEBUG=1` | Verbose logging in the server and CDN runner, including every host call |
| `FASTEDGE_RUN_PATH` | Absolute path to the `fastedge-run` binary to use |
| `FASTEDGE_TEST_CDN_RUNNER=worker` | Makes the CDN integration helpers build `WorkerProxyWasmRunner` (set by `test:integration:cdn:worker`) |
| `FASTEDGE_DEBUG_TOKEN` | Use this session token instead of a random one (server tests and scripts use it) |
| `PORT` | First port the server tries (default 5179) |
| `WORKSPACE_PATH` | Workspace root: the limit on every path read, and resource files (default: the current directory) |
| `FASTEDGE_APP_ROOT` | App root inside the workspace: `.fastedge-debug/` (port file, `app.wasm`, config) and the default dotenv folder (default: the workspace root) |

The user-facing variables are listed in [docs/API.md](../docs/API.md).

---

## 3. Running the tests

### The suites

| Command | What it runs | Config | Needs |
|---|---|---|---|
| `pnpm run test:backend` | Backend unit tests, `server/__tests__/unit/` | `vitest.config.ts` | Nothing built |
| `pnpm run test:frontend` | Frontend tests, `frontend/src/**/*.test.{ts,tsx}` (jsdom) | `frontend/vitest.config.ts` | Nothing built |
| `pnpm run test:unit` | Both of the above, in parallel | | |
| `pnpm run test:server` | Starts the bundled server (`dist/server.js`) as a subprocess and drives the REST/WebSocket API, `server/__tests__/server/` | `vitest.server.config.ts` | Rebuilds the backend itself; some files need test apps |
| `pnpm run test:integration:cdn:in-process` | CDN integration tests through `ProxyWasmRunner` | `vitest.integration.cdn.config.ts` | Test apps |
| `pnpm run test:integration:cdn:worker` | The same tests through `WorkerProxyWasmRunner` (`FASTEDGE_TEST_CDN_RUNNER=worker`) | same | Test apps |
| `pnpm run test:integration:cdn` | Both CDN modes, one after the other | | |
| `pnpm run test:integration:http` | HTTP-app integration tests, `server/__tests__/integration/http-apps/` | `vitest.integration.http.config.ts` | Test apps + `fastedge-run` |
| `pnpm run test:integration` | CDN (both modes) then HTTP | | |
| `pnpm test` | `test:unit`, then `test:server`, then `test:integration`, in sequence | | Everything |

Watch mode, the Vitest UI and coverage are in `package.json` (`test:watch*`, `test:ui`, `test:coverage*`). To run one file, call Vitest with the matching config:

```bash
pnpm exec vitest run --config vitest.integration.cdn.config.ts server/__tests__/integration/cdn-apps/redirect
```

### What to know before you run them

- **Why CDN tests run twice.** The debugger and `createRunner()` use `WorkerProxyWasmRunner`, which runs the app in a worker thread; `ProxyWasmRunner` is the in-process engine underneath it. Something that passes in-process can still fail through the worker (data that does not cross the thread boundary, a host call that needs the main thread). Run both before you push a CDN runner change.
- **CDN test files run in parallel; HTTP and server test files run one at a time.** HTTP tests spawn `fastedge-run` processes and server tests start servers from a shared port pool, so their configs set `fileParallelism: false`. Do not change that to speed things up.
- **A missing binary can skip instead of fail.** Tests parameterized over variants (`shared/variants.ts`) skip a variant whose `.wasm` is not in `wasm/`. A clean checkout without `build:test-apps` therefore reports skips, not failures, for those suites. Tests that load a fixed AssemblyScript binary through `loadCdnAppWasm()` throw instead. Check the skip count before you trust a green run.
- **Stale binaries are common.** After changing a test app, rebuild it. After pulling, rebuild the test apps before chasing a failure in the runner.
- **CI runs on Linux only**: the pull-request workflow runs `pnpm run build:ci-test` then `pnpm test` on ubuntu with the pinned `fastedge-run`. macOS and Windows are covered by the cross-platform rules (section 7), not by CI test runs.

---

## 4. Where tests live

| Kind | Location | Convention |
|---|---|---|
| Backend unit | `server/__tests__/unit/<area>/` | Mirrors the source tree: `server/runner/HeaderManager.ts` → `server/__tests__/unit/runner/HeaderManager.test.ts`. Never next to the source file. |
| Server (API over HTTP) | `server/__tests__/server/` | Use `startTestServer()` from `helpers.ts`: known token, temp `WORKSPACE_PATH`, real port discovery. |
| CDN integration | `server/__tests__/integration/cdn-apps/<topic>/` | One folder per feature; fixtures in a `fixtures/` folder beside the test. |
| HTTP integration | `server/__tests__/integration/http-apps/<app>/` | Same. |
| Shared integration helpers | `server/__tests__/integration/utils/`, `*/shared/variants.ts` | Not test files. |
| Frontend | Next to the code: `frontend/src/components/common/Toggle/Toggle.test.tsx` | Frontend tests **are** co-located, in the component's folder. |

Test names describe behaviour (`"returns NotFound for a missing header"`), grouped in nested `describe` blocks by method or behaviour.

---

## 5. Testing rules (mandatory)

### 5.1 Production parity decides what a test expects

A test's expected value is what the edge does, not what the code currently does. Before you write or change an expectation for a host function, property, header, store or response, settle the edge behaviour first (see Rule Zero in `CLAUDE.md`) and check [BEHAVIOUR.md](BEHAVIOUR.md). A test that encodes a debugger leniency is a bug.

### 5.2 Integration tests dogfood the test framework

Every CDN and HTTP integration test drives the app and asserts through the public test framework in `server/test-framework/`, the same API users import from `@gcoredev/fastedge-test/test`. Each integration test then checks both the feature and the framework.

| Instead of | Use |
|---|---|
| `runner.callFullFlow(url, method, headers, …)` | `runFlow(runner, { url, requestHeaders, … })` |
| `runner.execute({ path, method, … })` | `runHttpRequest(runner, { path, method, … })` |
| `expect(result.finalResponse.status).toBe(302)` | `assertFinalStatus(result, 302)` |
| `expect(result.finalResponse.headers.location)…` | `assertFinalHeader(result, 'location', …)` |
| `expect(hook.returnCode).toBe(1)` | `assertReturnCode(result.hookResults.onRequestHeaders, 1)` |
| Searching logs by hand | `assertLog` / `assertNoLog` (CDN), `assertHttpLog` / `assertHttpNoLog` (HTTP) |
| Header checks on a hook result | `assertRequestHeader`, `assertResponseHeader`, `assertNo…Header` |
| Property-violation checks | `assertPropertyAllowed` / `assertPropertyDenied` |
| `expect(res.status)`, `JSON.parse(res.body)`, body checks | `assertHttpStatus`, `assertHttpJson<T>`, `assertHttpBody`, `assertHttpBodyContains`, `assertHttpHeader`, `assertHttpContentType` |

The full list with signatures is in [docs/TEST_FRAMEWORK.md](../docs/TEST_FRAMEWORK.md#assertion-helpers).

Raw `expect()` is still right for what the framework has no helper for: the set of hooks that ran (`Object.keys(result.hookResults)`), a hook that must be `undefined`, deep object matching, and checks on the test setup itself.

When you add an assertion to `server/test-framework/assertions.ts`, use it in an integration test, migrate tests that do the same check with raw `expect()`, and document it in `docs/TEST_FRAMEWORK.md`.

Reference tests to copy:

- CDN: `server/__tests__/integration/cdn-apps/redirect/cdn-redirect.test.ts` (`runFlow` + CDN assertions)
- HTTP: `server/__tests__/integration/http-apps/echo-post/echo-post.test.ts` (`runHttpRequest` + HTTP assertions, parameterized over variants)

### 5.3 Build runners with the test helpers

- CDN: `createTestRunner()` / `createTestRunnerWithDotenv()` from `integration/utils/test-helpers.ts`. They honour `FASTEDGE_TEST_CDN_RUNNER`, so the same file runs in both CDN modes, and property access control is always enforced. Constructing `ProxyWasmRunner` directly in a test silently drops the worker run.
- HTTP: `createHttpWasmRunner()` (dotenv off) or `createHttpWasmRunnerWithDotenv()` from `integration/utils/http-wasm-helpers.ts`.
- Dotenv: give each suite its own `fixtures/` folder and pass it as `load(…, { dotenv: { path } })`. Without a path, dotenv reads from the working directory (the repo root), so suites share state and pick up a developer's own `.env` files. Use the dotenv-off helper whenever a test does not need dotenv.

### 5.4 Pick the cheapest origin that proves the point (CDN)

1. **`url: 'built-in'`**: the built-in responder answers locally, steered by the `x-debugger-status` and `x-debugger-content` request headers. No port, no process, no network. This is the default.
2. **`mockOrigins()`** (from the test framework): an undici mock that intercepts the origin fetch and `proxy_http_call`, when the test needs specific origin statuses, bodies or headers. Example: `cdn-apps/full-flow/mocked-origin.test.ts`.
3. **An HTTP test app as the origin** (`spawnDownstreamHttpApp()`, e.g. `http-responder`), only when the test needs real HTTP behaviour on the wire.
4. **A real external URL**, only when the test is about that external service. These tests depend on the network.

### 5.5 HTTP-app suites

- Spawn once: create and `load()` the runner in `beforeAll`, `cleanup()` in `afterAll`. Starting `fastedge-run` takes seconds.
- Give `beforeAll` a timeout of at least 30 s; startup is slow under load.
- Suites that start `fastedge-run` begin `beforeAll` with a 2 s wait so the previous file's ports are released. Keep that pattern in new suites that spawn processes.

### 5.6 Every change comes with a test

- A bug fix starts with a test that fails before the fix.
- A feature ships with tests for its success path, error paths and edge cases.
- A refactor keeps the existing tests passing unchanged.
- New exports from `server/` and new frontend components, hooks and utilities come with tests. Do not test type definitions, third-party code or trivial getters.

### 5.7 Unit and frontend test gotchas

- `await` every `userEvent` call; wrap hook state changes in `act()`; use `waitFor()` only for asynchronous changes.
- CSS Module class names are hashed. Select by role or text (`screen.getByRole`), or by partial class match (`[class*="toggleSwitch"]`), never by the full generated name.
- Mock modules at the top of the file with `vi.mock()`, read them back through `vi.mocked()`, and `vi.clearAllMocks()` in `beforeEach`.
- The frontend setup file (`frontend/src/test/setup.ts`) adds the jest-dom matchers and a `localStorage` mock.
- Header serialization tests read the buffer with `DataView` and little-endian (`true`) offsets; see `unit/runner/HeaderManager.test.ts`.
- Host functions can be unit-tested without a wasm binary: call `new HostFunctions(…).createImports()` with stub memory and invoke the import directly. See `unit/runner/HostFunctions.test.ts`.

---

## 6. Test applications and variants

Integration tests run real wasm binaries built from source in `test-applications/`. Binaries are build output in `wasm/` (gitignored; the folder structure is tracked with `.gitkeep` files).

### Layout

| Source | Language / SDK | Built by | Output |
|---|---|---|---|
| `test-applications/cdn-apps/as/cdn-<name>/` | AssemblyScript, proxy-wasm SDK; shared code in `as_utils/` | Each app's own `package.json` (`build:cdn-test-apps:as` runs them all) | `wasm/cdn-apps/as/<name>/*.wasm` |
| `test-applications/cdn-apps/rust/cdn-<name>/` | Rust, `proxy-wasm` + `fastedge` (`proxywasm` feature); one Cargo workspace | `scripts/build-rust-wasm.sh … --strip-prefix cdn-` | `wasm/cdn-apps/rust/<name>/<name>.wasm` |
| `test-applications/http-apps/js/src/<app>.ts` | JS SDK, compiled with `fastedge-build` | `test-applications/http-apps/js/package.json` | `wasm/http-apps/js/<app>.wasm` |
| `test-applications/http-apps/rust/basic/<app>/` | Rust, `#[fastedge::http]` (legacy sync API), `wasm32-wasip1` | `scripts/build-rust-wasm.sh … --flat` | `wasm/http-apps/rust/basic/<app>.wasm` |
| `test-applications/http-apps/rust/wasi/<app>/` | Rust, `#[wstd::http_server]` (async), `wasm32-wasip2` | `scripts/build-rust-wasm.sh … --flat` | `wasm/http-apps/rust/wasi/<app>.wasm` |

Build one group with the matching script (`build:cdn-test-apps:as`, `build:cdn-test-apps:rust`, `build:http-test-apps:js`, `build:http-test-apps:rust`). Running `cargo build` by hand compiles but does not copy anything into `wasm/`; go through the script.

`build-rust-wasm.sh` reads the target from the workspace's `.cargo/config.toml`, converts `_` to `-` in crate names, `--strip-prefix` removes a prefix from the output name, and `--flat` writes `<out>/<name>.wasm` instead of `<out>/<name>/<name>.wasm`.

### Variants

A variant is the same app written in another language or SDK. Each variant must behave identically, so one parameterized test checks all of them.

- HTTP: `server/__tests__/integration/http-apps/shared/variants.ts` defines `js`, `rust-basic` and `rust-wasi`, with `resolveWasmPath()` and `wasmExists()`.
- CDN: `server/__tests__/integration/cdn-apps/shared/variants.ts` defines `as` and `rust`, with `resolveCdnWasmPath()` and `cdnWasmExists()`.

The pattern is a loop over the variants that picks `describe` or `describe.skip` by whether the binary exists; copy it from `echo-post.test.ts`. A variant whose SDK cannot express the feature simply has no binary for it and is skipped.

The `rust-basic` variant exists because the edge still runs legacy `#[fastedge::http]` binaries. The HTTP runner recognises them by their exports (`server/utils/legacy-wasm-detect.ts`) and starts `fastedge-run` with `--wasi-http false`. Keep that detection in that one file.

### Adding an HTTP test app

1. Write the app in every variant that can express it, with identical responses, headers and logs:
   - JS: `test-applications/http-apps/js/src/<app>.ts`, plus a `build:<app>` and `copy:<app>` entry in that folder's `package.json` (add them to `build:all` and `copy:wasm`).
   - Rust: a crate in `rust/basic/` and/or `rust/wasi/`, added to the workspace `members` in that folder's `Cargo.toml`. The build script picks it up from there.
2. `pnpm run build:http-test-apps`.
3. Write one parameterized test in `server/__tests__/integration/http-apps/<app>/` using `runHttpRequest` and the HTTP assertions.
4. Run `pnpm run test:integration:http` and confirm no variant was skipped.

### Adding a CDN test app

- **AssemblyScript**: add an entry file to an existing app's `assembly/` folder, or create `cdn-apps/as/cdn-<name>/` by copying an existing app. In its `package.json`, add the `asc` build line and a copy line that moves the binary to `wasm/cdn-apps/as/<name>/`. For a new folder, also create `wasm/cdn-apps/as/<name>/.gitkeep`; the copy step does not create the directory. Register the filename in `WASM_TEST_BINARIES` in `integration/utils/wasm-loader.ts` and load it with `loadCdnAppWasm()`.
- **Rust**: add `cdn-<name>` to `test-applications/cdn-apps/rust/Cargo.toml` `members`; it builds to `wasm/cdn-apps/rust/<name>/<name>.wasm`.
- If both languages implement it, parameterize the test over `CDN_APP_VARIANTS`.
- `pnpm run build:cdn-test-apps`, then `pnpm run test:integration:cdn` (both modes).

---

## 7. Coding conventions

### 7.1 Cross-platform code (hard rule)

The published package must work out of the box on **linux-x64, darwin-arm64 and win32-x64**. CI tests only run on Linux, so a platform bug reaches users unless you follow these rules. They apply to all process, path, signal, temp-file, port and shell code under `server/` and `bin/`.

- **Paths: always `node:path`.** `path.join()` / `path.resolve()`, never string concatenation with `/` or `\\`.
- **Temp files: always `os.tmpdir()`.** Never a literal `/tmp`. Reuse `server/utils/temp-file-manager.ts`.
- **Processes: `spawn()` with an argument array.** No `exec()` with shell syntax (`&&`, `|`, `&`, quoting) in shipped code.
- **Stopping a child process: `SIGINT` first, then a platform-specific force kill.** `SIGINT` is the signal `fastedge-run` handles, and Node translates it on Windows. On timeout use `taskkill /F /T /PID <pid>` on win32 (kills the process tree) and `SIGKILL` elsewhere. **Never use `SIGTERM`** to stop a child: it is not reliably delivered on Windows. The reference implementation is `HttpWasmRunner.killProcess()`.
- **Cleanup on exit: pair signal handlers with `process.on("exit")`.** Windows never sends `SIGTERM` to the server, so the `.fastedge-debug/.debug-port` file is removed from an `exit` handler as well as from the `SIGINT`/`SIGTERM` handlers (`server/server.ts`). The `exit` event does not fire after a hard kill; the port probe tolerates a stale port file because it checks `/health`.
- **Platform branching: one switch on `process.platform`**, following `getCliBinaryName()` in `server/utils/fastedge-cli.ts`, which is also the reference for `where` vs `which` and for skipping `chmod` on win32.
- **Ports: never assume 5179.** The server probes 5179–5228; tests and tools read the actual port (from stderr or the port file). Port allocation for `fastedge-run` goes through `server/runner/PortManager.ts`.
- **`package.json` scripts:** orchestrate with `npm-run-all2` (`run-s`, `run-p`) rather than `&` or `&&`, and set environment variables with `cross-env`. The contributor workflow (dev, build, test scripts) runs on Linux and macOS; do not add anything to the scripts the published package runs (`start`, `bin/`) that needs a POSIX shell.

### 7.2 Frontend components

Each component is a folder with its implementation, a CSS Module and a barrel export:

```
frontend/src/components/common/Toggle/
  Toggle.tsx           # component
  Toggle.module.css    # scoped styles, camelCase class names
  index.tsx            # export { Toggle } from "./Toggle";
  Toggle.test.tsx      # tests, next to the component
```

- Put a component in `components/common/` if more than one view uses it, in `components/proxy-wasm/` if only the CDN view does. Views are in `frontend/src/views/`.
- Static styles go in the CSS Module. Inline `style={{…}}` is only for values computed at runtime and for a `style` prop passed through.
- Compose classes with template strings: `` `${styles.button} ${active ? styles.active : ""}` ``.
- Import the component folder (`from "../../components/common/Toggle"`), which resolves to the barrel, never the inner `Toggle.tsx`.
- `Toggle` is the smallest complete example to copy.

State management (Zustand slices) and the component tree are described in [ARCHITECTURE.md](ARCHITECTURE.md).

### 7.3 Adding a host function (CDN apps)

Host functions are the imports an app's wasm calls. All of them are defined inside `HostFunctions.createImports()` in `server/runner/HostFunctions.ts`.

1. **Settle the edge behaviour first**: arguments, return status for every failure, which hooks may call it, what it writes back. Write it as a comment on the implementation.
2. Add the import to the object returned by `createImports()`. Start with `this.setLastHostCall(…)` (it names the failing call when a trap happens), read inputs through `this.memory`, write results with the pointer-to-pointer helpers (`writeStringResult(value, ptrPtr, lenPtr)`), and return a `ProxyStatus`.
3. If it touches header maps or buffers, follow the existing map-type and per-hook checks (`unsupportedMapStatus()` and friends) instead of adding new ones.
4. If it does I/O, remember that under `WorkerProxyWasmRunner` the host function runs in the worker thread: network fetches (origin, `proxy_http_call`) are made in the parent, and cache / Edge KV calls reach the storage service over a synchronous bridge (`storesBridge.ts`, `StoresHost.ts`). Follow those paths rather than adding a new one, and run the CDN suite in both modes.
5. Unit-test it through `createImports()` with stub memory (see `HostFunctions.test.ts`), then add an integration test with a test app that calls it.
6. Record what an app observes, and any difference from the edge, in [BEHAVIOUR.md](BEHAVIOUR.md).

### 7.4 Adding a property (CDN apps)

1. Settle the edge behaviour: value, type, and per-hook access (read-only, read-write, write-only, or absent).
2. Resolve the value in `PropertyResolver.resolveStandard()` (`server/runner/PropertyResolver.ts`), adding any state it needs to the resolver.
3. Add its access rules to `BUILT_IN_PROPERTIES` in `server/runner/PropertyAccessControl.ts`. Without an entry it is treated as a custom property, and the access-control rules for custom properties apply. If a write is refused on the edge, check whether it belongs in `EDGE_REFUSED_WRITES`.
4. Add it to the unit tests (`PropertyResolver.test.ts`, `PropertyAccessControl.test.ts`) and to the property-access integration tests (`cdn-apps/property-access/`), building a test app in `cdn-apps/as/cdn-properties/` if none reads or writes it yet.
5. Document it in [BEHAVIOUR.md](BEHAVIOUR.md), and in `docs/` if users can set it.

### 7.5 Schemas, API and docs

- The JSON Schemas in `schemas/` are generated from the Zod schemas in `server/schemas/` and the runner types, and committed. After changing a config, API body or result type, run `pnpm run build:schemas` and commit the result.
- `pnpm run check-types` type-checks the server and the frontend without building (PR CI runs it).
- `docs/` is generated: `pnpm run generate:docs [FILE.md …]` updates it from the source and
  `fastedge-plugin-source/.generation-config.md`. A change to the public API, config format, test
  framework or runner regenerates the matching doc in the same commit; review the diff.
- The generator reads the existing doc and keeps accurate hand edits, but it can undo them, and a
  doc generated from scratch has none. So when it gets something wrong, fix the cause too: a stale
  code comment, or a rule in that doc's section of `.generation-config.md` ("Corrections from
  earlier generations"). Facts the code can't show (edge behaviour, Gcore API shapes) go in
  `.generation-config.md`. A fix made only in `docs/` will not last.
- The exception is `docs/SECURITY.md`, which is written by hand (the generator never touches it). A change
  to the server's protections (bind, token, path checks, egress, isolation of apps) updates it.
- A change to a mechanism updates [ARCHITECTURE.md](ARCHITECTURE.md); a change to what an app observes updates [BEHAVIOUR.md](BEHAVIOUR.md); a new command, test convention or rule updates this file.

### 7.6 Commits

Commits are conventional (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, optionally scoped as `fix(origin):`). Release versions and notes are generated from them, so the type matters: `feat` is a minor release, `fix` a patch. The body says what changed and why; that is the project history.

### 7.7 Before you push

- [ ] `pnpm run check-types` and `pnpm run test:unit` pass.
- [ ] Test apps rebuilt if you touched `test-applications/`, and `pnpm run test:integration` passes with no unexpected skips.
- [ ] A CDN runner change passed both `test:integration:cdn:in-process` and `test:integration:cdn:worker`.
- [ ] An API or server change passed `pnpm run test:server`.
- [ ] Process, path, signal or script code follows section 7.1.
- [ ] Schemas regenerated if a config, API or result type changed.
- [ ] The doc that describes what you changed is updated in the same commit.
- [ ] Nothing in the change (code, comments, docs, tests, commit message) links or path-references a private repository or a folder that only exists on your machine.

---

## 8. When a test fails

| Symptom | Usual cause |
|---|---|
| `Failed to load WASM binary at …/wasm/…` | Test apps not built. Run `pnpm run build:test-apps`. |
| A variant's `describe` block shows as skipped | That variant's binary is missing from `wasm/`. Build it, or confirm the SDK cannot express the feature. |
| `fastedge-run CLI not found in any of these locations` | No binary in `fastedge-run/`, `FASTEDGE_RUN_PATH` or `PATH` (section 1). |
| HTTP tests fail only with your local `fastedge-run` | Its version differs from `.fastedge-cli-version`. |
| A test app behaves as if your change never happened | Stale binary. Rebuild that test app group. |
| Passes in-process, fails through the worker | State or data that does not cross the worker boundary, or I/O done in the worker instead of the parent (section 7.3, step 4). |
| An AssemblyScript app aborts or traps | The abort message ends with `lastHostCall=…`, the last host function the app called. `PROXY_RUNNER_DEBUG=1` logs every host call. |
| `401` from the API in a script or test | Missing `x-fastedge-token` header. |
| Server tests time out on startup | `dist/server.js` is stale or missing; `test:server` rebuilds it, a direct `vitest` call does not. |

---

## 9. Finding things

The docs point at files; the code is the final word. When they disagree, trust the code and fix the doc.

```bash
# Which docs mention a topic, then the section headings of one doc
grep -ril "websocket" context/ docs/
grep -n "^## " context/ARCHITECTURE.md

# Code
grep -rn "proxy_http_call" server/runner/
grep -rln "useAppStore" frontend/src/
```

History is `git log`, not a changelog:

```bash
git log --oneline -i --grep=websocket          # commits whose message mentions a term
git log --oneline -S"isBuiltInUrl"             # commits that added or removed a string
git log --oneline --follow -- server/runner/cdnFlow.ts   # history of one file
git show <sha>                                 # message and diff of one commit
```

Before changing behaviour, `git log -S` on the code you are about to touch usually finds the commit that explains why it is the way it is.

---

## 10. Notes for AI agents

### Prefer the programmatic API for TDD

To check an app's behaviour, write a test with the test framework (`@gcoredev/fastedge-test/test` in a user project, `server/test-framework/` inside this repo) instead of driving the debugger over HTTP. It needs no server, gives deterministic results and assertion failures you can read, and is what the integration tests already do. See [docs/TEST_FRAMEWORK.md](../docs/TEST_FRAMEWORK.md).

### When you do drive the debugger's REST API

The full reference is [docs/API.md](../docs/API.md). The parts agents get wrong:

- **Send the session token** as `x-fastedge-token` on every `/api/*` call. It is the fragment of the printed `Open:` URL, or a token of your choosing set through `FASTEDGE_DEBUG_TOKEN` before start. `/health` is the only endpoint without a token.
- **Use `127.0.0.1`, not `localhost`**, to avoid IPv6 resolution delays.
- **Tag your requests with `X-Source: ai_agent`.** The server attaches the source to the WebSocket events it broadcasts, so a person watching the UI sees which requests came from you. Every API call shows up live in connected UIs.
- **Check that the load succeeded** (`ok: true` in the `/api/load` response) before sending requests.
- **Logs come back at every level.** The runner captures at Trace; there is no log-level request parameter. Filter by `level` yourself (0 Trace … 5 Critical).
- **When an app fails locally, check its build first**, and whether it fails on the edge too, before changing the debugger.
