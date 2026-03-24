# fastedge-test Documentation

`@gcoredev/fastedge-test` — local test runner and debugger for FastEdge WASM modules.

## Documentation Files

| File                                    | Audience             | Description                                                                    |
| --------------------------------------- | -------------------- | ------------------------------------------------------------------------------ |
| [quickstart.md](quickstart.md)          | All users            | Install, configure, and run your first test in under five minutes              |
| [TEST_FRAMEWORK.md](TEST_FRAMEWORK.md)  | Test authors         | High-level API (`defineTestSuite`, `runTestSuite`, assertions) for writing automated test suites |
| [TEST_CONFIG.md](TEST_CONFIG.md)        | Test authors         | `fastedge-config.test.json` schema — all fields, defaults, and validation rules |
| [RUNNER.md](RUNNER.md)                  | Advanced / CI tooling | Low-level programmatic API for direct runner lifecycle control                 |
| [DEBUGGER.md](DEBUGGER.md)              | All users            | `fastedge-debug` CLI — starting the interactive debugger server                |
| [API.md](API.md)                        | Tooling integrators  | HTTP REST API exposed by the debugger server                                   |
| [WEBSOCKET.md](WEBSOCKET.md)            | Tooling integrators  | WebSocket event stream API for real-time server events                         |

## Quick Links

| Goal                                              | Start here                            |
| ------------------------------------------------- | ------------------------------------- |
| Writing tests for a WASM module                   | [TEST_FRAMEWORK.md](TEST_FRAMEWORK.md) |
| Understanding the test config file format         | [TEST_CONFIG.md](TEST_CONFIG.md)      |
| Running the interactive debugger UI               | [DEBUGGER.md](DEBUGGER.md)            |
| Building custom CI or automation tooling          | [API.md](API.md)                      |
| Subscribing to real-time server events            | [WEBSOCKET.md](WEBSOCKET.md)          |
| Direct runner control without the test framework  | [RUNNER.md](RUNNER.md)                |
| First time using this package                     | [quickstart.md](quickstart.md)        |

## Package Exports

| Entry point   | Description                                                                                        |
| ------------- | -------------------------------------------------------------------------------------------------- |
| `.`           | Main entry — re-exports the runner API and core types                                              |
| `./test`      | Test framework API — use this for writing and running test suites                                  |
| `./server`    | Debugger server entry — used by the `fastedge-debug` CLI binary                                    |
| `./schemas`   | JSON Schema files for `fastedge-config.test.json` — reference these in editors for validation     |

### `@gcoredev/fastedge-test` (`.`)

Exports the low-level runner API. See [RUNNER.md](RUNNER.md) for full reference.

```typescript
import { createRunner, createRunnerFromBuffer } from "@gcoredev/fastedge-test";
```

### `@gcoredev/fastedge-test/test`

Exports the high-level test framework. See [TEST_FRAMEWORK.md](TEST_FRAMEWORK.md) for full reference.

| Export                  | Kind     | Description                                                          |
| ----------------------- | -------- | -------------------------------------------------------------------- |
| `defineTestSuite`       | function | Validates and returns a typed `TestSuite` definition                 |
| `runTestSuite`          | function | Executes a `TestSuite` and returns a `SuiteResult`                   |
| `runAndExit`            | function | Runs a suite and exits the process with a pass/fail code             |
| `runFlow`               | function | Executes a single request flow directly                              |
| `loadConfigFile`        | function | Loads and validates a `fastedge-config.test.json` file               |
| `assertRequestHeader`   | function | Asserts a header is present on the outgoing request                  |
| `assertResponseHeader`  | function | Asserts a header is present on the final response                    |
| `assertFinalStatus`     | function | Asserts the final HTTP status code                                   |
| `assertReturnCode`      | function | Asserts the proxy-wasm return code                                   |
| `assertLog`             | function | Asserts a log entry was emitted                                      |
| `TestSuite`             | type     | Suite definition — one of `wasmPath` or `wasmBuffer` plus test cases |
| `TestCase`              | type     | A single test scenario with config and assertions                    |
| `SuiteResult`           | type     | Aggregated result returned by `runTestSuite`                         |
| `FlowOptions`           | type     | Options accepted by `runFlow`                                        |

### `@gcoredev/fastedge-test/server`

The debugger server entrypoint. This export is used internally by the `fastedge-debug` binary and is not intended for direct import. Start the server via the CLI instead — see [DEBUGGER.md](DEBUGGER.md).

### `@gcoredev/fastedge-test/schemas`

Directory of JSON Schema files. Point your editor's `$schema` field at the appropriate file to enable validation and autocompletion in `fastedge-config.test.json`. See [TEST_CONFIG.md](TEST_CONFIG.md) for usage.

## Internal Documentation

Contributors and developers working in this repository should refer to the internal context documentation:

- [`context/CONTEXT_INDEX.md`](../context/CONTEXT_INDEX.md) — discovery-based index of all internal developer docs
