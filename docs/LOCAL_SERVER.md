# Local Debugger Server

The `@gcoredev/fastedge-test` package includes a full visual debugger server — an Express-based HTTP server with a React UI, REST API, and WebSocket log streaming. This is the same server embedded in the [FastEdge VSCode extension](https://marketplace.visualstudio.com/items?itemName=Gcore.fastedge).

Use it when you want an interactive local environment to load WASM binaries and test them via a browser UI — without needing VSCode.

---

## Running the Server

### Via npx (no install required)

```bash
npx @gcoredev/fastedge-test
```

Opens the debugger at `http://localhost:5179`.

### Global install

```bash
npm install -g @gcoredev/fastedge-test
fastedge-debug
```

### Custom port

```bash
PORT=8080 npx @gcoredev/fastedge-test
# Opens at http://localhost:8080
```

---

## What You Get

Once running, open `http://localhost:5179` in your browser:

- **Load a WASM binary** — drag-and-drop or select from disk
- **Send test requests** — configure URL, method, headers, body
- **Inspect results** — view response, modified headers, hook return codes
- **Real-time logs** — streamed via WebSocket as your WASM executes
- **Save/load test config** — persist test cases to `fastedge-config.test.json`

Both FastEdge binary types are supported and auto-detected:
- **CDN (proxy-wasm)** — request/response filter binaries
- **HTTP-WASM** — component model HTTP handler binaries

---

## Programmatic Usage

If you want to start the server from your own script or test setup:

```typescript
import { startServer } from '@gcoredev/fastedge-test/server';

// Start on default port (5179) or override via PORT env var
await startServer();

// Start on a custom port
await startServer(8080);
```

`startServer(port?)` returns a `Promise<void>` that resolves once the server is listening.

> **Note**: When using `startServer()` programmatically, the process stays alive until terminated. Use `SIGTERM` or `SIGINT` to shut it down gracefully — both are handled automatically.

### Example: Start server in a script, run tests, shut down

```typescript
import { startServer } from '@gcoredev/fastedge-test/server';
import { defineTestSuite, runAndExit } from '@gcoredev/fastedge-test/test';

// Start the visual server alongside headless tests
await startServer(5179);
console.log('Debugger running at http://localhost:5179');

// Also run automated tests in the same process
await runAndExit(defineTestSuite({
  wasmPath: './build/app.wasm',
  tests: [ /* ... */ ],
}));
```

---

## REST API

The server exposes a REST API that the browser UI uses internally. You can also call it directly from scripts, agents, or other tools.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Check server is running |
| `POST` | `/api/load` | Load a WASM binary (base64 or file path) |
| `POST` | `/api/execute` | Execute a request against the loaded WASM |
| `POST` | `/api/send` | Run a full CDN flow (proxy-wasm) |
| `POST` | `/api/call` | Invoke a specific proxy-wasm hook |
| `GET` | `/api/config` | Get current test configuration |
| `POST` | `/api/config` | Save test configuration |
| `GET` | `/api/schema/:name` | Fetch a JSON Schema for request validation |

See **[API.md](./API.md)** for full endpoint documentation, request/response shapes, and examples.

### Quick example — load and execute via curl

```bash
# Load a WASM binary by file path
curl -s -X POST http://localhost:5179/api/load \
  -H "Content-Type: application/json" \
  -d '{"wasmPath": "/path/to/app.wasm"}'

# Execute a request
curl -s -X POST http://localhost:5179/api/execute \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/page",
    "method": "GET",
    "headers": { "user-agent": "curl/7.0" }
  }'
```

---

## WebSocket Log Streaming

Logs emitted by your WASM binary are streamed in real time over WebSocket:

```javascript
const ws = new WebSocket('ws://localhost:5179/ws');
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  console.log(msg); // { type: 'log', level: 'info', message: '...' }
};
```

The browser UI connects to this automatically — you only need this if building custom tooling.

---

## VSCode Extension

If you use VSCode, the debugger is already built into the [FastEdge extension](https://marketplace.visualstudio.com/items?itemName=Gcore.fastedge) — no separate install needed. The extension starts the server automatically when you open a FastEdge project.

The standalone server (this page) is for developers not using VSCode who want the same interactive debugging experience in a browser.

---

## Related

- **[REST API Reference](./API.md)** — Full endpoint documentation
- **[Test Framework Guide](./TEST_FRAMEWORK.md)** — Headless programmatic testing (no server needed)
- **[WASM Loading Guide](./HYBRID_LOADING.md)** — Path vs buffer loading tradeoffs
