# Proxy-WASM Test Runner - Detailed Documentation

**📖 For quick overview, see [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md)**

This document contains detailed technical information about the project structure, implementation details, development history, and debugging guidance.

---

## Detailed Project Structure

```
server/                       # Backend code (formerly src/)
  server.ts                   # Express server with /api/load, /api/call, /api/send, WebSocket
  tsconfig.json              # Extends base tsconfig.json
  runner/
    ProxyWasmRunner.ts        # Main orchestrator (340 lines)
    HostFunctions.ts          # Proxy-wasm host function implementations (413 lines)
    HeaderManager.ts          # Header serialization/deserialization (66 lines)
    MemoryManager.ts          # WASM memory operations (165 lines)
    PropertyResolver.ts       # Property path resolution (160 lines)
    types.ts                  # Shared TypeScript types (60 lines)
  websocket/                  # WebSocket real-time synchronization (Jan 2026)
    WebSocketManager.ts       # Connection management, client tracking (314 lines)
    StateManager.ts           # Event coordination and broadcasting (153 lines)
    types.ts                  # Event type definitions
    index.ts                  # Module exports
  fastedge-host/              # FastEdge-specific extensions (Feb 2026)
    types.ts                  # FastEdge type definitions
    SecretStore.ts            # Time-based secret rotation
    Dictionary.ts             # Key-value configuration store
    hostFunctions.ts          # Factory for FastEdge WASM host functions
    index.ts                  # Module exports

frontend/                     # React + Vite frontend
  src/
    components/               # React components (CSS Modules - Feb 2026)
      CollapsiblePanel/       # Reusable collapsible panel wrapper
      ConnectionStatus/       # WebSocket connection status indicator
      DictionaryInput/        # Key-value input with enable/disable checkboxes
      HeadersEditor/          # Headers input component
      HookStagesPanel/        # Hook execution logs and inputs viewer
      JsonDisplay/            # JSON rendering with diff support
      PropertiesEditor/       # JSON properties editor with country presets
      RequestBar/             # Method selector, URL input, Send button
      RequestTabs/            # Request headers/body tabs
      ResponseTabs/           # Response tabs component
      ResponseViewer/         # Response display with Body/Preview/Headers tabs
      ServerPropertiesPanel/  # Server properties with dotenv toggle
      Toggle/                 # Reusable toggle switch component
      WasmLoader/             # File upload component
    hooks/
      useWasm.ts              # WASM loading with dotenv support
      useWebSocket.ts         # WebSocket connection with auto-reconnect
      websocket-types.ts      # Frontend event type definitions
    stores/                   # Zustand state management (Feb 2026)
      index.ts                # Main store with 5 slices
      slices/                 # Modular state slices
        requestSlice.ts       # Request state (method, URL, headers, body)
        wasmSlice.ts          # WASM state (loaded file, dotenv toggle)
        resultsSlice.ts       # Results state (hook execution data, logs)
        configSlice.ts        # Config state (server properties, dictionaries)
        uiSlice.ts            # UI state (active tabs, collapsed panels)
    utils/
      contentType.ts          # Auto content-type detection
      diff.ts                 # JSON diff algorithms
```

---

## Complete Working Features List

- [x] Load WASM binaries via UI
- [x] Execute proxy-wasm hooks: onRequestHeaders, onRequestBody, onResponseHeaders, onResponseBody
- [x] Capture logs from `proxy_log` and `fd_write` (stdout) with log level filtering
- [x] Log level filtering: Trace(0), Debug(1), Info(2), Warn(3), Error(4), Critical(5)
  - **Server always returns all logs (Trace level)** - filtering happens client-side
  - **Developer can change log level in UI without re-running request**
  - Logs show level indicator and count of filtered/total logs
- [x] Header serialization in G-Core SDK format
- [x] Property resolution (request.method, request.path, request.url, request.host, response.code, etc.)
- [x] Request metadata (headers, body, trailers)
- [x] Response metadata (headers, body, trailers)
- [x] "Run All Hooks" button for full request flow simulation
- [x] React-based frontend with component architecture
- [x] TypeScript type safety throughout (frontend + backend)
- [x] Vite build system for fast development
- [x] SPA routing with Express fallback
- [x] **WebSocket real-time synchronization** (January 2026)
  - Bi-directional communication between server and all clients
  - Auto-reconnection with exponential backoff
  - Visual connection status indicator
  - Events: request_started, hook_executed, request_completed, wasm_loaded
  - Multi-client support - all users see all activity
  - AI agent integration - API requests visible in UI
  - Optimized for instant connections (<100ms via 127.0.0.1)
