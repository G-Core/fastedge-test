# Frontend Architecture

## Overview

The frontend is a React 19 + TypeScript application built with Vite. Its UI adapts to the loaded binary: a CDN (proxy-wasm) view or an HTTP app view. See [HTTP_WASM_IMPLEMENTATION.md](../features/HTTP_WASM_IMPLEMENTATION.md) for the HTTP side.

- **Real-Time Updates**: WebSocket sync with the server; activity from the UI, VSCode and agents calling the REST API appears in every client. See [WEBSOCKET_IMPLEMENTATION.md](../features/WEBSOCKET_IMPLEMENTATION.md).
- **Configuration Sharing**: Load/save `fastedge-config.test.json` to share with agents. See [CONFIG_SHARING.md](../features/CONFIG_SHARING.md).
- **Client-Side Log Filtering**: the server returns all logs at Trace level; the UI filters, so changing the level needs no re-run.

## Technology Stack

- **React 19**: UI framework with hooks
- **TypeScript**: Type safety
- **Vite 7**: Build tool and dev server
- **Zustand 5**: State management with Immer, persist and devtools middleware
- **CSS Modules**: Component-scoped styling
- **WebSocket**: Real-time server communication
- **Vitest**: Unit tests (stores, utils, components, views)

## Page Structure

`App.tsx` has two pages, chosen with tabs at the top:

- **Debugger**: the WASM loader, config buttons, and the view for the loaded app type:
  - `views/ProxyWasmView` for a CDN app, `views/HttpWasmView` for an HTTP app, an empty state when nothing is loaded.
  - The **Multi-app (CDN resource)** toggle (next to the page tabs) swaps the single-app debugger for `views/ResourceView`: several CDN apps on one request, with rules and an origin. Both stay mounted (one hidden), so switching keeps their state. With an HTTP app loaded the toggle is replaced by a note, since a resource takes CDN apps. See [RESOURCES.md](../features/RESOURCES.md).
- **Storage Explorer**: `views/StorageExplorerView`, browsing and editing the local cache and Edge KV with no app loaded. See [STORES.md](../features/STORES.md).

The whole page is wrapped in `DragDropZone` (drop a `.wasm` to load it, or a config file to apply it).

## Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── common/              # Shared by the views
│   │   │   ├── CollapsiblePanel/    # Collapsible section wrapper
│   │   │   ├── ConfigButtons/       # Load / save / edit config
│   │   │   ├── ConnectionStatus/    # WebSocket connection indicator
│   │   │   ├── DictionaryInput/     # Postman-style key-value editor
│   │   │   ├── DotenvPanel/         # dotenv toggle and path
│   │   │   ├── DragDropZone/        # Drop a .wasm or config file
│   │   │   ├── JsonDisplay/         # JSON renderer with diff
│   │   │   ├── LoadingSpinner/      # Shown during WASM type detection
│   │   │   ├── LogLevelSelector/    # Log level dropdown
│   │   │   ├── LogsViewer/          # Logs with level filtering
│   │   │   ├── RequestContextPanel/ # Client / edge context (presets + overrides)
│   │   │   ├── RequestPanel/        # RequestBar (method, URL, Send) + RequestInfoTabs (headers, body)
│   │   │   ├── ResponsePanel/       # Final response: Body / Preview / Headers
│   │   │   ├── StoreCallsList/      # Cache / Edge KV calls of a hook or request
│   │   │   ├── StoresPanel/         # Stores of the loaded app
│   │   │   ├── Tabs/                # Tab strip
│   │   │   ├── Toggle/              # Toggle switch
│   │   │   └── WasmLoader/          # Load by path or upload
│   │   ├── proxy-wasm/          # CDN-only
│   │   │   ├── HookStagesPanel/     # Per-hook Logs / Inputs / Outputs
│   │   │   ├── OriginEditor/        # Origin picker: URL, echo, fixed response, served folder, app
│   │   │   └── OriginSection/       # Origin section of the request context panel
│   │   └── ConfigEditorModal/   # Config editor
│   ├── views/
│   │   ├── HttpWasmView/        # HTTP app: RequestPanel, DotenvPanel, RequestContextPanel, logs, ResponsePanel
│   │   ├── ProxyWasmView/       # CDN app: RequestPanel, DotenvPanel, RequestContextPanel (origin, properties), HookStagesPanel, StoresPanel, ResponsePanel
│   │   ├── ResourceView/        # Multi-app CDN resource
│   │   └── StorageExplorerView/ # Storage Explorer page
│   ├── stores/                  # Zustand store
│   │   ├── index.ts             # Store with middleware stack
│   │   └── slices/              # request, wasm, results, config, ui, httpWasm
│   ├── hooks/                   # useWasm, useWebSocket, useWorkspaceFiles, websocket-types
│   ├── api/index.ts             # Backend API client
│   ├── utils/                   # contentType, diff, environment, filePath, token
│   ├── types/                   # Shared TypeScript types
│   ├── App.tsx                  # Pages, view switching, WebSocket event handling
│   ├── App.css                  # Global styles
│   └── main.tsx                 # React entry point (StrictMode disabled for WebSocket stability)
├── index.html
├── vite.config.ts
├── tsconfig.json                # Extends ../tsconfig.json
└── package.json                 # type: "module"
```

## Component Architecture

### Component Organization

Components are organized by domain:

- **common/**: shared by more than one view (HTTP, CDN, resource, Storage Explorer)
- **proxy-wasm/**: CDN-only (hooks, origin)
- **views/**: one container per view; the views compose components and talk to the store

**Design Principles**:
- Clear ownership: components belong to specific domains
- Domain-specific components don't depend on each other
- common/ components are reused by all views

**CSS Modules**: All components use CSS modules with consistent structure:
- Each component in its own folder: `ComponentName/ComponentName.tsx`
- Scoped styles: `ComponentName.module.css`
- Clean exports: `index.tsx` re-exports the component
- No global style pollution

### App.tsx

**Routing Logic** (Debugger page, single app):
```tsx
{!loading && !wasmPath && <EmptyState />}
{wasmPath && wasmType === 'http-wasm' && <HttpWasmView />}
{wasmPath && wasmType === 'proxy-wasm' && <ProxyWasmView />}
```

**Responsibilities**:
- Page tabs (Debugger / Storage Explorer) and the Multi-app toggle
- WebSocket connection management and event routing to the store
- Dynamic title based on WASM type
- Loader, config buttons, empty state

### ProxyWasmView (CDN app)

Top to bottom: `RequestPanel` (method, URL, Send; headers and body tabs, with opt-in browser default headers and `host` / `content-type` calculated placeholders), `DotenvPanel`, `RequestContextPanel` (client and edge context, the origin via `OriginSection`, and editable properties), `HookStagesPanel`, `StoresPanel`, `ResponsePanel`.

- **Production parity headers**: browser defaults (user-agent, accept, accept-language, accept-encoding) are offered disabled; `host` is calculated from the URL. See [PRODUCTION_PARITY_HEADERS.md](../features/PRODUCTION_PARITY_HEADERS.md).
- **Properties**: explicit properties win over the client settings. Calculated `request.*` values from a run are kept in the store's separate `calculatedProperties` field (`setCalculatedProperties`) and shown in each hook's Inputs; they are never merged into the editable properties, so there is no stale feedback loop.

### CollapsiblePanel.tsx (Reusable Component)

Reusable wrapper for collapsible sections with consistent UI:

```typescript
interface CollapsiblePanelProps {
  title: string;                  // Header text
  children: React.ReactNode;      // Panel content
  defaultExpanded?: boolean;      // Initial state (default: true)
  headerExtra?: React.ReactNode;  // Optional extra content (e.g., badges)
}

