# fastedge-test Documentation

Navigation index for the `@gcoredev/fastedge-test` package (`v0.0.1-beta.5`).

## Documentation Files

| File | Audience | Description |
|------|----------|-------------|
| [quickstart.md](./quickstart.md) | All users | Install the package, run your first test, and launch the debugger server |
| [TEST_FRAMEWORK.md](./TEST_FRAMEWORK.md) | Test authors | High-level API for defining and running WASM test suites against the FastEdge runtime |
| [TEST_CONFIG.md](./TEST_CONFIG.md) | Test authors | `fastedge-config.test.json` schema — WASM binary path, request inputs, origin mock, CDN properties, and env var loading |
| [RUNNER.md](./RUNNER.md) | Tooling builders | Low-level programmatic API for executing WASM modules with direct lifecycle control |
| [API.md](./API.md) | Tooling builders | HTTP REST API exposed by the debugger server — load modules, execute flows, manage configuration |
| [WEBSOCKET.md](./WEBSOCKET.md) | Tooling builders | WebSocket event stream for real-time test runner output |
| [DEBUGGER.md](./DEBUGGER.md) | All users | CLI (`fastedge-debug`) and programmatic usage of the debugger server |

## Quick Links

| Goal | Start here |
|------|-----------|
| Writing tests for a WASM module | [TEST_FRAMEWORK.md](./TEST_FRAMEWORK.md) |
| Configuring test inputs and mock responses | [TEST_CONFIG.md](./TEST_CONFIG.md) |
| Building custom CI tooling or scripts | [API.md](./API.md) + [RUNNER.md](./RUNNER.md) |
| Streaming test events in real time | [WEBSOCKET.md](./WEBSOCKET.md) |
| Launching the debugger server | [DEBUGGER.md](./DEBUGGER.md) |
| Getting started from scratch | [quickstart.md](./quickstart.md) |

## Package Exports

| Export | Entry point | Description |
|--------|-------------|-------------|
| `.` | `@gcoredev/fastedge-test` | Main package entry — re-exports the runner and test framework public API |
| `./test` | `@gcoredev/fastedge-test/test` | Test framework API (`describe`, `it`, assertions, result types) |
| `./server` | `@gcoredev/fastedge-test/server` | Programmatic server entry point for starting the debugger server in Node.js |
| `./schemas` | `@gcoredev/fastedge-test/schemas` | JSON Schema files for `fastedge-config.test.json` and related config formats |

The `fastedge-debug` binary (installed to `node_modules/.bin/fastedge-debug`) launches the debugger server from the command line. See [DEBUGGER.md](./DEBUGGER.md).

## Internal Documentation

Contributors working on this repository should refer to `context/CONTEXT_INDEX.md` for the developer documentation index, architecture guides, and implementation notes.
