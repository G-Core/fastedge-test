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

Once started, the server listens on the loopback interface (`http://127.0.0.1:5179` by default) and logs the bound address to stderr. In CLI mode it also prints the full browser URL with the session token in the fragment:

```
Open: http://127.0.0.1:5179/#token=<hex>
```

Use that URL to open the web UI, or copy the token for API and WebSocket access. See [Authentication in API.md](./API.md#authentication) for the full details, including the `x-fastedge-token` header, WebSocket token parameter, and auth-related environment variables.

The CLI discovers the workspace root by walking up from the current directory, looking first for an existing `.fastedge-debug/` directory, then for a `package.json` or `Cargo.toml`. If neither is found, the starting directory is used. The resolved root becomes `WORKSPACE_PATH`, which is the base for the port file and configuration file placement. Pass a path as the first argument to anchor discovery to a specific starting location (if the path is a file, its parent directory is used):

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

The flag accepts `--project-dir <path>`, `--project-dir=<path>`, and the short alias `-C <path>` / `-C=<path>`. The path is resolved and used as the starting point for workspace discovery, then drives `WORKSPACE_PATH` and all config, fixture, and dotenv resolution that flows from it, exactly as if the CLI had been invoked from that directory. The flag is removed from the argument list before any positional arguments are read. When `--project-dir` is given, it takes precedence over a positional start path. Passing the flag without a value exits with code `2`.

When the flag is omitted, the positional argument (if any) or the current working directory is used as the starting point.

## Programmatic Usage

The `./server` export is the server bundle. Importing it starts the server automatically, using the `PORT` environment variable or the default port. Set environment variables before the import:

```typescript
process.env.PORT = "5200";

await import("@gcoredev/fastedge-test/server");
```

The module also exports `startServer`:

```typescript
function startServer(port?: number): Promise<void>;
```

| Parameter | Type     | Default                   | Description                                              |
| --------- | -------- | ------------------------- | -------------------------------------------------------- |
| `port`    | `number` | `PORT` env var, or `5179` | Preferred port. A later free port is used if it is busy. |

The returned promise resolves once the server is bound and accepting connections. The actual bound port is printed to stderr and written to the port file (see [Port Configuration](#port-configuration)); it can differ from the requested port when the preferred port is in use.

```typescript
import { startServer } from "@gcoredev/fastedge-test/server";

await startServer(5200);
```

Because importing the module already starts the server, prefer setting `PORT` before the import when a specific starting port is needed.

## Port Configuration

| Source         | Value                 |
| -------------- | --------------------- |
| Default        | `5179`                |
| `PORT` env var | Any valid port number |

```bash
PORT=8080 npx fastedge-debug
```

`PORT` (or the `startServer` argument) sets the preferred starting port. If that port is already in use, the server tries the next port sequentially, up to 50 ports in total (for example, `5179` through `5228` by default), and logs each skipped port to stderr. If no free port is found in that range, the server exits with an error. Read the port file or the stderr output to find the port that was actually bound.

The server writes the bound port to `.fastedge-debug/.debug-port` under `WORKSPACE_PATH` (if set) or the current working directory, and deletes the file on shutdown. Use this file for programmatic port discovery when starting the server as a subprocess.

The file format is `PORT:SHA256_HASH` — the decimal port number, a colon, then the hex-encoded SHA-256 of the session token (used by the VS Code extension to verify server identity before reuse). To extract just the port:

```javascript
import fs from "node:fs";

const port = parseInt(
  fs.readFileSync(".fastedge-debug/.debug-port", "utf8").trim().split(":")[0],
  10,
);
console.log(port);
```

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

Use this endpoint to verify the server is running before sending requests. The `service` field is always `"fastedge-debugger"`. The endpoint does not require the session token.

```bash
curl http://127.0.0.1:5179/health
```

## Environment Variables

| Variable             | Type     | Default     | Description                                                                               |
| -------------------- | -------- | ----------- | ----------------------------------------------------------------------------------------- |
| `PORT`               | `number` | `5179`      | Preferred port for the HTTP server. See Port Configuration.                               |
| `PROXY_RUNNER_DEBUG` | `"1"`    | unset       | Set to `1` to enable verbose debug logging for WebSocket and runner activity.             |
| `VSCODE_INTEGRATION` | `"true"` | unset       | Set to `true` when running inside the VSCode extension; enables workspace WASM detection. |
| `WORKSPACE_PATH`     | `string` | unset       | Workspace root; base for `.fastedge-debug/` files and dotenv paths. Set by the CLI.       |
| `FASTEDGE_RUN_PATH`  | `string` | unset       | Override the path to the `fastedge-run` binary used to execute WASM modules.              |
| `FASTEDGE_BIND_HOST` | `string` | `"127.0.0.1"` | Interface the server binds to. Non-loopback values require explicit opt-in.             |

`WORKSPACE_PATH` falls back to the current working directory when unset. The `fastedge-debug` CLI always sets it from the resolved workspace root, overriding any value in the environment; use `--project-dir` to choose the root when running through the CLI. Setting `WORKSPACE_PATH` directly applies when the server is started programmatically.

Session token and host-validation variables (`FASTEDGE_DEBUG_TOKEN`, `FASTEDGE_EXPECTED_HOST`) are documented in [API.md](./API.md#authentication).

### Usage examples

```bash
# Enable debug logging
PROXY_RUNNER_DEBUG=1 npx fastedge-debug

# Use a non-default port with debug logging
PORT=8080 PROXY_RUNNER_DEBUG=1 npx fastedge-debug

# Anchor the workspace with --project-dir and override the fastedge-run binary
FASTEDGE_RUN_PATH=/usr/local/bin/fastedge-run \
npx fastedge-debug --project-dir /home/user/myproject
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

Or press `Ctrl+C` in the terminal to send `SIGINT`. The handlers terminate the host process with `process.exit(0)`, so when the server is imported into another Node.js process, a shutdown signal ends that process as well.

## Web UI

When the server starts, it serves a browser-based UI at the root URL. In CLI mode the full URL including the session token is printed to stderr:

```
Open: http://127.0.0.1:5179/#token=<hex>
```

Open that URL directly — the frontend reads the `#token=` fragment and includes it as an `x-fastedge-token` header on every API request. The UI provides a graphical interface for loading WASM modules, configuring requests, and inspecting results. All UI interactions use the same REST and WebSocket endpoints available to API consumers; see [API.md](API.md) for the REST endpoints.

## See Also

- [API.md](API.md) — REST endpoint reference for loading WASM, sending requests, and managing configuration
- [WEBSOCKET.md](WEBSOCKET.md) — WebSocket protocol, event types, and real-time state updates
- [TEST_FRAMEWORK.md](TEST_FRAMEWORK.md) — Programmatic test framework for writing automated WASM tests
- [TEST_CONFIG.md](TEST_CONFIG.md) — `fastedge-config.test.json` schema and configuration options
