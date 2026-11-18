# fastedge-test Documentation

`@gcoredev/fastedge-test` — local test runner and debugger for FastEdge WASM modules.

## Documentation Files

| File                                   | Audience              | Description                                                                                      |
| -------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------ |
| [quickstart.md](quickstart.md)         | All users             | Install, configure, and run your first test in under five minutes                                |
| [TEST_FRAMEWORK.md](TEST_FRAMEWORK.md) | Test authors          | High-level API (`defineTestSuite`, `runTestSuite`, assertions) for writing automated test suites |
| [TEST_CONFIG.md](TEST_CONFIG.md)       | Test authors          | `fastedge-config.test.json` schema — all fields, defaults, and validation rules                  |
| [STORES.md](STORES.md)                 | Test authors          | Seeding and inspecting the cache and Edge KV stores in tests                                     |
| [RESOURCES.md](RESOURCES.md)           | Test authors          | Testing several apps on one CDN resource: rules, hooks and the built-in origin                   |
| [RUNNER.md](RUNNER.md)                 | Advanced / CI tooling | Low-level programmatic API for direct runner lifecycle control                                   |
| [DEBUGGER.md](DEBUGGER.md)             | All users             | `fastedge-debug` CLI — starting the interactive debugger server                                  |
| [API.md](API.md)                       | Tooling integrators   | HTTP REST API exposed by the debugger server                                                     |
| [WEBSOCKET.md](WEBSOCKET.md)           | Tooling integrators   | WebSocket event stream API for real-time server events                                           |
| [SECURITY.md](SECURITY.md)             | All                   | Security posture of the debugger server — mitigations in place and accepted limitations          |

## Quick Links

| Goal                                             | Start here                             |
| ------------------------------------------------ | -------------------------------------- |
| Writing tests for a WASM module                  | [TEST_FRAMEWORK.md](TEST_FRAMEWORK.md) |
| Writing tests with Vitest fixtures               | [TEST_FRAMEWORK.md](TEST_FRAMEWORK.md) |
| Understanding the test config file format        | [TEST_CONFIG.md](TEST_CONFIG.md)       |
| Seeding the cache or Edge KV stores in tests     | [STORES.md](STORES.md)                 |
| Several apps on one CDN resource                 | [RESOURCES.md](RESOURCES.md)           |
| Running the interactive debugger UI              | [DEBUGGER.md](DEBUGGER.md)             |
| Building custom CI or automation tooling         | [API.md](API.md)                       |
| Subscribing to real-time server events           | [WEBSOCKET.md](WEBSOCKET.md)           |
| Direct runner control without the test framework | [RUNNER.md](RUNNER.md)                 |
| First time using this package                    | [quickstart.md](quickstart.md)         |

## Package Exports

| Entry point | Description                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------- |
| `.`         | Main entry — runner API, resource API, store helpers, request-context presets and core types    |
| `./test`    | Test framework API — use this for writing and running test suites                               |
| `./vitest`  | Vitest `test` with FastEdge fixtures; requires the optional `vitest` peer dependency            |
| `./server`  | Debugger server entry — used by the `fastedge-debug` CLI binary; not intended for direct import |
| `./schemas` | JSON Schema files for `fastedge-config.test.json` — reference in editors for validation         |

### `@gcoredev/fastedge-test` (`.`)

Exports the low-level runner API. See [RUNNER.md](RUNNER.md) for full reference.

```typescript
import { createRunner, createRunnerFromBuffer } from "@gcoredev/fastedge-test";
```