- [x] **Configuration Sharing System** (February 2026)
  - Save/load test configurations via UI
  - `fastedge-config.test.json` file stores request settings, headers, properties
  - AI agents can read config via GET `/api/config`
  - Enables developer + AI collaboration workflow
  - Version-controllable test scenarios
  - See [CONFIG_SHARING.md](./features/CONFIG_SHARING.md) for details
- [x] **Production Parity Headers** (February 2026)
  - Browser default headers (user-agent, accept, accept-language, accept-encoding) as opt-in defaults
  - Auto-injection of Host header from target URL (hostname or hostname:port)
  - Auto-injection of proxy headers (x-forwarded-proto, x-forwarded-port, x-real-ip, x-forwarded-for)
  - Editable request.x_real_ip property (default: 203.0.113.42 TEST-NET-3)
  - Test-specific headers (x-inject-req-body, x-inject-res-body) moved to config files only
  - Closer simulation of production CDN environment
  - See [PRODUCTION_PARITY_HEADERS.md](./features/PRODUCTION_PARITY_HEADERS.md) for details
- [x] **FastEdge Host Functions** (February 2026)
  - Secret management with time-based rotation (`proxy_get_secret`, `proxy_get_effective_at_secret`)
  - Dictionary/configuration store (`proxy_dictionary_get`)
  - Production parity with G-Core FastEdge CDN runtime
  - Dotenv file support (.env, .env.secrets, .env.variables)
  - UI toggle for enabling/disabling dotenv loading
  - Dotenv toggle triggers WASM reload (February 6, 2026)
  - Prepared for wasi-http component model integration
  - See [DOTENV.md](./features/DOTENV.md) for configuration details
- [x] **CSS Modules Migration** (February 6, 2026)
  - All 14 React components migrated to CSS Modules
  - Folder-per-component structure with scoped styles
  - Improved maintainability and developer experience
  - No global CSS conflicts
- [x] **Zustand State Management** (February 6, 2026)
  - Centralized state management with 5 modular slices
  - Auto-save to localStorage with 500ms debounce
  - 176 comprehensive tests (90%+ coverage)
  - Redux DevTools integration for debugging
  - Replaced 14 useState hooks with single store
  - See [STATE_MANAGEMENT.md](./architecture/STATE_MANAGEMENT.md) for details
- [x] **Isolated Hook Execution** (February 2026)
  - Each hook runs in fresh WASM instance for production parity
  - Prevents state leakage between hooks
  - Matches FastEdge CDN behavior exactly
- [x] **Property System** (February 2026) - Complete implementation:
  - Runtime property extraction from URLs (request.url, request.host, request.path, request.query, request.scheme, request.extension)
  - User properties + runtime-calculated properties with smart priority (user overrides calculated)
  - `get_property` and `set_property` host functions fully functional
  - Property chaining between hooks (modifications flow through like headers/bodies)
  - Modified properties affect actual HTTP requests (URL reconstruction from properties)
  - Properties displayed in Inputs/Outputs tabs with diff highlighting
- [x] Request header modifications flow through to HTTP fetch
- [x] Response header modifications apply correctly (MapType bug fixed Jan 29, 2026)
- [x] Request body modifications flow through to HTTP fetch
- [x] Response body modifications work correctly
- [x] Real HTTP requests with WASM-modified headers and body
- [x] Works with change-header-code.wasm test binary
- [x] **Dotenv Toggle** (February 6, 2026) - UI toggle properly reloads WASM when dotenv setting changed

---

## Critical Technical Details

### Header Serialization Format

**This was the major breakthrough.** The G-Core AssemblyScript SDK expects a specific binary format:

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

See [PROPERTY_IMPLEMENTATION_COMPLETE.md](./features/PROPERTY_IMPLEMENTATION_COMPLETE.md) for details.

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

- `pnpm run build` - Build both backend and frontend
- `pnpm run build:backend` - Build only backend (TypeScript → dist/)
- `pnpm run build:frontend` - Build only frontend (React → dist/frontend/)
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
2. Click file input and select a .wasm file
3. File is read in browser and sent as base64 to `/api/load`
4. Wait for success message