export function CollapsiblePanel({
  title,
  children,
  defaultExpanded = true,
  headerExtra,
}: CollapsiblePanelProps) {
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);

  return (
    <div>
      <div className="collapsible-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <h3>{title}</h3>
          {headerExtra}
        </div>
        <span style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
      </div>
      {isExpanded && children}
    </div>
  );
}
```

**Used by**: RequestPanel, RequestContextPanel, HookStagesPanel, StoresPanel, ResponsePanel, HttpWasmView

**Features**:

- Consistent expand/collapse behavior across all panels
- Rotating arrow indicator
- Optional extra header content (used by ResponsePanel for status badges)
- Configurable initial state

### WasmLoader.tsx

Handles WASM file upload:

- File input
- Loading state display
- Calls `onFileLoad(file)` when file selected

### DictionaryInput.tsx (Reusable)

Postman-style tabular key-value editor with enable/disable checkboxes and default values support:

**Purpose:**

- Replace text-area based editing with visual tabular layout
- Allow temporarily disabling key-value pairs without deletion
- Provide preset default values (like Postman's default headers)
- Support per-row placeholders for contextual hints

**Features:**

- **Grid layout**: Checkbox | Key | Value | Delete button
- **Enable/disable**: Checkbox in first column to toggle rows
- **Default values**: Pre-populated suggestions that can be enabled/disabled
- **Per-row placeholders**: Contextual hints specific to each default
- **Read-only rows**: Non-editable display-only rows (no focus, no interaction)
- **Auto-row addition**: Empty row added when typing in last row
- **Delete button**: ✕ icon removes row (maintains at least one empty row)
- **Visual feedback**: Disabled/read-only rows show at 50% opacity

**Props:**

```typescript
export type DefaultValue =
  | string
  | {
      value: string;
      enabled?: boolean;
      placeholder?: string;
      readOnly?: boolean; // Make row non-editable
    };

interface DictionaryInputProps {
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  defaultValues?: Record<string, DefaultValue>; // Preset headers/values
  disableDelete?: boolean; // Disable delete button for all rows
}
```

**DefaultValue Formats:**

```typescript
// Simple string
{ host: "example.com" }

// With enabled state
{ "content-type": { value: "", enabled: false } }

// With placeholder
{
  Authorization: {
    value: "",
    enabled: false,
    placeholder: "Bearer <token>"
  }
}

