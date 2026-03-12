# HTTP WASM UI - Postman-like Interface

## Overview

The HTTP WASM UI provides a simple, Postman-like interface for testing HTTP WASM binaries. Unlike the hook-based Proxy-WASM interface, this view focuses on straightforward HTTP request/response testing without the complexity of lifecycle hooks or property management.

**Key Feature**: The application now has an **adaptive UI** that automatically switches between HTTP WASM and Proxy-WASM views based on **automatically detected** WASM type.

---

## Automatic Type Detection

### Overview

Users no longer need to manually select "HTTP WASM" or "Proxy-WASM" when loading binaries. The server automatically detects the WASM type by inspecting the binary structure and routes to the appropriate interface.

### Detection Strategy

**Module**: `server/utils/wasmTypeDetector.ts`

The detector uses a simple, reliable approach:

1. **Attempt to compile** the WASM module with `WebAssembly.compile()`
2. **If compilation fails** (version mismatch) → **HTTP WASM** (Component Model)
3. **If compilation succeeds**, inspect exports:
   - Has `http-handler` or `process` exports → **HTTP WASM** (Rust builds)
   - Has `proxy_*` functions → **Proxy-WASM**
   - Default → **Proxy-WASM**

### Handled Binary Types

| Type | Build Tool | Detection Method | Example Export |
|------|-----------|------------------|----------------|
| HTTP WASM (Component Model) | TypeScript/JS (jco) | Compile fails with version error | N/A - can't compile |
| HTTP WASM (Traditional) | Rust (cargo component) | Has `http-handler` export | `gcore:fastedge/http-handler#process` |
| Proxy-WASM | Rust (proxy-wasm) | Has `proxy_*` exports | `proxy_on_request_headers` |

### Implementation Details

**Server (`server/server.ts`):**
```typescript
// No wasmType required in request
POST /api/load { wasmBase64, dotenvEnabled }

// Auto-detect type
const wasmType = await detectWasmType(buffer);

// Return detected type
res.json({ ok: true, wasmType });
```

**Frontend (`frontend/src/stores/slices/wasmSlice.ts`):**
```typescript
// Upload without type
const { path, wasmType } = await uploadWasm(file, dotenvEnabled);

// Store detected type
state.wasmType = wasmType;
```

**UI (`frontend/src/App.tsx`):**
```typescript
// Route based on detected type
{wasmPath && wasmType === 'http-wasm' && <HttpWasmView />}
{wasmPath && wasmType === 'proxy-wasm' && <ProxyWasmView />}
```

### Benefits

- ✅ **Simpler UX**: One less step - just upload the file
- ✅ **No user error**: Can't accidentally select wrong type
- ✅ **Universal**: Works across all build toolchains (Rust, TypeScript, JS)
- ✅ **Reliable**: Based on actual binary structure, not file extensions
- ✅ **Fast**: Instant detection using native WebAssembly API

---

## Architecture

### Folder Structure

```
frontend/src/
├── components/
│   ├── common/              # Shared by both views
│   │   ├── CollapsiblePanel/
│   │   ├── DictionaryInput/
│   │   ├── LoadingSpinner/  # Loading indicator (NEW)
│   │   ├── LogsViewer/      # Reusable logs viewer (NEW)
│   │   ├── ResponseViewer/
│   │   ├── RequestBar/
│   │   └── ...
│   │
│   ├── http-wasm/          # HTTP WASM-specific (NEW)
│   │   ├── HttpRequestPanel/
│   │   └── HttpResponsePanel/
│   │
│   └── proxy-wasm/         # Proxy-WASM-specific
│       ├── HookStagesPanel/
│       ├── ServerPropertiesPanel/
│       └── ...
│
├── views/
│   ├── HttpWasmView/       # HTTP WASM main view (NEW)
│   └── ProxyWasmView/      # Proxy-WASM main view (NEW)
│
└── stores/
    └── slices/
        ├── httpWasmSlice.ts    # HTTP WASM state (NEW)
        └── wasmSlice.ts         # Updated with wasmType

```

**Design Principle**: Domain-based organization prevents coupling and makes responsibilities clear.