| Export                   | Kind     | Description                                               |
| ------------------------ | -------- | --------------------------------------------------------- |
| `createRunner`           | function | Creates a runner instance from a WASM file path           |
| `createRunnerFromBuffer` | function | Creates a runner instance from a `Buffer` or `Uint8Array` |
| `createResource`         | function | Loads a resource: several apps, one per hook              |
| `matchRule`              | function | Matches a request against a resource's rules              |
| `createStores`           | function | Creates in-memory cache and Edge KV stores for a test     |
| `ProxyWasmRunner`        | class    | Runner implementation for proxy-wasm (CDN) modules        |
| `BUILTIN_URL`            | const    | Canonical URL for the built-in mock origin responder      |
| `BUILTIN_SHORTHAND`      | const    | Shorthand string for the built-in mock origin responder   |
| `DEFAULT_RESOURCE_FILE`  | const    | Default resource config file name                         |
| `CLIENT_PRESETS`         | const    | Preset client request-context values                      |
| `EDGE_PRESETS`           | const    | Preset edge request-context values                        |
| `HttpWasmRunner`         | class    | Runner implementation for HTTP WASM modules               |
| `WasmRunnerFactory`      | class    | Factory for creating the appropriate runner by WASM type  |
| `NullStateManager`       | class    | No-op state manager for stateless runner use              |
| `IWasmRunner`            | type     | Interface all runner implementations satisfy              |
| `IStateManager`          | type     | Interface for runner state managers                       |
| `WasmType`               | type     | Union of supported WASM module types                      |
| `RunnerConfig`           | type     | Configuration options passed to runner constructors       |
| `HttpRequest`            | type     | HTTP request shape used by the runner                     |
| `HttpResponse`           | type     | HTTP response shape returned by the runner                |
| `HookResult`             | type     | Result of a single proxy-wasm hook invocation             |
| `FullFlowResult`         | type     | Aggregated result of a complete request flow              |
| `HookCall`               | type     | Descriptor for a proxy-wasm hook call                     |
| `LocalResponse`          | type     | Response produced locally by a hook                       |
| `OriginResponse`         | type     | Origin response supplied to a CDN flow                    |
| `CdnHook`                | type     | Name of a proxy-wasm CDN hook                             |
| `Resource`               | type     | A loaded resource                                         |
| `ResourceRequest`        | type     | Request passed to a resource                              |
| `ResourceResult`         | type     | Result of a resource request                              |
| `CreateResourceOptions`  | type     | Options accepted by `createResource`                      |
| `StoreCall`              | type     | A recorded cache or Edge KV store call                    |
| `TestStores`             | type     | Per-test cache and Edge KV stores                         |
| `CreateStoresOptions`    | type     | Options accepted by `createStores`                        |
| `StoresSeed`             | type     | Seed data for the cache and Edge KV stores                |
| `ClientContext`          | type     | Client-side request context values                        |
| `EdgeContext`            | type     | Edge-side request context values                          |
| `RequestContext`         | type     | Combined client and edge request context                  |
| `Preset`                 | type     | A named request-context preset                            |

### `@gcoredev/fastedge-test/test`

Exports the high-level test framework. See [TEST_FRAMEWORK.md](TEST_FRAMEWORK.md) for full reference.

```typescript
import { defineTestSuite, runAndExit } from "@gcoredev/fastedge-test/test";
```

