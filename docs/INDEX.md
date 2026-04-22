# fastedge-test Documentation

`@gcoredev/fastedge-test` — local test runner and debugger for FastEdge WASM modules.

## Documentation Files

| File                                   | Audience              | Description                                                                                      |
| -------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------ |
| [quickstart.md](quickstart.md)         | All users             | Install, configure, and run your first test in under five minutes                                |
| [TEST_FRAMEWORK.md](TEST_FRAMEWORK.md) | Test authors          | High-level API (`defineTestSuite`, `runTestSuite`, assertions) for writing automated test suites |
| [TEST_CONFIG.md](TEST_CONFIG.md)       | Test authors          | `fastedge-config.test.json` schema — all fields, defaults, and validation rules                  |
| [RUNNER.md](RUNNER.md)                 | Advanced / CI tooling | Low-level programmatic API for direct runner lifecycle control                                   |
| [DEBUGGER.md](DEBUGGER.md)             | All users             | `fastedge-debug` CLI — starting the interactive debugger server                                  |
| [API.md](API.md)                       | Tooling integrators   | HTTP REST API exposed by the debugger server                                                     |
| [WEBSOCKET.md](WEBSOCKET.md)           | Tooling integrators   | WebSocket event stream API for real-time server events                                           |

## Quick Links

| Goal                                             | Start here                             |
| ------------------------------------------------ | -------------------------------------- |
| Writing tests for a WASM module                  | [TEST_FRAMEWORK.md](TEST_FRAMEWORK.md) |
| Understanding the test config file format        | [TEST_CONFIG.md](TEST_CONFIG.md)       |
| Running the interactive debugger UI              | [DEBUGGER.md](DEBUGGER.md)             |
| Building custom CI or automation tooling         | [API.md](API.md)                       |
| Subscribing to real-time server events           | [WEBSOCKET.md](WEBSOCKET.md)           |
| Direct runner control without the test framework | [RUNNER.md](RUNNER.md)                 |
| First time using this package                    | [quickstart.md](quickstart.md)         |

## Package Exports

| Entry point | Description                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------- |
| `.`         | Main entry — runner API and core types                                                          |
| `./test`    | Test framework API — use this for writing and running test suites                               |
| `./server`  | Debugger server entry — used by the `fastedge-debug` CLI binary; not intended for direct import |
| `./schemas` | JSON Schema files for `fastedge-config.test.json` — reference in editors for validation        |

### `@gcoredev/fastedge-test` (`.`)

Exports the low-level runner API. See [RUNNER.md](RUNNER.md) for full reference.

```typescript
import { createRunner, createRunnerFromBuffer } from "@gcoredev/fastedge-test";
```

| Export                   | Kind     | Description                                               |
| ------------------------ | -------- | --------------------------------------------------------- |
| `createRunner`           | function | Creates a runner instance from a WASM file path           |
| `createRunnerFromBuffer` | function | Creates a runner instance from a `Buffer` or `Uint8Array` |
| `ProxyWasmRunner`        | class    | Runner implementation for proxy-wasm (CDN) modules        |
| `BUILTIN_URL`            | const    | Canonical URL for the built-in mock origin responder      |
| `BUILTIN_SHORTHAND`      | const    | Shorthand string for the built-in mock origin responder   |
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

### `@gcoredev/fastedge-test/test`

Exports the high-level test framework. See [TEST_FRAMEWORK.md](TEST_FRAMEWORK.md) for full reference.

```typescript
import { defineTestSuite, runAndExit } from "@gcoredev/fastedge-test/test";
```

| Export                       | Kind     | Description                                                        |
| ---------------------------- | -------- | ------------------------------------------------------------------ |
| `defineTestSuite`            | function | Validates and returns a typed `TestSuite` definition               |
| `runTestSuite`               | function | Executes a `TestSuite` and returns a `SuiteResult`                 |
| `runAndExit`                 | function | Runs a suite and exits the process with a pass/fail code           |
| `runFlow`                    | function | Executes a single request flow directly                            |
| `runHttpRequest`             | function | Executes a single HTTP request directly                            |
| `loadConfigFile`             | function | Loads and validates a `fastedge-config.test.json` file             |
| `assertRequestHeader`        | function | Asserts a header is present on the outgoing request                |
| `assertNoRequestHeader`      | function | Asserts a header is absent from the outgoing request               |
| `assertResponseHeader`       | function | Asserts a header is present on the final response                  |
| `assertNoResponseHeader`     | function | Asserts a header is absent from the final response                 |
| `assertFinalStatus`          | function | Asserts the final HTTP status code                                 |
| `assertFinalHeader`          | function | Asserts a header on the final response (alias for response header) |
| `assertReturnCode`           | function | Asserts the proxy-wasm return code                                 |
| `assertLog`                  | function | Asserts a log entry was emitted                                    |
| `assertNoLog`                | function | Asserts a log entry was not emitted                                |
| `logsContain`                | function | Returns whether logs contain a matching entry                      |
| `hasPropertyAccessViolation` | function | Returns whether any property access violation was recorded         |
| `assertPropertyAllowed`      | function | Asserts that a WASM property read was allowed                      |
| `assertPropertyDenied`       | function | Asserts that a WASM property read was denied                       |
| `assertHttpStatus`           | function | Asserts the HTTP response status code                              |
| `assertHttpHeader`           | function | Asserts a header is present on the HTTP response                   |
| `assertHttpNoHeader`         | function | Asserts a header is absent from the HTTP response                  |
| `assertHttpBody`             | function | Asserts the HTTP response body equals a value                      |
| `assertHttpBodyContains`     | function | Asserts the HTTP response body contains a substring                |
| `assertHttpJson`             | function | Asserts the HTTP response body matches a JSON value                |
| `assertHttpContentType`      | function | Asserts the HTTP response Content-Type header                      |
| `assertHttpLog`              | function | Asserts a log entry was emitted during HTTP request handling       |
| `assertHttpNoLog`            | function | Asserts a log entry was not emitted during HTTP request handling   |
| `TestSuite`                  | type     | Suite definition — one of `wasmPath` or `wasmBuffer` plus test cases |
| `TestCase`                   | type     | A single test scenario with config and assertions                  |
| `TestResult`                 | type     | Result of a single test case execution                             |
| `SuiteResult`                | type     | Aggregated result returned by `runTestSuite`                       |
| `FlowOptions`                | type     | Options accepted by `runFlow`                                      |
| `HttpRequestOptions`         | type     | Options accepted by `runHttpRequest`                               |
| `RunnerConfig`               | type     | Configuration options for the underlying runner                    |

### `@gcoredev/fastedge-test/server`

The debugger server entrypoint. This export is used internally by the `fastedge-debug` binary and is not intended for direct import. Start the server via the CLI instead — see [DEBUGGER.md](DEBUGGER.md).

### `@gcoredev/fastedge-test/schemas`

Directory of JSON Schema files. Point your editor's `$schema` field at the appropriate file to enable validation and autocompletion in `fastedge-config.test.json`. See [TEST_CONFIG.md](TEST_CONFIG.md) for usage.

## Internal Documentation

Contributors and developers working in this repository should refer to the internal context documentation:

- [`context/CONTEXT_INDEX.md`](../context/CONTEXT_INDEX.md) — discovery-based index of all internal developer docs