---

## State Management

### HTTP WASM State Slice

**Location**: `frontend/src/stores/slices/httpWasmSlice.ts`

**State Structure**:
```typescript
interface HttpWasmState {
  // Request configuration
  httpMethod: string;              // GET, POST, PUT, DELETE, etc.
  httpUrl: string;                 // Full URL with protocol
  httpRequestHeaders: Record<string, string>;
  httpRequestBody: string;         // Request body (JSON, text, etc.)

  // Response data
  httpResponse: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
    contentType: string;
    isBase64?: boolean;            // For binary responses
  } | null;

  // Execution logs
  httpLogs: Array<{
    level: number;                 // 0=Trace, 1=Debug, 2=Info, 3=Warn, 4=Error, 5=Critical
    message: string;
  }>;

  // Execution state
  httpIsExecuting: boolean;        // Loading state
}
```

**Actions**:
```typescript
// Request configuration
setHttpMethod(method: string): void
setHttpUrl(url: string): void
setHttpRequestHeaders(headers: Record<string, string>): void
setHttpRequestBody(body: string): void

// Response updates
setHttpResponse(response: HttpWasmState['httpResponse']): void
setHttpLogs(logs: Array<{ level: number; message: string }>): void
setHttpIsExecuting(isExecuting: boolean): void

// Execution
executeHttpRequest(): Promise<void>  // Calls API and updates response/logs

// Cleanup
clearHttpResponse(): void            // Clear response and logs
resetHttpWasm(): void                // Reset all state to defaults
```

**Integration**:
- Integrated into main Zustand store via `createHttpWasmSlice`
- Uses Immer middleware for immutable updates
- Separate from Proxy-WASM state (clean separation)

---

## Components

### 1. HttpRequestPanel

**Location**: `frontend/src/components/http-wasm/HttpRequestPanel/`

**Purpose**: Configure HTTP request parameters (method, URL, headers, body).

**Structure**:
```tsx
<CollapsiblePanel title="Request">
  <RequestBar />              {/* Method + URL input */}
  <Tabs>
    <HeadersTab>
      <DictionaryInput />     {/* Key-value header editor */}
    </HeadersTab>
    <BodyTab>
      <textarea />            {/* Request body */}
    </BodyTab>
  </Tabs>
  <button onClick={executeRequest}>Send</button>
</CollapsiblePanel>
```

**Features**:
- **RequestBar**: Reused from common/ for method + URL input
- **Tabs**: Headers and Body tabs with active state
- **DictionaryInput**: Reused from common/ for headers (key-value pairs)
- **Send Button**:
  - Disabled when no WASM loaded or during execution
  - Shows spinner during execution
  - Triggers `executeHttpRequest()` action
- URL validation (must be full URL with protocol)

**Component Reuse**:
- `RequestBar` from `components/common/RequestBar/`
- `DictionaryInput` from `components/common/DictionaryInput/`
- `CollapsiblePanel` from `components/common/CollapsiblePanel/`

**Styling**: Dark theme consistent with existing components.

---

### 2. HttpResponsePanel

**Location**: `frontend/src/components/http-wasm/HttpResponsePanel/`

**Purpose**: Display HTTP response with body, headers, and execution logs.

**Structure**:
```tsx
<CollapsiblePanel
  title="Response"
  headerExtra={<StatusBadge />}  {/* "200 OK" styled badge */}
>
  <Tabs>
    <BodyTab>
      <ResponseViewer />      {/* Smart content display */}
    </BodyTab>
    <HeadersTab>
      {/* Table view of headers */}
    </HeadersTab>
    <LogsTab>
      <LogsViewer />          {/* Logs with filtering */}
    </LogsTab>
  </Tabs>
</CollapsiblePanel>
```

**Features**:
- **Status Badge**: Color-coded badge in panel header
  - Green: 2xx (Success)
  - Orange: 3xx (Redirect)
  - Red: 4xx/5xx (Client/Server Error)
  - Shows "200 OK" or "Error" with status text