### Running Hooks

1. Configure request headers, body, trailers (supports key:value format)
2. Configure response headers, body, trailers
3. Set properties (JSON format)
4. Select log level (default: Info)
5. Click "Run All Hooks" or individual hook buttons
6. View output with logs and return codes

Path separators supported: `\0` (null), `.` (dot), `/` (slash)

---

## Development History

### Evolution of the Project

1. **Initial**: Monolithic 942-line ProxyWasmRunner.ts
2. **Refactoring**: Split into 6 modular files for maintainability
3. **Header Format Discovery**: Critical breakthrough in G-Core SDK format
   - Tried: simple length-prefixed format ❌
   - Tried: null-terminated strings only ❌
   - Tried: count prefix without null terminators ❌
   - **Success**: Count + size array + null-terminated data ✅
4. **Frontend Migration**: Vanilla JS → React 19 + Vite + TypeScript
   - Component-based architecture for better maintainability
   - Type-safe API layer
   - Modern development workflow with hot reload
5. **UI Redesign** (January 2026):
   - Moved "Send" button to request bar (Postman-like)
   - Tabbed hook stages panel with Logs/Inputs views
   - Response viewer with Body/Preview/Headers
   - Smart tab visibility based on content type
6. **HTTP Integration**: Added actual fetching between hooks
   - Request hooks modify headers/body
   - Real HTTP request with modifications
   - Response hooks process real server response
   - Binary content handling with base64 encoding
7. **State Management Migration** (February 6, 2026):
   - Migrated from useState to Zustand
   - 5 modular slices: Request, WASM, Results, Config, UI
   - Auto-save functionality with localStorage persistence
   - 176 comprehensive tests for stores
   - Improved maintainability and testability
8. **Project Structure Reorganization**:
   - `src/` → `server/` for clarity
   - Separate `frontend/` directory
   - Base `tsconfig.json` extended by both backend and frontend
   - Build outputs: `dist/` (backend at root, frontend at dist/frontend/)

---

## Test Binaries

### basic-wasm-code.md
- **Purpose**: Simple binary that logs hook invocations
- **Tests**: Basic hook execution, logging
- **Status**: Works perfectly

### print-wasm-code.md
- **Purpose**: Complex binary that parses and prints headers
- **Tests**: Header serialization, property resolution, SDK integration
- **Status**: Works with correct header format

### change-header-code.md (Added Jan 29, 2026)
- **Purpose**: Request modification binary
- **Tests**: Header injection, body modification, set_buffer_bytes
- **Features**: Injects `x-custom-me` header, conditionally modifies JSON body
- **Status**: Header injection verified working, body modification in testing

---

## Code Quality Notes

### Strengths

- Clean modular separation of concerns
- Comprehensive error handling with JSON responses
- Debug logging throughout
- Type safety with TypeScript
- Memory management abstraction
- Automated testing suite (176 tests for state management)
- CSS Modules for component styling
- WebSocket-based real-time synchronization

### Areas for Improvement

- Missing host functions cause initialization errors (non-critical)
- Could add more proxy-wasm host functions
- Full property path coverage not complete
- Response streaming not implemented
- HTTP callouts not implemented

---

## Future Enhancements

### Short Term

1. Fix initialization errors by implementing missing host functions
2. Add more property paths
3. Better error messages in UI

### Medium Term

1. Support for HTTP callouts (proxy_http_call)
2. Shared data operations
3. Metrics support
4. Response streaming support

### Long Term

1. Support for multiple WASM binaries in one session
2. Request/response history
3. Enhanced diff view for header/body changes
4. Integration with CI/CD pipelines
5. WASI-HTTP component model integration

---

## Debugging Tips

### Common Issues

**Headers not parsing correctly**
- Check hex dump in debug logs
- Verify format matches G-Core SDK expectations
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
- Verify server is running on correct port (5179)
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

1. Load `change-header-code.wasm`
2. Set method to POST, URL to `https://httpbin.org/post`
3. Add custom headers in request
4. Add JSON body
5. Configure properties
6. Click "Run All Hooks"
7. Observe:
   - Request hooks modify headers/body
   - HTTP request sent with modifications
   - Response hooks process server response
   - Logs show all hook executions
   - Inputs/Outputs tabs show diffs

---

**Last Updated**: February 2026
**Status**: Production-ready with complete feature set and comprehensive documentation