// Read-only
{
  "request.url": {
    value: "",
    enabled: true,
    placeholder: "<Calculated>",
    readOnly: true  // Non-editable, no focus, purely display
  }
}
```

**Internal State:**

```typescript
interface Row {
  id: string; // Generated via counter: `row-${++rowIdCounter}`
  key: string;
  value: string;
  enabled: boolean; // Checkbox state
  placeholder?: string; // Optional per-row placeholder
}
```

**State Management:**

- Uses lazy initializer: `useState(() => parseValue(value))`
- **No `useEffect` on `value` or `defaultValues`** (prevents interference with user input)
- Default values used ONLY for initial state, can be deleted by user
- Preserves enabled/disabled state across all operations
- Simple counter-based ID generation (no crypto.randomUUID needed)

**Delete Button Logic:**

```typescript
// Disabled when:
// 1. Only 1 row total, OR
// 2. It's the last row AND it's empty (the entry row)
disabled={
  rows.length === 1 ||
  (rows.length === index + 1 && !row.key.trim() && !row.value.trim())
}
```

This ensures there's always an empty row for adding new entries (unless `disableDelete={true}`).

**Checkbox Logic:**

```typescript
// Checkbox disabled only when no key (allows enabling headers with empty values)
disabled={!row.key.trim()}
```

**Update Parent Logic:**

```typescript
// Only requires key, value can be empty
if (row.enabled && row.key.trim()) {
  dict[row.key.trim()] = row.value.trim();
}
```

**Props:**

```typescript
interface DictionaryInputProps {
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  defaultValues?: Record<string, DefaultValue>; // Used ONLY for initial state
  disableDelete?: boolean; // Hide delete buttons, disable row additions
}
```

**disableDelete Mode:**

When `disableDelete={true}`:

- Delete buttons hidden (CSS: `.dictionary-row.no-delete` with 3-column grid)
- No empty row at bottom
- No auto-adding rows when typing
- For fixed key sets

**CSS Classes:**

- `.dictionary-input`: Container
- `.dictionary-header`: Column labels row (4-column grid: 32px | 1fr | 1fr | 40px)
- `.dictionary-row`: Data row (same grid structure)
- `.dictionary-row.no-delete`: 3-column variant when delete disabled (32px | 1fr | 1fr)
- `.dictionary-enabled`: Checkbox column
- `.dictionary-key`, `.dictionary-value`: Input fields
- `.dictionary-delete`: Delete button (✕)

**Design points:**

1. **Counter-based row IDs** (`row-${++rowIdCounter}`)
2. **No `value` / `defaultValues` effect dependencies**: rows initialize once
3. **Default values are ephemeral**: Used only for initial state, can be deleted
4. **Smart delete button**: Prevents deleting last empty row
5. **Checkbox requires only key**: Can enable rows with empty values
6. **updateParent allows empty values**: Only requires key to be included

**CSS Classes:**

- `.dictionary-input`: Container
- `.dictionary-header`: Column labels row (4-column grid: 32px | 1fr | 1fr | 40px)
- `.dictionary-row`: Data row (same grid structure)
- `.dictionary-enabled`: Checkbox column
- `.dictionary-key`, `.dictionary-value`: Input fields
- `.dictionary-delete`: Delete button (✕)

**Why rows initialize once:** a `useEffect([value])` would re-initialize rows on every parent update and lose the enabled state. Rows come from a lazy `useState` initializer on mount, and `value` is not an effect dependency.

### RequestPanel

`common/RequestPanel`: `RequestBar` (method dropdown with GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS; URL or path; Send, disabled until a WASM is loaded) and `RequestInfoTabs` (Headers via `DictionaryInput` with default-header suggestions, Body textarea). Used by both the CDN and HTTP views.

### RequestContextPanel

`common/RequestContextPanel`: client and edge context (preset `de` / `nl` / `us` plus field overrides). Fields apply on blur / Enter. In the CDN view it also holds `OriginSection` and the properties editor. See [REQUEST_CONTEXT.md](../features/REQUEST_CONTEXT.md).

### OriginSection / OriginEditor

`proxy-wasm/OriginSection` and `proxy-wasm/OriginEditor`: the request's origin, either the request URL (unset) or a declared origin: built-in echo, built-in fixed response (status, headers, text or file body), built-in served folder, a URL, or in a resource an HTTP app. See [BUILT_IN_RESPONDER.md](../features/BUILT_IN_RESPONDER.md).

### DotenvPanel / StoresPanel

`DotenvPanel` toggles dotenv loading and sets its path (toggling reloads the WASM; see [DOTENV.md](../features/DOTENV.md)). `StoresPanel` shows the loaded app's cache and Edge KV after each run.

### HookStagesPanel.tsx (Collapsible)

Three-tab interface for comprehensive hook execution inspection, wrapped in CollapsiblePanel:

- **Main tabs**: One for each hook (onRequestHeaders, onRequestBody, onResponseHeaders, onResponseBody)
- **Sub-tabs**: Logs, Inputs, and Outputs
  - **Logs**: Shows WASM execution output, return codes, and errors for that hook
  - **Inputs**: Shows data received by the hook BEFORE WASM modifications (server-side captured state) - includes properties
  - **Outputs**: Shows data produced by the hook AFTER WASM modifications with git-style diffs (server-side captured state) - includes modified properties
- **Log level selector**: Filter logs by severity (Trace, Debug, Info, Warn, Error, Critical)
- **Collapsible**: Uses CollapsiblePanel with title "Logging", defaultExpanded={false}

**Input/Output Separation:**

The panel displays true server-side state for both inputs and outputs, including properties:

- **Inputs tab**: Shows what the hook actually received:
  - Request/response headers and bodies
  - **Properties before hook execution** (all merged properties: user + calculated)
  - Displays using `result.input.properties`

- **Outputs tab**: Shows what the hook produced with visual diffs:
  - Modified headers/bodies highlighted (green for added/changed, red for removed)
  - **Modified properties with diff highlighting** comparing to input properties
  - Displays using `result.output.properties` compared with `result.input.properties`

**Example for onRequestHeaders Outputs:**

Headers:
```diff
{
  "content-type": "application/json",
  "host": "example.com",
+ "x-custom-request": "I am injected from onRequestHeaders"
}
```

Properties:
```diff
{
  "request.url": "https://www.godronus.xyz/200",
  "request.host": "www.godronus.xyz",
- "request.path": "/200"
+ "request.path": "/400"
  "request.country": "LU",
  ...
}
````

**Smart JSON Handling:**

Uses `JsonDisplay` component for all JSON rendering:

```typescript
const isJsonContent = (headers: Record<string, string>): boolean => {
  const contentType =
    Object.entries(headers).find(
      ([key]) => key.toLowerCase() === "content-type",
    )?.[1] || "";
  return contentType.includes("application/json");
};

const parseBodyIfJson = (
  body: string,
  headers: Record<string, string>,
): unknown => {
  if (isJsonContent(headers)) {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  return body;
};
```