- **Body Tab**: ResponseViewer handles all content types
  - JSON: Pretty-printed with syntax highlighting
  - HTML: Formatted view + live preview
  - Images: Display inline
  - Binary: Base64 or hex view
  - Text: Monospace display
- **Headers Tab**: Table view with key-value pairs
  - Headers displayed as `key: value`
  - Monospace font for clarity
- **Logs Tab**: LogsViewer with filtering
  - Color-coded by level
  - Filter by minimum level
  - Shows count badge on tab
- **Empty State**: "Send a request to see response"

**Component Reuse**:
- `ResponseViewer` from `components/common/ResponseViewer/`
- `LogsViewer` from `components/common/LogsViewer/`
- `CollapsiblePanel` from `components/common/CollapsiblePanel/`

**Styling**: Dark theme with status colors.

---

### 3. LogsViewer (Shared Component)

**Location**: `frontend/src/components/common/LogsViewer/`

**Purpose**: Reusable component for displaying logs with filtering and color-coding.

**Features**:
- **Log Display**: Array of log entries with level and message
- **Color Coding**:
  - Trace (0): Gray
  - Debug (1): Blue
  - Info (2): Green
  - Warn (3): Yellow
  - Error (4): Red
  - Critical (5): Red + Bold
- **Filtering**: Dropdown to filter by minimum log level
  - "All levels" (0+)
  - "Debug and above" (1+)
  - "Info and above" (2+)
  - "Warn and above" (3+)
  - "Error and above" (4+)
  - "Critical only" (5)
- **Filter Info**: Shows "Showing X of Y logs" when filtered
- **Monospace Font**: Easier to read structured logs
- **Scrollable**: Max height 400px with custom scrollbar
- **Empty State**: "No logs captured"

**Props**:
```typescript
interface LogsViewerProps {
  logs: Array<{ level: number; message: string }>;
  defaultLogLevel?: number;      // Default filter level (0 = show all)
  showLevelFilter?: boolean;     // Show/hide filter dropdown
}
```

**Usage**:
```tsx
<LogsViewer logs={httpLogs} defaultLogLevel={0} />
```

**Reusability**:
- Used by HTTP WASM response panel (for execution logs)
- Can be used by Proxy-WASM views (for hook logs)
- Fully self-contained with no external dependencies

---

### 4. HttpWasmView (Main Container)

**Location**: `frontend/src/views/HttpWasmView/`

**Purpose**: Main container view that combines request and response panels.

**Structure**:
```tsx
<div className="httpWasmView">
  <header>
    <h2>HTTP WASM Test Runner</h2>
    <p>Configure and execute HTTP requests through your WASM binary</p>
  </header>

  <div className="panels">
    <HttpRequestPanel />
    <HttpResponsePanel />
  </div>
</div>
```

**Responsibilities**:
- Layout container (vertical split)
- Header with title and description
- Combines request and response panels
- Scrollable panel area

**Styling**:
- Vertical layout with gap between panels
- Full height container
- Scrollable overflow

---

## App Router (Adaptive UI)

### WASM Type Selection

**Component**: `WasmLoader` (updated)

**Location**: `frontend/src/components/common/WasmLoader/`

**New Feature**: Radio button selector for WASM type

**UI**:
```tsx
<div className="typeSelector">
  <label>WASM Type:</label>
  <div className="radioGroup">
    <label>
      <input type="radio" name="wasmType" value="http-wasm" checked />
      <span>HTTP WASM</span>
      <span className="description">Simple HTTP request/response</span>
    </label>
    <label>
      <input type="radio" name="wasmType" value="proxy-wasm" />
      <span>Proxy-WASM</span>
      <span className="description">Hook-based execution with properties</span>
    </label>
  </div>
</div>
```

**Behavior**:
- User selects type **before** loading WASM file
- Selected type is passed to `loadWasm(file, wasmType, dotenvEnabled)`
- Type is stored in `wasmSlice` state
- Type persists across reloads
- Default: HTTP WASM (more common use case)

---

### App.tsx Router Logic

**Location**: `frontend/src/App.tsx`

