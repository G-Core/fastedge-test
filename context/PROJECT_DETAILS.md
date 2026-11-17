# fastedge-test - Detailed Documentation

**📖 For quick overview, see [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md)**

This document contains detailed technical information about the project structure, implementation details, and debugging guidance.

---

## Detailed Project Structure

```
server/                       # Backend (Node + Express + TypeScript)
  server.ts                   # Express server: REST API, WebSocket, startServer() + port probing
  storageExplorer.ts          # Storage Explorer API (/api/storage/*)
  embedded.ts                 # Code run in its own thread/process (cdn worker, stores service)
  runner/
    ProxyWasmRunner.ts        # CDN (proxy-wasm) runner: instantiation, hooks, PAUSE loop
    WorkerProxyWasmRunner.ts  # Same runner in a worker thread (cdn-worker.ts)
    HttpWasmRunner.ts         # HTTP app runner: spawns fastedge-run
    cdnFlow.ts                # CDN request flow (hooks + origin), shared by single apps and resources
    resource.ts               # Multi-app CDN resources (config, rules, apps)
    origin.ts                 # Declared origins: URL, built-in echo, fixed response, served folder
    requestContext.ts         # Client / edge context presets and expansion
    HostFunctions.ts          # Proxy-wasm host functions
    StoresHost.ts             # Cache and Edge KV host functions
    HeaderManager.ts          # Header serialization/deserialization
    MemoryManager.ts          # WASM memory operations
    PropertyResolver.ts       # Property path resolution, calculated properties
    PropertyAccessControl.ts  # Per-hook property read/write rules
    standalone.ts             # createRunner(): headless runner factory
  fastedge-host/              # FastEdge secrets and dictionary
  stores/                     # Local storage service (cache + Edge KV on node:sqlite)
  schemas/                    # Zod schemas (config, API); JSON schemas generated from them
  test-framework/             # Test framework (./test and ./vitest exports)
  websocket/                  # WebSocket manager and state broadcasting
  utils/                      # fastedge-cli discovery, dotenv, WASM type detection, paths

frontend/src/                 # React + Vite + TypeScript
  App.tsx                     # Pages (Debugger / Storage Explorer), Multi-app toggle
  api/                        # REST client
  components/
    common/                   # Shared components (panels, editors, logs, loader)
    proxy-wasm/               # CDN-only components (hook stages, origin editor)
    ConfigEditorModal/        # Config editor
  views/                      # HttpWasmView, ProxyWasmView, ResourceView, StorageExplorerView
  hooks/                      # useWasm, useWebSocket, useWorkspaceFiles
  stores/                     # Zustand store and slices (request, wasm, results, config, ui, httpWasm)
  utils/                      # contentType, diff, environment, filePath
```

See [DIRECTORY_STRUCTURE.md](./DIRECTORY_STRUCTURE.md) for the `fastedge-run` binaries and build output.

---

## Critical Technical Details

### Header Serialization Format

The proxy-wasm SDKs expect this binary format for header maps:

```
[num_pairs: u32]              # Header pair count
[key1_len: u32][val1_len: u32]  # Size array for all pairs
[key2_len: u32][val2_len: u32]
...
[key1_bytes][0x00]            # Data with null terminators
[val1_bytes][0x00]
[key2_bytes][0x00]
[val2_bytes][0x00]
...
```

**Example** (2 headers: "host: example.com" and "x-custom-relay: Fifteen"):

```
02 00 00 00                   # 2 pairs
04 00 00 00 0b 00 00 00       # "host" = 4 bytes, "example.com" = 11 bytes
0e 00 00 00 07 00 00 00       # "x-custom-relay" = 14 bytes, "Fifteen" = 7 bytes
68 6f 73 74 00                # "host\0"
65 78 61 6d 70 6c 65 2e 63 6f 6d 00  # "example.com\0"
78 2d 63 75 73 74 6f 6d 2d 72 65 6c 61 79 00  # "x-custom-relay\0"
46 69 66 74 65 65 6e 00       # "Fifteen\0"
```

This format is implemented in `server/runner/HeaderManager.ts`.

### Property Path Resolution

Properties use null-separated paths with smart runtime calculation:

- **Static properties**: Set by user in UI, stored in config
- **Runtime properties**: Extracted from URLs (host, path, query, etc.)
- **Priority**: User properties override runtime-calculated values
- **Path separators**: `\0` (null), `.` (dot), `/` (slash) all supported