**Diff Support:**

- Headers are always diffed in Outputs tab
- Bodies are parsed as JSON (when content-type indicates JSON) and diffed
- Nested objects are properly formatted with indentation
- JSON strings within values are auto-detected and parsed
- Multi-line values get diff markers on each line

**Response Hook Context:**

For `onResponseHeaders` and `onResponseBody`, the Inputs tab shows:

- Response headers/body that the hook received
- Modified request headers from previous hooks (visible in separate section)
- This provides complete context of what data was available during hook execution

### JsonDisplay.tsx (Reusable Component)

Smart JSON renderer with optional git-style diff capabilities:

**Features:**

- **Automatic JSON prettification**: 2-space indentation
- **Optional diff view**: Shows added (green) and removed (red) lines
- **Nested object support**: Multi-line formatting with proper indentation
- **JSON string parsing**: Auto-parses stringified JSON (e.g., `reqBody: "{...}"`)
- **Object-level diffing**: Compares structure, not just text (avoids trailing comma issues)

**Props:**

```typescript
interface JsonDisplayProps {
  data: unknown; // The JSON data to display
  compareWith?: unknown; // Optional: data to compare against
  title?: string; // Optional: section title
  style?: React.CSSProperties; // Optional: custom styling
}
```

**Usage:**

```typescript
// Simple display
<JsonDisplay data={headers} title="Request Headers" />

// With diff
<JsonDisplay
  data={outputHeaders}
  compareWith={inputHeaders}
  title="Request Headers (Modified)"
/>
```

**Example Output with Nested Objects:**

```diff
{
  "hello": "http-responder works!",
  "method": "POST",
  "reqBody": {
    "message": "Hello",
+   "x-inject-req-body": "Injected WASM value"
  },
  "reqHeaders": {
    "accept": "*/*",
    "content-type": "application/json",
+   "x-custom-request": "I am injected from onRequestHeaders"
  },
+ "x-inject-res-body": "Injected WASM value onResponseBody"
}
```

**Used by**: HookStagesPanel (all tabs), ResponsePanel (JSON bodies)

### ResponsePanel (Collapsible)

`common/ResponsePanel` displays the final HTTP response after all WASM processing:

- **Body tab**: Formatted text (JSON pretty-printed, HTML/XML indented, plain text as-is); hidden for binary content
- **Preview tab**: HTML in a sandboxed iframe, images decoded from base64; hidden for non-visual content
- **Headers tab**: Final response headers
- **Status display**: Color-coded HTTP status and content-type in the panel header
- **Smart defaults**: Auto-selects the tab based on content type

## Custom Hooks

### useWasm.ts

WASM loading lives in the Zustand WASM slice (`stores/slices/wasmSlice.ts`); `hooks/useWasm.ts` is a thin wrapper.

- `loadWasm(fileOrPath, dotenvEnabled, dotenvPath?)`: a `File` is uploaded (buffer), a string is sent as a path (see [HYBRID_LOADING.md](../features/HYBRID_LOADING.md)); the server detects the type
- `reloadWasm(dotenvEnabled, dotenvPath?)`: reload the same WASM (dotenv toggle, edge dc change) without the file picker
- `setWasmLoaded(...)`: set the state when another client loaded the WASM (WebSocket `wasm_loaded`)
- Loading, error and load-timing state for the loader

### useWebSocket.ts

WebSocket connection management with auto-reconnect. See [WEBSOCKET_IMPLEMENTATION.md](../features/WEBSOCKET_IMPLEMENTATION.md) for details.

## State Management

State is managed using **Zustand** with a modular slices pattern:

### Architecture

**Store Slices:**
1. **Request Slice** - HTTP request/response configuration (persisted)
2. **WASM Slice** - Binary loading and state (ephemeral)
3. **Results Slice** - Hook execution results (ephemeral)
4. **Config Slice** - Properties, calculated properties, settings (persisted, except calculated properties)
5. **UI Slice** - UI state, tabs, panels (partially persisted)
6. **HTTP WASM Slice** - HTTP app request and response

**Store Location:** `frontend/src/stores/`

### Middleware Stack