**Routing Logic**:
```tsx
function App() {
  const { wasmPath, wasmType } = useAppStore();

  return (
    <div className="container">
      <header>
        <h1>
          {wasmType === 'http-wasm' ? 'HTTP WASM Debugger' :
           wasmType === 'proxy-wasm' ? 'Proxy-WASM Test Runner' :
           'FastEdge WASM Debugger'}
        </h1>
        <ConnectionStatus />
      </header>

      <WasmLoader />

      {/* Adaptive routing based on wasmType */}
      {!wasmPath && <EmptyState />}
      {wasmPath && wasmType === 'http-wasm' && <HttpWasmView />}
      {wasmPath && wasmType === 'proxy-wasm' && <ProxyWasmView />}
    </div>
  );
}
```

**Key Features**:
- **Dynamic Title**: Changes based on selected WASM type
- **Empty State**: Shown when no WASM is loaded
- **Conditional Rendering**: Only one view active at a time
- **Type Safety**: TypeScript ensures correct view for each type

---

### WebSocket Event Routing

**Event Types**:

**Proxy-WASM Events** (existing):
- `request_started` → Update proxy-wasm request state
- `hook_executed` → Update hook results
- `request_completed` → Update final response and properties
- `request_failed` → Show error in hooks
- `properties_updated` → Merge properties

**HTTP WASM Events** (new):
- `http_wasm_request_completed` → Update HTTP response and logs

**Event Type Definition**:
```typescript
interface HttpWasmRequestCompletedEvent extends BaseEvent {
  type: "http_wasm_request_completed";
  data: {
    response: {
      status: number;
      statusText: string;
      headers: Record<string, string>;
      body: string;
      contentType: string;
      isBase64?: boolean;
    };
    logs: Array<{ level: number; message: string }>;
  };
}
```

**Routing in App.tsx**:
```typescript
function handleServerEvent(event: ServerEvent) {
  switch (event.type) {
    case "http_wasm_request_completed":
      // HTTP WASM events → update HTTP state
      setHttpResponse(event.data.response);
      setHttpLogs(event.data.logs);
      break;

    case "request_completed":
      // Proxy-WASM events → update proxy state
      setHookResults(event.data.hookResults);
      setFinalResponse(event.data.finalResponse);
      break;

    // ... other event types
  }
}
```

**Benefits**:
- Clean separation of event handling
- Each view gets its own state updates
- No interference between HTTP WASM and Proxy-WASM flows
- Real-time synchronization across multiple clients

---

## User Flow

### HTTP WASM Testing Workflow

1. **Select Type**: Choose "HTTP WASM" radio button
2. **Load Binary**: Click "Choose File" and select `.wasm` file
3. **Configure Request**:
   - Select method (GET, POST, PUT, DELETE, etc.)
   - Enter full URL (e.g., `http://example.com/api/test`)
   - Add headers in Headers tab (optional)
   - Enter body in Body tab (for POST/PUT)
4. **Execute**: Click "Send" button
5. **View Response**:
   - **Body Tab**: See formatted response
   - **Headers Tab**: See response headers
   - **Logs Tab**: See WASM execution logs
6. **Iterate**: Modify request and re-execute

### Switching Between Types

**To switch from HTTP WASM to Proxy-WASM**:
1. Select "Proxy-WASM" radio button
2. Load a proxy-wasm binary
3. UI automatically switches to ProxyWasmView
4. Full hook execution interface appears

**To switch back**:
1. Select "HTTP WASM" radio button
2. Load an HTTP WASM binary
3. UI switches back to HttpWasmView
4. Simple request/response interface appears

**Note**: Type selection is persistent - refreshing the page maintains the last selected type.

---

## API Integration

### Execute HTTP WASM Request

**Function**: `executeHttpWasm()`

**Location**: `frontend/src/api/index.ts`

**Signature**:
```typescript
async function executeHttpWasm(
  url: string,
  method: string = 'GET',
  headers: Record<string, string> = {},
  body: string = ''
): Promise<{
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  contentType: string;
  isBase64?: boolean;
  logs: Array<{ level: number; message: string }>;
}>
```

