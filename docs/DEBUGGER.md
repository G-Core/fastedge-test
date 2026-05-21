# Debugger Server

Runs the FastEdge debugger HTTP server, which hosts the web UI, REST API, and WebSocket endpoint for loading and testing WASM modules.

## CLI Usage

The package exposes a single binary, `fastedge-debug`. Run it with `npx` after installing `@gcoredev/fastedge-test` in your project:

```bash
npx fastedge-debug
```

If the package isn't installed yet, the explicit form fetches and runs it in one shot:

```bash
npx -p @gcoredev/fastedge-test fastedge-debug
```

> The shorthand `npx @gcoredev/fastedge-test` happens to work today because the package declares exactly one `bin` entry, and npx falls back to it when no name is given. Prefer the explicit `fastedge-debug` form — it stays correct if a second binary is ever added.

Once started, the server listens on `http://localhost:5179` by default and logs the bound address to stderr.

The CLI automatically discovers the workspace root by walking up from the current directory, looking first for an existing `.fastedge-debug/` directory, then for a `package.json` or `Cargo.toml`. The resolved root is used as the base for port file and configuration file placement. Pass a path as the first argument to anchor discovery to a specific starting location:

```bash
npx fastedge-debug /path/to/my-app
```

### `--project-dir <path>` (or `-C <path>`)

For setups where the CLI is invoked from a subdirectory of the project (for example, a Rust app with a `fastedge-test/` Node sandbox holding the debugger install), pass `--project-dir` to anchor workspace discovery at a different path:

```bash
# From inside fastedge-test/, point the debugger at the parent project root
cd fastedge-test
npx fastedge-debug --project-dir ..
```

The flag accepts both `--project-dir <path>` and `--project-dir=<path>`. `-C` is a short alias. The resolved path then drives `WORKSPACE_PATH` and all config / fixture / dotenv resolution that flows from it, exactly as if the user had invoked the CLI from that directory. The flag is stripped before any remaining positional arguments are forwarded to the server, so you can combine it with a fixture path or other options:

```bash
npx fastedge-debug --project-dir .. ../fixtures/scenario-1.test.json
```

When omitted, behavior is unchanged from prior versions — the positional argument or `process.cwd()` is used as the starting point.

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

If the preferred port is already in use, the server tries the next port sequentially, up to 50 ports (for example, `5179` through `5228` by default). If no free port is found in that range, the server exits with an error. Set `PORT` to a specific value to bypass auto-increment when a predictable port is required.

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

| Variable             | Type     | Default | Description                                                                                     |
| -------------------- | -------- | ------- | ----------------------------------------------------------------------------------------------- |
| `PORT`               | `number` | unset   | Port the HTTP server listens on. Defaults to `5179` when not set.                              |
| `PROXY_RUNNER_DEBUG` | `"1"`    | unset   | Enable verbose debug logging for WebSocket and runner activity.                                 |
| `VSCODE_INTEGRATION` | `"true"` | unset   | Set to `"true"` when running inside the VSCode extension; enables workspace WASM detection.     |
| `WORKSPACE_PATH`     | `string` | unset   | Absolute path to the workspace root; used as the `.env` file base and for port file placement. |
| `FASTEDGE_RUN_PATH`  | `string` | unset   | Override the path to the `fastedge-run` CLI binary used to execute WASM modules.               |

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