- **Immer**: Safe mutable updates with immutability guarantees
- **Persist**: Auto-save to localStorage with 500ms debounce
- **DevTools**: Redux DevTools integration for debugging

### Auto-Save System

Configuration automatically persists to localStorage:
- **Persisted**: Request config, properties, settings, UI preferences
- **Ephemeral**: WASM state, results, loading states, errors

**Storage Key:** `proxy-runner-config`
**Debounce:** 500ms delay to prevent excessive writes

### Usage in Components

```typescript
// Selective subscription (optimal performance)
const method = useAppStore(state => state.method);
const setMethod = useAppStore(state => state.setMethod);

// Multiple values
const { method, url, setMethod, setUrl } = useAppStore();

// Entire store (use sparingly)
const store = useAppStore();
```

### Testing

Store logic is tested per slice (`stores/slices/*.test.ts`): actions, persistence behaviour, async operations.

See [STATE_MANAGEMENT.md](./STATE_MANAGEMENT.md) for complete documentation.

### Related Documentation

- [STATE_MANAGEMENT.md](./STATE_MANAGEMENT.md) - Complete Zustand implementation guide
- [TEST_PATTERNS.md](../development/TEST_PATTERNS.md) - Testing patterns including store tests

## API Layer

### API Client (`api/index.ts`)

Main functions (the client also covers config, stores, resources, the Storage Explorer and HTTP apps):

#### uploadWasm(file: File): Promise<string>

```typescript
// 1. Read file as ArrayBuffer
const buffer = await file.arrayBuffer();

// 2. Convert to base64
const base64 = btoa(
  new Uint8Array(buffer).reduce(
    (data, byte) => data + String.fromCharCode(byte),
    "",
  ),
);

// 3. POST to /api/load
const response = await fetch("/api/load", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ wasmBase64: base64 }),
});

// 4. Return filename as "path"
return file.name;
```

#### callHook(hook: string, params: HookCall): Promise<HookResult>

Calls a single hook individually (used for manual hook testing):

```typescript
const payload = { hook, request, response, properties, logLevel };
const response = await fetch("/api/call", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});
const result = await response.json();
return {
  logs: result.result.logs.map((log) => log.message).join("\n"),
  returnValue: result.result.returnCode,
  error: result.error,
};
```

#### sendFullFlow(url: string, method: string, params: HookCall): Promise<FullFlowResult>

Executes complete request flow with real HTTP fetch:

```typescript
// 1. Send full flow request
const payload = {
  url,
  request: {
    headers: params.request_headers || {},
    body: params.request_body || "",
    method: method || "GET",
  },
  response: { headers: {}, body: "" }, // Initial, will be replaced by real response
  properties: params.properties || {},
  logLevel: params.logLevel !== undefined ? params.logLevel : 0,
};

const response = await fetch("/api/send", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

// 2. Parse response with hook results and final response
const result = await response.json();

// Transform hook results with input/output data
const hookResults: Record<string, HookResult> = {};
for (const [hook, hookResult] of Object.entries(result.hookResults || {})) {
  const hr = hookResult as any;
  const logs = hr?.logs || [];
  hookResults[hook] = {
    logs: logs.map((log: any) => log.message || String(log)).join("\n"),
    returnValue: hr?.returnCode,
    error: hr?.error,
    input: hr?.input, // What hook received (before WASM)
    output: hr?.output, // What hook produced (after WASM)
    properties: hr?.properties,
  };
}

return {
  hookResults,
  finalResponse: {
    status: 200,
    statusText: "OK",
    headers: { "content-type": "application/json" },
    body: "...",
    contentType: "application/json",
    isBase64: false,
  },
};
```

**Input/Output Tracking:**

Each hook result now includes both `input` and `output` fields captured by the backend:

- `input`: Data state BEFORE the hook executed (what was provided to WASM)
- `output`: Data state AFTER the hook executed (what WASM produced)

This enables the frontend to show:

- **Inputs tab**: Original data received by hook
- **Outputs tab**: Modified data produced by hook
- Clear visibility into WASM modifications

## Utility Modules

### Diff Utility (`utils/diff.ts`)

Provides JSON diffing algorithms with object-level comparison for better results than line-by-line text diffing.

**Exports:**