**Implementation**:
```typescript
export async function executeHttpWasm(
  url: string,
  method: string = 'GET',
  headers: Record<string, string> = {},
  body: string = ''
): Promise<...> {
  const response = await fetch('/api/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, method, headers, body }),
  });

  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error || 'Failed to execute HTTP WASM');
  }

  const result = await response.json();
  return result.result;  // Contains response + logs
}
```

**Backend Endpoint**: POST `/api/execute` (already exists - no changes needed)

**Flow**:
1. Frontend calls `executeHttpWasm()` with request params
2. API sends POST to `/api/execute`
3. Backend executes WASM binary via `HttpWasmRunner`
4. Backend returns response + logs
5. Frontend updates state via `setHttpResponse()` and `setHttpLogs()`
6. UI re-renders with new data

---

### Upload WASM with Type

**Function**: `uploadWasm()` (updated)

**Signature**:
```typescript
async function uploadWasm(
  file: File,
  wasmType: 'proxy-wasm' | 'http-wasm',  // NEW parameter
  dotenvEnabled: boolean = true
): Promise<string>
```

**Change**: Added `wasmType` parameter to payload

**Implementation**:
```typescript
const response = await fetch('/api/load', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    wasmBase64: base64,
    wasmType,        // NEW
    dotenvEnabled
  }),
});
```

**Backend**: `/api/load` endpoint receives and stores `wasmType` (no other changes needed)

---

## Styling

### Dark Theme Consistency

All new components follow the existing dark theme:

**Colors**:
- Background: `#1e1e1e`, `#252525`, `#2d2d2d`
- Text: `#e0e0e0`, `#b0b0b0`
- Accent: `#ff6c37` (orange)
- Borders: `#3d3d3d`

**Status Colors**:
- Success (2xx): `#90ee90` (light green)
- Redirect (3xx): `#ffd700` (gold)
- Client Error (4xx): `#ff6b6b` (coral)
- Server Error (5xx): `#ff0000` (red)

**Log Level Colors**:
- Trace: `#808080` (gray)
- Debug: `#6495ed` (cornflower blue)
- Info: `#90ee90` (light green)
- Warn: `#ffd700` (gold)
- Error: `#ff6b6b` (coral)
- Critical: `#ff0000` (red) + bold

### CSS Modules

All components use CSS Modules for scoped styling:
- `Component.module.css` → imports as `styles`
- No global style pollution
- Easy to maintain and refactor

**Example**:
```tsx
import styles from './HttpRequestPanel.module.css';

<div className={styles.requestPanel}>
  <button className={styles.sendButton}>Send</button>
</div>
```

---

## UI Polish & Refinements

### URL Input Constraints

**Problem**: HTTP WASM binaries always execute on `http://test.localhost/` - the host cannot be changed.

**Solution**: Fixed prefix URL input
- Displays `http://test.localhost/` as non-editable gray prefix
- Only the path portion is editable (white text)
- Clicking the prefix focuses the input
- Unified appearance - looks like one text field

**Implementation**:
```tsx
<div className={styles.urlInputContainer}>
  <span className={styles.urlPrefix} onClick={focusInput}>
    http://test.localhost/
  </span>
  <input
    ref={inputRef}
    value={path}
    onChange={(e) => setHttpUrl(HTTP_WASM_HOST + e.target.value)}
  />
</div>
```

**CSS Overrides**:
- Used `!important` to override global input styles (width, padding, border)
- Prevented visual breaks between prefix and input
- Removed focus border from input (only container gets orange border)

### Consistent View Padding

Both `HttpWasmView` and `ProxyWasmView` now have equal padding:
- Horizontal: `2rem` (left/right breathing room)
- Vertical: `1.5rem` (top/bottom spacing)

**Before**: HTTP WASM content was tight against edges
**After**: Consistent, professional spacing across all views

### Loading Spinner

**Component**: `components/common/LoadingSpinner/`

**Purpose**: Visual feedback during WASM loading and type detection

**Features**:
- 60px spinning circle with orange accent (`#ff6c37`)
- Centered display with customizable message
- Smooth animation (1s linear infinite)
- Replaces old view during loading (prevents confusion)

