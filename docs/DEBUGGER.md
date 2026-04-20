# Debugger Server

Runs the FastEdge debugger HTTP server, which hosts the web UI, REST API, and WebSocket endpoint for loading and testing WASM modules.

## CLI Usage

The package exposes a `fastedge-debug` binary. Run it with `npx` without installing:

```bash
npx @gcoredev/fastedge-test
```

Or using the explicit binary name:

```bash
npx fastedge-debug
```

Once started, the server listens on `http://localhost:5179` by default and logs the bound address to stderr.

The CLI automatically discovers the workspace root by walking up from the current directory, looking first for an existing `.fastedge-debug/` directory, then for a `package.json` or `Cargo.toml`. The resolved root is used as the base for port file and configuration file placement. Pass a path as the first argument to anchor discovery to a specific starting location:

```bash
npx fastedge-debug /path/to/my-app
```

## Programmatic Usage

Import `startServer` from the `./server` export to start the server from your own script or test setup:

```typescript
import { startServer } from "@gcoredev/fastedge-test/server";

// Start on the default port (5179)
await startServer();

// Start on a custom port
await startServer(3000);
```

**Signature:**

```typescript
function startServer(port?: number): Promise<void>;
```

The returned promise resolves once the server is bound and ready to accept connections.

**Example: start and stop in a test setup**

```typescript
import { startServer } from "@gcoredev/fastedge-test/server";

// Start server for integration tests
await startServer(5200);

// ... run tests ...

// Send SIGTERM to trigger graceful shutdown
process.kill(process.pid, "SIGTERM");
```

## Port Configuration

| Source         | Value                 |
| -------------- | --------------------- |
| Default        | `5179`                |
| `PORT` env var | Any valid port number |

```bash
PORT=8080 npx fastedge-debug
```

If the preferred port is already in use, the server tries the next port sequentially, repeating up to 10 times (for example, `5179` through `5188` by default). If no free port is found in that range, the server exits with an error. Set `PORT` to a specific value to bypass auto-increment when a predictable port is required.

The server writes the bound port number to `.fastedge-debug/.debug-port` under `WORKSPACE_PATH` (if set) or the current working directory, and deletes the file on shutdown. Use this file for programmatic port discovery when starting the server as a subprocess.

## Health Check

```
GET /health
```

Returns `200 OK` with a JSON body:

```json
{
  "status": "ok",
  "service": "fastedge-debugger"
}
```

Use this endpoint to verify the server is running before sending requests. The `service` field is always `"fastedge-debugger"`.

```bash
curl http://localhost:5179/health
```

## Environment Variables

| Variable             | Type     | Default | Description                                                                                                                 |
| -------------------- | -------- | ------- | --------------------------------------------------------------------------------------------------------------------------- |
| `PORT`               | `number` | unset   | Port the HTTP server listens on. Defaults to `5179` when not set.                                                          |
| `PROXY_RUNNER_DEBUG` | `"1"`    | unset   | Enable verbose debug logging for WebSocket and runner activity.                                                             |
| `VSCODE_INTEGRATION` | `"true"` | unset   | Set to `"true"` when running in VSCode extension context; enables the `<workspace>` path placeholder in WASM path loading.  |
| `WORKSPACE_PATH`     | `string` | unset   | Absolute path to the workspace root; used as the `.env` file base and for port file placement.                              |
| `FASTEDGE_RUN_PATH`  | `string` | unset   | Override the path to the `fastedge-run` CLI binary used to execute WASM modules.                                           |

### Usage examples

```bash
# Enable debug logging
PROXY_RUNNER_DEBUG=1 npx fastedge-debug

# Use a non-default port with debug logging
PORT=8080 PROXY_RUNNER_DEBUG=1 npx fastedge-debug

# Point to a workspace and override the fastedge-run binary
WORKSPACE_PATH=/home/user/myproject \
FASTEDGE_RUN_PATH=/usr/local/bin/fastedge-run \
npx fastedge-debug
```

## Graceful Shutdown

The server handles `SIGTERM` and `SIGINT`:

1. Logs the received signal.
2. Cleans up the active WASM runner (frees memory, closes child processes).
3. Closes all WebSocket connections.
4. Deletes the `.fastedge-debug/.debug-port` file.
5. Closes the HTTP server.
6. Exits with code `0`.

The `.fastedge-debug/.debug-port` file is also deleted on the Node.js `exit` event, which covers Windows environments where `SIGTERM` is not delivered.

Send `SIGTERM` to trigger shutdown programmatically:

```bash
kill -SIGTERM <pid>
```

Or press `Ctrl+C` in the terminal to send `SIGINT`.

## Web UI

When the server starts, it serves a browser-based UI at the root URL:

```
http://localhost:5179
```

The UI provides a graphical interface for loading WASM modules, configuring requests, and inspecting results. All UI interactions use the same REST and WebSocket endpoints available to API consumers.

## See Also

- [API.md](API.md) — REST endpoint reference for loading WASM, sending requests, and managing configuration
- [WEBSOCKET.md](WEBSOCKET.md) — WebSocket protocol, event types, and real-time state updates
- [TEST_FRAMEWORK.md](TEST_FRAMEWORK.md) — Programmatic test framework for writing automated WASM tests
- [TEST_CONFIG.md](TEST_CONFIG.md) — `fastedge-config.test.json` schema and configuration options