```typescript
export type DiffLine = {
  type: "added" | "removed" | "unchanged";
  content: string;
  lineNumber?: number;
};

// Main entry point - automatically chooses best diff strategy
export function computeJsonDiff(
  before: unknown,
  after: unknown,
): DiffLine[] | null;

// Helper to check for plain objects
export function isPlainObject(value: unknown): boolean;
```

**Key Algorithms:**

1. **Object-level diffing** (`computeObjectDiff`):
   - Compares JSON objects by keys, not by text lines
   - Avoids trailing comma issues
   - Handles nested objects with proper indentation
   - Auto-parses JSON strings (e.g., `"{\"key\": \"value\"}"`)
   - Formats multi-line values with appropriate diff markers

2. **Line-by-line diffing** (`computeLineDiff`):
   - Uses LCS (Longest Common Subsequence) algorithm
   - Falls back for non-object types (arrays, primitives)
   - Good for comparing formatted text

3. **LCS Algorithm** (`findLCS`):
   - Dynamic programming approach
   - O(m\*n) time complexity
   - Finds longest common subsequence of lines
   - Used to identify unchanged content

**Smart Features:**

- Detects JSON strings and parses them automatically
- Nested objects formatted with proper indentation
- Multi-line values handled correctly in diffs
- Each nested line gets appropriate diff marker (added/removed/unchanged)

**Example Usage:**

```typescript
import { computeJsonDiff } from "../utils/diff";

const before = { foo: "bar", nested: { a: 1 } };
const after = { foo: "bar", nested: { a: 1, b: 2 }, new: "value" };

const diffLines = computeJsonDiff(before, after);
// Returns array of DiffLine objects showing the differences
```

### Content Type Utility (`utils/contentType.ts`)

Provides automatic content-type detection for request bodies (Postman-like behavior).

**Export:**

```typescript
export function applyDefaultContentType(
  headers: Record<string, string>,
  body: string,
): Record<string, string>;
```

**Detection Logic:**

- Only applies if content-type header not already set
- Examines body content to determine type:
  - Starts with `{` or `[` → `application/json`
  - Starts with `<!doctype` or `<html` → `text/html`
  - Starts with `<?xml` → `application/xml`
  - Starts with `<` → `text/html`
  - Otherwise → `text/plain`

## Type System

### Frontend Types (`types/index.ts`)

```typescript
export interface HookCall {
  request_headers?: Record<string, string>;
  request_body?: string;
  request_trailers?: Record<string, string>;
  response_headers?: Record<string, string>;
  response_body?: string;
  response_trailers?: Record<string, string>;
  properties?: Record<string, string>;
  logLevel?: number;
}

export interface HookResult {
  logs: string;
  returnValue?: number;
  error?: string;
  input?: {
    request: {
      headers: Record<string, string>;
      body: string;
    };
    response: {
      headers: Record<string, string>;
      body: string;
    };
  };
  output?: {
    request: {
      headers: Record<string, string>;
      body: string;
    };
    response: {
      headers: Record<string, string>;
      body: string;
    };
  };
  properties?: Record<string, unknown>;
}

export interface WasmState {
  wasmPath: string | null;
  wasmBuffer: ArrayBuffer | null;
}
```

### Backend API Format

Request:

```json
{
  "hook": "onRequestHeaders",
  "request": {
    "headers": { "host": "example.com" },
    "body": "",
    "trailers": {}
  },
  "response": {
    "headers": { "content-type": "application/json" },
    "body": "",
    "trailers": {}
  },
  "properties": { "my.custom.property": "value" },
  "logLevel": 2
}
```

Response:

```json
{
  "ok": true,
  "result": {
    "returnCode": 0,
    "logs": [
      {"level": 2, "message": "onRequestHeaders >> info"},
      {"level": 1, "message": "#header -> host: example.com"}
    ],
    "request": {"headers": {...}, "body": ""},
    "response": {"headers": {...}, "body": ""}
  }
}
```

## Build Configuration