Example: `request\0path` → extracts `/api/endpoint` from URL

See [PROPERTIES.md](./features/PROPERTIES.md) for details.

### Host Header Auto-Injection

The test runner automatically injects the `Host` header from the target URL before hooks execute:

- Format: `hostname` or `hostname:port` (non-standard ports only)
- Standard ports (80, 443) omitted from header value
- Native `fetch()` may override, but WASM hooks see correct value
- Original host preserved as `X-Forwarded-Host` during HTTP fetch

---

## How to Use (Detailed)

### Running the Server

```bash
pnpm install
pnpm run build  # Builds both backend and frontend
pnpm start      # Starts server on port 5179
```

Or run in development mode:

```bash
pnpm run dev:backend    # Runs backend with watch mode
pnpm run dev:frontend   # Runs Vite dev server on port 5173 (with proxy to backend)
```

### Build Commands

- `pnpm run build` - Build everything: schemas, server bundle, frontend, library
- `pnpm run build:backend` - Bundle the server (esbuild → `dist/server.js`, copies `fastedge-run/` → `dist/fastedge-cli/`)
- `pnpm run build:frontend` - Build the frontend (Vite → `dist/frontend/`)
- `pnpm run build:lib` - Build the library entry points (`dist/lib/`)
- `pnpm run build:schemas` - Generate `schemas/*.schema.json` from the Zod schemas
- `pnpm run dev:backend` - Run backend in watch mode
- `pnpm run dev:frontend` - Run Vite dev server with hot reload

### Debug Mode

Set `PROXY_RUNNER_DEBUG=1` to see detailed logs:

- Host function calls
- Memory operations
- Header hex dumps
- Trap information

### Loading a Binary

1. Open http://localhost:5179
2. In the loader, either give a path (sent as a path to `/api/load`, read by the server) or upload a file (sent as base64); see [HYBRID_LOADING.md](./features/HYBRID_LOADING.md)
3. The server detects the app type and the UI switches to the CDN or HTTP view

### Running a CDN App

1. Configure the request (method, URL, headers, body) and the origin
2. Set properties and request context as needed
3. Click Send: all four hooks run around the origin fetch
4. Inspect each hook's inputs/outputs, logs and return codes, and the final response

Path separators supported: `\0` (null), `.` (dot), `/` (slash)

---

## Debugging Tips

### Common Issues

**Headers not parsing correctly**
- Check hex dump in debug logs
- Verify the format matches the SDK expectations
- Ensure null terminators are present

**Hook returns unexpected value**
- Check logs for "debug: host_call ..." to see what WASM requested
- Verify property values are set correctly
- Check that header format is correct

**WASM initialization fails**
- Usually non-critical if hooks still execute
- Check what host functions WASM imports vs what we provide
- Add missing functions to HostFunctions.ts if needed

**Memory errors**
- Ensure allocator is available (proxy_on_memory_allocate or malloc)
- Check memory growth in MemoryManager.hostAllocate()
- Verify pointers aren't out of bounds

**WebSocket connection issues**
- Check connection status indicator in UI
- Verify the server is running on the expected port (5179-5228; see `.fastedge-debug/.debug-port`)
- Check browser console for WebSocket errors
- Auto-reconnection should handle temporary disconnects

**Dotenv not loading**
- Verify .env files exist in project root
- Check dotenv toggle is enabled in UI
- Look for WASM reload confirmation
- Check server logs for file read errors

---

## Example Usage

### Example Request Configuration

```json
// Request Headers
{
  "host": "example.com",
  "x-custom-header": "value",
  "content-type": "application/json"
}

// Request Body
{
  "message": "test request"
}

// Properties
{
  "root_id": "httpheaders",
  "fastedge.trace_id": "test-123",
  "request.method": "POST"
}
```

### Example Test Scenario

1. Load a CDN app that modifies headers and body (e.g. one from `test-applications/cdn-apps/`)
2. Set method to POST, URL to `https://httpbin.org/post`
3. Add custom headers in request
4. Add JSON body
5. Configure properties
6. Click Send
7. Observe:
   - Request hooks modify headers/body
   - HTTP request sent with modifications
   - Response hooks process server response
   - Logs show all hook executions
   - Inputs/Outputs tabs show diffs

