# Debugger Server

Runs the FastEdge debugger HTTP server, which hosts the web UI, REST API, and WebSocket endpoint for testing proxy-wasm and HTTP WASM modules.

## CLI Usage

Start the server using `npx`:

```bash
npx fastedge-debug
```

Or via the full package name:

```bash
npx @gcoredev/fastedge-test fastedge-debug
```

The server listens on port `5179` by default and prints the bound address on startup:

```
Proxy runner listening on http://localhost:5179
WebSocket available at ws://localhost:5179/ws
```

## Programmatic Usage

Import `startServer` from the server entry point:

```typescript
import { startServer } from "@gcoredev/fastedge-test/server";

// Start on default port (5179)
await startServer();

// Start on a custom port
await startServer(3000);
```

**Signature:**

```typescript
function startServer(port?: number): Promise<void>
```

The returned promise resolves once the server is listening. When the module is executed directly (e.g. via the CLI), `startServer()` is called automatically. When imported programmatically, you must call it explicitly.

## Port Configuration

| Method | Value |
|--------|-------|
| Default | `5179` |
| Environment variable | `PORT` |
| Programmatic argument | `startServer(port)` |

The `PORT` environment variable takes precedence over the compiled default. A port passed directly to `startServer()` takes precedence over both.

```bash
PORT=8080 npx fastedge-debug
```

## Health Check

```
GET /health
```

Returns HTTP `200` with a JSON body:

```json
{
  "status": "ok",
  "service": "fastedge-debugger"
}
```

Use the `service` field to confirm you are talking to the correct server when running multiple local services.

## Environment Variables

| Variable | Type | Description |
|----------|------|-------------|
| `PORT` | `number` | Server port. Default: `5179` |
| `PROXY_RUNNER_DEBUG` | `"1"` | Enable verbose debug logging to stdout |
| `VSCODE_INTEGRATION` | `"true"` | Signals the server is running inside the VSCode extension context |
| `WORKSPACE_PATH` | `string` | Absolute path to the workspace root. Used as the base path for `.env` file resolution and WASM path expansion when `VSCODE_INTEGRATION` is set |
| `FASTEDGE_RUN_PATH` | `string` | Override the path to the `fastedge-run` CLI binary used for HTTP WASM execution |

Variables are read at startup. Changes after the process starts have no effect.

```bash
PROXY_RUNNER_DEBUG=1 PORT=8080 npx fastedge-debug
```

## Graceful Shutdown

The server handles `SIGTERM` and `SIGINT`:

1. Cleans up the currently loaded WASM runner (releases memory, closes child processes)
2. Closes all WebSocket connections
3. Removes the `.debug-port` file (if `WORKSPACE_PATH` is set)
4. Closes the HTTP server
5. Exits with code `0`

On platforms where `SIGTERM` is not delivered (Windows), cleanup also runs on the `exit` event.

Send `SIGINT` interactively with `Ctrl+C`. In containerised or process-managed environments, send `SIGTERM` to trigger a clean shutdown before `SIGKILL`.

## Web UI

When the server is running, navigating to `http://localhost:5179` (or your configured port) opens the debugger web UI. The UI lets you load WASM modules, configure test properties, send requests, and inspect hook execution results interactively.

For the REST endpoints the UI and automation tooling call, see [API.md](./API.md). For the WebSocket protocol used to stream real-time events, see [WEBSOCKET.md](./WEBSOCKET.md).

## See Also

- [API.md](./API.md) — REST API reference
- [WEBSOCKET.md](./WEBSOCKET.md) — WebSocket event protocol
- [TEST_FRAMEWORK.md](./TEST_FRAMEWORK.md) — Programmatic test framework
- [TEST_CONFIG.md](./TEST_CONFIG.md) — Test configuration file format