### vite.config.ts

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:5179", // Backend server
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "../dist/frontend", // Output to dist/frontend directory
  },
});
```

### Development Server

In dev mode (`pnpm run dev:frontend`):

- Vite dev server runs on port 5173
- Proxies `/api/*` requests to backend on port 5179
- Hot module replacement (HMR) enabled
- Fast refresh for React components

### Production Build

In production (`pnpm run build:frontend`):

- Builds to `../dist/frontend/`
- Express serves static files from `dist/frontend/`
- SPA fallback: all non-API routes serve `index.html`

## TypeScript Configuration

### frontend/tsconfig.json

```json
{
  "extends": "../tsconfig.json", // Inherits base config
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "noEmit": true // Vite handles compilation
    // ... other options
  }
}
```

### Base tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "moduleResolution": "Node"
  }
}
```

## Utilities

### contentType.ts (`utils/contentType.ts`)

Utility function for automatic content-type detection (Postman-like behavior):

```typescript
/**
 * Applies default content-type header based on request body content if not already set.
 * Mimics Postman's automatic content-type detection behavior.
 */
export function applyDefaultContentType(
  headers: Record<string, string>,
  body: string,
): Record<string, string> {
  const finalHeaders = { ...headers };

  // Only auto-calculate if content-type is not present in headers
  if (!finalHeaders["content-type"] && body.trim()) {
    const trimmedBody = body.trim();
    const lowerBody = trimmedBody.toLowerCase();

    // Try to detect content type from body
    if (trimmedBody.startsWith("{") || trimmedBody.startsWith("[")) {
      finalHeaders["content-type"] = "application/json";
    } else if (
      lowerBody.startsWith("<!doctype html") ||
      lowerBody.startsWith("<html")
    ) {
      finalHeaders["content-type"] = "text/html";
    } else if (trimmedBody.startsWith("<?xml")) {
      finalHeaders["content-type"] = "application/xml";
    } else if (trimmedBody.startsWith("<")) {
      // Generic XML/HTML - default to HTML as it's more common in testing
      finalHeaders["content-type"] = "text/html";
    } else {
      finalHeaders["content-type"] = "text/plain";
    }
  }

  return finalHeaders;
}
```

**Detection Priority:**

1. User-set header (never override)
2. JSON: `{` or `[`
3. HTML DOCTYPE: `<!doctype html`
4. HTML tag: `<html`
5. XML declaration: `<?xml`
6. Generic markup: `<`
7. Plain text: fallback

**Usage in App.tsx:**

```typescript
const finalHeaders = applyDefaultContentType(requestHeaders, requestBody);
await sendFullFlow(url, method, { ...hookCall, request_headers: finalHeaders });
```

## Styling

**CSS Modules**:

- Every component uses a CSS module
- Component-scoped styling with `.module.css` files
- No naming conflicts or global pollution
- Consistent folder structure across all components
- `App.css` retained for global layout and connection status styles

**Benefits:**
- Scoped class names prevent conflicts
- Better maintainability and modularity
- Type-safe imports: `import styles from "./Component.module.css"`
- Clear ownership: styles live with their components

No CSS framework (Bootstrap, Tailwind, etc.) - kept minimal and custom.

## Development Workflow

### Local Development

1. Terminal 1: Backend

   ```bash
   pnpm run dev:backend
   # Builds TypeScript, runs with --watch
   # Server on http://localhost:5179
   ```

2. Terminal 2: Frontend

   ```bash
   pnpm run dev:frontend
   # Vite dev server on http://localhost:5173
   # Proxies API calls to :5179
   ```

3. Open browser to http://localhost:5173
4. Edit React components → instant HMR
5. Edit backend code → auto-restart

### Production Build

```bash
pnpm run build
# Builds backend → dist/
# Builds frontend → dist/frontend/

pnpm start
# Serves on http://localhost:5179
# Serves frontend from dist/frontend/
```

## Notes

- Frontend package.json has `"type": "module"` for ESM support
- No `node_modules` in frontend/ - uses parent's via pnpm
- Build output goes to parent directory for easier deployment
- Backend serves both API and static frontend (single server deployment)
- **SDK quirk**: Returns empty string `""` for missing headers, not `null`
- Content-type detection runs only when header not explicitly set by user
- Default headers support three formats: string, {value, enabled}, {value, enabled, placeholder}
- **Input/Output tracking**: Backend captures state before and after each hook execution
- **JSON prettification**: Automatic formatting for JSON bodies based on content-type header
- **Three-tab interface**: Logs (execution output), Inputs (before WASM), Outputs (after WASM)