| Export                       | Kind     | Description                                                          |
| ---------------------------- | -------- | -------------------------------------------------------------------- |
| `defineTestSuite`            | function | Validates and returns a typed `TestSuite` definition                 |
| `runTestSuite`               | function | Executes a `TestSuite` and returns a `SuiteResult`                   |
| `runAndExit`                 | function | Runs a suite and exits the process with a pass/fail code             |
| `runFlow`                    | function | Executes a single request flow directly                              |
| `runHttpRequest`             | function | Executes a single HTTP request directly                              |
| `loadConfigFile`             | function | Loads and validates a `fastedge-config.test.json` file               |
| `mockOrigins`                | function | Creates mock HTTP origins that respond to outgoing HTTP calls        |
| `createStores`               | function | Creates in-memory cache and Edge KV stores for a test                |
| `createResource`             | function | Loads a resource: several apps, one per hook                         |
| `assertRequestHeader`        | function | Asserts a header is present on the outgoing request                  |
| `assertNoRequestHeader`      | function | Asserts a header is absent from the outgoing request                 |
| `assertResponseHeader`       | function | Asserts a header is present on the final response                    |
| `assertNoResponseHeader`     | function | Asserts a header is absent from the final response                   |
| `assertFinalStatus`          | function | Asserts the final HTTP status code                                   |
| `assertFinalHeader`          | function | Asserts a header on the final response                               |
| `assertReturnCode`           | function | Asserts the proxy-wasm return code                                   |
| `assertLog`                  | function | Asserts a log entry was emitted                                      |
| `assertNoLog`                | function | Asserts a log entry was not emitted                                  |
| `logsContain`                | function | Returns whether logs contain a matching entry                        |
| `hasPropertyAccessViolation` | function | Returns whether any property access violation was recorded           |
| `assertPropertyAllowed`      | function | Asserts that a WASM property read was allowed                        |
| `assertPropertyDenied`       | function | Asserts that a WASM property read was denied                         |
| `assertHttpStatus`           | function | Asserts the HTTP response status code                                |
| `assertHttpHeader`           | function | Asserts a header is present on the HTTP response                     |
| `assertHttpNoHeader`         | function | Asserts a header is absent from the HTTP response                    |
| `assertHttpBody`             | function | Asserts the HTTP response body equals a value                        |
| `assertHttpBodyContains`     | function | Asserts the HTTP response body contains a substring                  |
| `assertHttpJson`             | function | Asserts the HTTP response body matches a JSON value                  |
| `assertHttpContentType`      | function | Asserts the HTTP response Content-Type header                        |
| `assertHttpLog`              | function | Asserts a log entry was emitted during HTTP request handling         |
| `assertHttpNoLog`            | function | Asserts a log entry was not emitted during HTTP request handling     |
| `MockOriginsHandle`          | type     | Handle returned by `mockOrigins` — use to stop the mock servers      |
| `MockOriginsOptions`         | type     | Options accepted by `mockOrigins`                                    |
| `TestSuite`                  | type     | Suite definition — one of `wasmPath` or `wasmBuffer` plus test cases |
| `TestCase`                   | type     | A single test scenario with config and assertions                    |
| `ResourceTestSuite`          | type     | Suite definition for a multi-app resource                            |
| `ResourceTestCase`           | type     | A single test scenario for a resource                                |
| `TestResult`                 | type     | Result of a single test case execution                               |
| `SuiteResult`                | type     | Aggregated result returned by `runTestSuite`                         |
| `FlowOptions`                | type     | Options accepted by `runFlow`                                        |
| `HttpRequestOptions`         | type     | Options accepted by `runHttpRequest`                                 |
| `RunnerConfig`               | type     | Configuration options for the underlying runner                      |
| `Resource`                   | type     | A loaded resource                                                    |
| `ResourceRequest`            | type     | Request passed to a resource                                         |
| `ResourceResult`             | type     | Result of a resource request                                         |
| `TestStores`                 | type     | Per-test cache and Edge KV stores                                    |
| `CreateStoresOptions`        | type     | Options accepted by `createStores`                                   |

### `@gcoredev/fastedge-test/vitest`

Exports a Vitest `test` function extended with FastEdge fixtures (`stores`, `runner`, `resource`). Each fixture is created per test and cleaned up when the test ends. The entry is ESM-only and requires the optional `vitest` peer dependency. See [TEST_FRAMEWORK.md](TEST_FRAMEWORK.md) for full reference.

```typescript
import { test } from "@gcoredev/fastedge-test/vitest";
import { expect } from "vitest";

test("counts requests", async ({ runner, stores }) => {
  const app = await runner("dist/app.wasm");
  await app.callFullFlow("built-in", "GET", {}, "", {}, true);
  expect(stores.cache.get("hits")).toBe("1");
});
```

| Export             | Kind     | Description                                                                |
| ------------------ | -------- | -------------------------------------------------------------------------- |
| `test`             | const    | Vitest `test` extended with the `stores`, `runner` and `resource` fixtures |
| `createStores`     | function | Creates stores to share across tests, passed as `RunnerConfig.stores`      |
| `TestStores`       | type     | Per-test cache and Edge KV stores                                          |
| `FastEdgeFixtures` | type     | Fixture types provided by `test`                                           |

### `@gcoredev/fastedge-test/server`

The debugger server entrypoint. This export is used internally by the `fastedge-debug` binary and is not intended for direct import. Start the server via the CLI instead — see [DEBUGGER.md](DEBUGGER.md).

### `@gcoredev/fastedge-test/schemas`

Directory of JSON Schema files. Point your editor's `$schema` field at the appropriate file to enable validation and autocompletion in `fastedge-config.test.json`. See [TEST_CONFIG.md](TEST_CONFIG.md) for usage.

## Internal Documentation

Contributors and developers working in this repository should refer to the internal context documentation:

- [`context/CONTEXT_INDEX.md`](../context/CONTEXT_INDEX.md) — discovery-based index of all internal developer docs