**Usage in App.tsx**:
```tsx
{loading && <LoadingSpinner message="Loading and detecting WASM type..." />}
{!loading && wasmPath && wasmType === 'http-wasm' && <HttpWasmView />}
{!loading && wasmType === 'proxy-wasm' && <ProxyWasmView />}
```

**Benefits**:
- Clear feedback for large files (12MB+)
- Branded with application colors
- Prevents displaying stale views during detection
- Reusable for future loading states

---

## Testing

### Manual Testing Checklist

**Load and Execute**:
- [ ] Select "HTTP WASM" type
- [ ] Upload HTTP WASM binary (e.g., `sdk-basic.wasm`)
- [ ] Verify HttpWasmView appears
- [ ] Configure request (method, URL, headers, body)
- [ ] Click "Send"
- [ ] Verify response appears

**Response Display**:
- [ ] Body tab shows formatted response
- [ ] Headers tab shows key-value pairs
- [ ] Logs tab shows execution logs with colors
- [ ] Status badge shows correct color and text

**Content Types**:
- [ ] JSON response → pretty-printed
- [ ] HTML response → formatted view
- [ ] Plain text → displayed correctly
- [ ] Binary/image → handled appropriately

**Interactions**:
- [ ] Tab switching works smoothly
- [ ] Log filtering works (All/Debug+/Info+/Warn+/Error+/Critical)
- [ ] Send button disables during execution
- [ ] Spinner shows during execution
- [ ] Error states display correctly

**Type Switching**:
- [ ] Switch to "Proxy-WASM"
- [ ] Load proxy-wasm binary
- [ ] Verify ProxyWasmView appears
- [ ] Full hook execution interface works
- [ ] Switch back to "HTTP WASM"
- [ ] Simple interface returns

**WebSocket Events**:
- [ ] Open two browser tabs
- [ ] Execute request in one tab
- [ ] Verify response updates in both tabs

---

## Benefits

### For Users

1. **Simplicity**: No need to understand hooks or properties for HTTP WASM testing
2. **Familiar**: Postman-like interface is immediately recognizable
3. **Fast**: Quick iteration cycle (configure → execute → view)
4. **Clear**: Status colors and log levels make results obvious
5. **Flexible**: Switch between HTTP WASM and Proxy-WASM as needed

### For Developers

1. **Clean Architecture**: Domain-based organization prevents coupling
2. **Reusable Components**: LogsViewer, ResponseViewer, etc. shared across views
3. **Type Safety**: Full TypeScript coverage with strict types
4. **Maintainable**: Clear separation of concerns
5. **Extensible**: Easy to add new WASM types or features
6. **Testable**: Self-contained components with clear responsibilities

---

## Future Enhancements

### Potential Features

1. **Request History**: Save and replay previous requests
2. **Collections**: Organize requests into folders
3. **Templates**: Pre-configured request templates
4. **Export/Import**: Share configurations between developers
5. **Variables**: Environment variables for URLs and headers
6. **Scripts**: Pre-request and post-response scripts
7. **Tests**: Assertion-based testing (like Postman)
8. **Mocking**: Mock backend responses for testing
9. **GraphQL Support**: Special handling for GraphQL queries
10. **Advanced Filtering**: Filter logs by content, regex, etc.

### Architecture Improvements

1. **Request Persistence**: Save requests to localStorage
2. **Keyboard Shortcuts**: Cmd+Enter to send, etc.
3. **Request Diffing**: Compare request/response over time
4. **Performance Metrics**: Execution time, memory usage
5. **Batch Execution**: Run multiple requests sequentially

---

## Related Documentation

- [HTTP_WASM_IMPLEMENTATION.md](./HTTP_WASM_IMPLEMENTATION.md) - Backend runner implementation
- [FRONTEND_ARCHITECTURE.md](../architecture/FRONTEND_ARCHITECTURE.md) - Frontend structure
- [STATE_MANAGEMENT.md](../architecture/STATE_MANAGEMENT.md) - Zustand patterns
- [COMPONENT_STYLING_PATTERN.md](../development/COMPONENT_STYLING_PATTERN.md) - CSS guidelines

---

**Last Updated**: February 10, 2026
