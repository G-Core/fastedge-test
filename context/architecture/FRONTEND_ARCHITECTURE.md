# Frontend Architecture

## Overview

The frontend is a React 19 + TypeScript application built with Vite. It provides a modern, type-safe interface with **adaptive UI** that supports both HTTP WASM and Proxy-WASM testing workflows.

**✅ Adaptive UI** (February 10, 2026): Dual-view architecture with automatic switching between HTTP WASM and Proxy-WASM interfaces based on selected type. See [HTTP_WASM_UI.md](../features/HTTP_WASM_UI.md) for details.

**✅ Real-Time Updates**: WebSocket integration (January 2026) provides instant synchronization with server state. All activity from UI interactions and AI agent API calls appears in real-time. See [WEBSOCKET_IMPLEMENTATION.md](../features/WEBSOCKET_IMPLEMENTATION.md) for details.

**✅ Configuration Sharing** (February 2026): Load/save test configurations to share between UI and AI agents. See [CONFIG_SHARING.md](../features/CONFIG_SHARING.md) for details.

**✅ Client-Side Log Filtering** (February 2026): Server returns all logs at Trace level. UI filters dynamically - change log level without re-running requests.

## Technology Stack

- **React 19.2.3**: UI framework with hooks
- **TypeScript 5.4.5**: Type safety
- **Vite 7.3.1**: Build tool and dev server
- **Zustand 5.0.3**: State management with Immer middleware (migrated February 6, 2026)
- **CSS Modules**: Component-scoped styling (migrated February 6, 2026)
- **WebSocket**: Real-time server communication (ws protocol)
- **Vitest**: Unit testing framework with 176 store tests

## Project Structure

```
frontend/
├── src/
│   ├── components/          # React components (domain-based organization)
│   │   ├── common/          # Shared by both views (8 components)
│   │   │   ├── WasmLoader/
│   │   │   │   ├── WasmLoader.tsx       # File upload with type selector
│   │   │   │   ├── WasmLoader.module.css
│   │   │   │   └── index.tsx
│   │   │   ├── DictionaryInput/
│   │   │   │   ├── DictionaryInput.tsx  # Postman-style key-value editor
│   │   │   │   ├── DictionaryInput.module.css
│   │   │   │   └── index.tsx
│   │   │   ├── RequestBar/
│   │   │   │   ├── RequestBar.tsx       # Method + URL input
│   │   │   │   ├── RequestBar.module.css
│   │   │   │   └── index.tsx
│   │   │   ├── ResponseViewer/
│   │   │   │   ├── ResponseViewer.tsx   # Smart response display
│   │   │   │   ├── ResponseViewer.module.css
│   │   │   │   └── index.tsx
│   │   │   ├── CollapsiblePanel/
│   │   │   │   ├── CollapsiblePanel.tsx # Reusable collapsible wrapper
│   │   │   │   ├── CollapsiblePanel.module.css
│   │   │   │   └── index.tsx
│   │   │   ├── ConnectionStatus/
│   │   │   │   ├── ConnectionStatus.tsx # WebSocket connection indicator
│   │   │   │   ├── ConnectionStatus.module.css
│   │   │   │   └── index.tsx
│   │   │   ├── JsonDisplay/
│   │   │   │   ├── JsonDisplay.tsx      # Smart JSON renderer with diff
│   │   │   │   ├── JsonDisplay.module.css
│   │   │   │   └── index.tsx
│   │   │   ├── Toggle/
│   │   │   │   ├── Toggle.tsx           # Reusable toggle switch
│   │   │   │   ├── Toggle.module.css
│   │   │   │   └── index.tsx
│   │   │   └── LogsViewer/             # NEW (Feb 10, 2026)
│   │   │       ├── LogsViewer.tsx       # Reusable logs viewer with filtering
│   │   │       ├── LogsViewer.module.css
│   │   │       └── index.tsx
│   │   │
│   │   ├── proxy-wasm/      # Proxy-WASM specific (6 components)
│   │   │   ├── HeadersEditor/
│   │   │   │   ├── HeadersEditor.tsx    # Headers editor wrapper
│   │   │   │   ├── HeadersEditor.module.css
│   │   │   │   └── index.tsx
│   │   │   ├── PropertiesEditor/
│   │   │   │   ├── PropertiesEditor.tsx # Properties with country presets
│   │   │   │   ├── PropertiesEditor.module.css
│   │   │   │   └── index.tsx
│   │   │   ├── ServerPropertiesPanel/
│   │   │   │   ├── ServerPropertiesPanel.tsx # Properties panel
│   │   │   │   ├── ServerPropertiesPanel.module.css
│   │   │   │   └── index.tsx
│   │   │   ├── RequestTabs/
│   │   │   │   ├── RequestTabs.tsx      # Request config tabs
│   │   │   │   ├── RequestTabs.module.css
│   │   │   │   └── index.tsx
│   │   │   ├── ResponseTabs/
│   │   │   │   ├── ResponseTabs.tsx     # Response tabs (unused)
│   │   │   │   ├── ResponseTabs.module.css
│   │   │   │   └── index.tsx
│   │   │   └── HookStagesPanel/
│   │   │       ├── HookStagesPanel.tsx  # Hook execution viewer
│   │   │       ├── HookStagesPanel.module.css
│   │   │       └── index.tsx
│   │   │
│   │   └── http-wasm/       # HTTP WASM specific (2 components) - NEW
│   │       ├── HttpRequestPanel/
│   │       │   ├── HttpRequestPanel.tsx  # HTTP request configuration
│   │       │   ├── HttpRequestPanel.module.css
│   │       │   └── index.tsx
│   │       └── HttpResponsePanel/
│   │           ├── HttpResponsePanel.tsx # HTTP response display
│   │           ├── HttpResponsePanel.module.css
│   │           └── index.tsx
│   │
│   ├── views/               # Main view containers - NEW (Feb 10, 2026)
│   │   ├── HttpWasmView/
│   │   │   ├── HttpWasmView.tsx         # HTTP WASM main container
│   │   │   ├── HttpWasmView.module.css
│   │   │   └── index.tsx
│   │   └── ProxyWasmView/
│   │       ├── ProxyWasmView.tsx        # Proxy-WASM main container
│   │       ├── ProxyWasmView.module.css
│   │       └── index.tsx
│   │
│   ├── stores/              # Zustand state management
│   │   ├── index.ts         # Main store with middleware stack
│   │   └── slices/
│   │       ├── requestSlice.ts   # Proxy-WASM request state (persisted)
│   │       ├── wasmSlice.ts      # WASM loading + type tracking
│   │       ├── resultsSlice.ts   # Proxy-WASM hook results (ephemeral)
│   │       ├── configSlice.ts    # Proxy-WASM config (persisted)
│   │       ├── uiSlice.ts        # UI state & tabs (partial persist)
│   │       └── httpWasmSlice.ts  # HTTP WASM state - NEW (Feb 10, 2026)
│   ├── hooks/
│   │   ├── useWebSocket.ts  # WebSocket connection with auto-reconnect (314 lines)
│   │   └── websocket-types.ts # Event type definitions
│   ├── api/
│   │   └── index.ts         # Backend API client
│   ├── utils/
│   │   ├── contentType.ts   # Auto content-type detection utility
│   │   └── diff.ts          # JSON diff algorithms and utilities
│   ├── types/
│   │   └── index.ts         # TypeScript interfaces
│   ├── App.tsx              # Main application component + WebSocket event handling
│   ├── App.css              # Global styles + connection status styles
│   └── main.tsx             # React entry point (StrictMode disabled for WebSocket stability)
├── public/                  # Static assets (empty currently)
├── index.html               # HTML entry point
├── vite.config.ts           # Vite configuration
├── tsconfig.json            # TypeScript config (extends ../tsconfig.json)
├── tsconfig.node.json       # TypeScript config for Vite
└── package.json             # type: "module"
```

## Component Architecture

**Domain-Based Organization** (February 10, 2026): Components reorganized by domain for clear separation and reusability:

### Component Organization

**common/ - Shared Components (8)**:
1. **WasmLoader** - File upload with type selector (HTTP WASM vs Proxy-WASM)
2. **DictionaryInput** - Postman-style key-value editor
3. **RequestBar** - Method + URL input
4. **ResponseViewer** - Smart response display (JSON, HTML, images, etc.)
5. **CollapsiblePanel** - Reusable collapsible wrapper
6. **ConnectionStatus** - WebSocket status indicator
7. **JsonDisplay** - JSON renderer with diff support
8. **Toggle** - Reusable toggle switch
9. **LogsViewer** - Logs viewer with filtering (NEW - Feb 10, 2026)

**proxy-wasm/ - Proxy-WASM Specific (6)**:
1. **HeadersEditor** - Headers editing wrapper
2. **PropertiesEditor** - Server properties with country presets
3. **ServerPropertiesPanel** - Collapsible properties panel
4. **RequestTabs** - Request configuration tabs (Headers/Body)
5. **ResponseTabs** - Response display tabs (unused currently)
6. **HookStagesPanel** - Hook execution viewer (Logs/Inputs/Outputs)

**http-wasm/ - HTTP WASM Specific (2)** - NEW (Feb 10, 2026):
1. **HttpRequestPanel** - HTTP request configuration (method, URL, headers, body)
2. **HttpResponsePanel** - HTTP response display (body, headers, logs)

**views/ - Main Containers (2)** - NEW (Feb 10, 2026):
1. **HttpWasmView** - HTTP WASM main container (Postman-like interface)
2. **ProxyWasmView** - Proxy-WASM main container (hook execution interface)

**Design Principles**:
- ✅ Clear ownership - components belong to specific domains
- ✅ Prevents coupling - domain-specific components can't accidentally depend on each other
- ✅ Component reuse - common/ components shared by both views
- ✅ Scalability - easy to add new WASM types
- ✅ Maintainability - clear separation of concerns

**CSS Modules**: All components use CSS modules with consistent structure:
- Each component in its own folder: `ComponentName/ComponentName.tsx`
- Scoped styles: `ComponentName.module.css`
- Clean exports: `index.tsx` re-exports the component
- No global style pollution, improved maintainability

### App.tsx (Main Router) - REFACTORED (Feb 10, 2026)

**New Role**: Adaptive UI router that switches between views based on WASM type.

**Routing Logic**:
```tsx
{!wasmPath && <EmptyState />}
{wasmPath && wasmType === 'http-wasm' && <HttpWasmView />}
{wasmPath && wasmType === 'proxy-wasm' && <ProxyWasmView />}
```

**Responsibilities**:
- WebSocket connection management
- Event routing to correct state slice
- Dynamic title based on WASM type
- Empty state when no WASM loaded
- Load/Save Config (Proxy-WASM only)

**Production Parity Headers (February 2026):**

- **Browser Default Headers**: Opt-in defaults for user-agent, accept, accept-language, accept-encoding
  - Disabled by default, developers enable as needed for testing
  - Realistic browser values matching Firefox 147.0 on Linux
- **Host Header**: Auto-calculated from target URL, shown as `<Calculated from URL>` placeholder
  - Test-specific headers (x-inject-req-body, x-inject-res-body) removed from defaults
  - Now only come from fastedge-config.test.json when needed for specific tests
- See [PRODUCTION_PARITY_HEADERS.md](../features/PRODUCTION_PARITY_HEADERS.md) for details

```typescript
const App = () => {
  // Zustand store - all state centralized
  const {
    // Request state
    method, url, requestHeaders, requestBody,
    responseHeaders, responseBody,
    setMethod, setUrl, setRequestHeaders, setRequestBody,

    // WASM state
    wasmPath, wasmFile, loading, error,
    loadWasm, reloadWasm,

    // Results state
    hookResults, finalResponse,
    setHookResults, setFinalResponse,

    // Config state
    properties, dotenv, logLevel,
    setProperties, setDotenvEnabled, setLogLevel,
    loadFromConfig, exportConfig,

    // UI state
    wsStatus, setWsStatus,
  } = useAppStore();

  // WebSocket connection
  const { status } = useWebSocket({...});

  return (
    <div className="container">
      <WasmLoader onFileLoad={(file) => loadWasm(file, dotenv.enabled)} />
      <RequestBar
        method={method}
        url={url}
        wasmLoaded={wasmPath !== null}
        onMethodChange={setMethod}
        onUrlChange={setUrl}
        onSend={async () => {
          // Apply auto content-type detection (Postman-like behavior)
          const finalHeaders = applyDefaultContentType(requestHeaders, requestBody);

          // Calls sendFullFlow API - executes all hooks + real HTTP fetch
          const { hookResults, finalResponse } = await sendFullFlow(
            url,
            method,
            { ...hookCall, request_headers: finalHeaders, logLevel }
          );
          setHookResults(hookResults);
          setFinalResponse(finalResponse);
        }}
      />
      <RequestTabs
        headers={requestHeaders}
        body={requestBody}
        onHeadersChange={setRequestHeaders}
        onBodyChange={setRequestBody}
        defaultHeaders={{
          host: "example.com",
          "content-type": {
            value: "",
            enabled: false,
            placeholder: "<Calculated at runtime>",
          },
          Authorization: {
            value: "",
            enabled: false,
            placeholder: "Bearer <token>",
          },
        }}
      />
      <ServerPropertiesPanel
        properties={properties}
        onPropertiesChange={setProperties}
      />
      <HookStagesPanel
        results={hookResults}
        hookCall={hookCall}
        logLevel={logLevel}
        onLogLevelChange={setLogLevel}
      />
      <ResponseViewer response={finalResponse} />
    </div>
  );
};
```

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

**Used by**: RequestTabs, HookStagesPanel, ResponseViewer

**Features**:

- Consistent expand/collapse behavior across all panels
- Rotating arrow indicator
- Optional extra header content (used by ResponseViewer for status badges)
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
      readOnly?: boolean; // NEW: Make row non-editable (Jan 31, 2026)
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

// Read-only (NEW: Jan 31, 2026)
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
- Used by PropertiesEditor for fixed property set

**CSS Classes:**

- `.dictionary-input`: Container
- `.dictionary-header`: Column labels row (4-column grid: 32px | 1fr | 1fr | 40px)
- `.dictionary-row`: Data row (same grid structure)
- `.dictionary-row.no-delete`: 3-column variant when delete disabled (32px | 1fr | 1fr)
- `.dictionary-enabled`: Checkbox column
- `.dictionary-key`, `.dictionary-value`: Input fields
- `.dictionary-delete`: Delete button (✕)

**Key Improvements (Jan 30, 2026):**

1. **Removed crypto.randomUUID**: Simple counter-based IDs (`row-${++rowIdCounter}`)
2. **Removed useEffect dependencies**: No longer reacts to `value` or `defaultValues` changes
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

**Bug Fix History:**

Previously had a critical bug where `useEffect([value])` would re-initialize rows on every parent update, losing the enabled state. Fixed by:

1. Removing `value` from dependencies
2. Using lazy initializer in `useState`
3. Only initializing once on mount

### HeadersEditor.tsx (Reusable)

Simplified wrapper around DictionaryInput with default headers support:

```typescript
interface HeadersEditorProps {
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
  defaultHeaders?: Record<string, DefaultValue>;
}

export const HeadersEditor = ({ value, onChange, defaultHeaders }: Props) => (
  <DictionaryInput
    value={value}
    onChange={onChange}
    keyPlaceholder="Header name"
    valuePlaceholder="Header value"
    defaultValues={defaultHeaders}
  />
);
```

Previously was a text area for `key: value` format. Now uses DictionaryInput for Postman-style editing.

### RequestForm.tsx

Configure request data:

- Request headers (HeadersEditor → DictionaryInput)
- Request body (textarea)
- Request trailers (HeadersEditor → DictionaryInput)

### ResponseForm.tsx

Configure response data:

- Response headers (HeadersEditor → DictionaryInput)
- Response body (textarea)
- Response trailers (HeadersEditor → DictionaryInput)

### PropertiesEditor.tsx

Proxy-WASM properties editor with country presets:

**Purpose:**

- Edit proxy-wasm property values for testing (request.path, request.country, etc.)
- Provide country-specific presets for geo-location properties
- Use DictionaryInput for consistent UX with headers editor

**Features:**

- **Country selector**: Radio buttons with flag emojis (🇱🇺 Luxembourg, 🇩🇪 Germany)
- **Country presets**: Pre-populated geo data (coordinates, region, continent)
- **Property list**: Based on Rust constants from proxy-wasm implementation
- **Enabled/disabled states**: Calculated properties start unchecked
- **Fixed property set**: Uses `disableDelete={true}` to prevent adding/removing properties

**Available Properties (from Rust):**

```typescript
// Enabled by default (country-specific values)
"request.country": "LU" / "DE"
"request.city": "Luxembourg" / "Frankfurt"
"request.geo.lat": "49.6116" / "50.1109"
"request.geo.long": "6.1319" / "8.6821"
"request.region": "Luxembourg" / "Hesse"
"request.continent": "Europe"
"request.country.name": "Luxembourg" / "Germany"

// Disabled by default (calculated at runtime)
"request.url": "<Calculated>"
"request.host": "<Calculated>"
"request.path": "<Calculated>"
"request.scheme": "<Calculated>"
"request.extension": "<Calculated>"
"request.query": "<Calculated>"
"request.x_real_ip": "<Calculated>"
"request.asn": "<Calculated>"
"request.var": "<Calculated>"
```

**Country Presets Structure:**

```typescript
type CountryPreset = {
  code: string;
  name: string;
  city: string;
  geoLat: string;
  geoLong: string;
  region: string;
  continent: string;
  flag: string;
};

const countryPresets: Record<string, CountryPreset> = {
  luxembourg: { code: "LU", name: "Luxembourg", city: "Luxembourg", ... },
  germany: { code: "DE", name: "Germany", city: "Frankfurt", ... },
};
```

**Behavior:**

- Switching countries updates all country-specific property values
- Calculated properties (request.url, request.host, etc.) are read-only and enabled
- User can edit geo-location properties (country, city, coordinates)
- Properties are ordered with user-editable ones first, calculated ones at bottom
- All interactions go through DictionaryInput component with `disableDelete={true}`

### ServerPropertiesPanel.tsx (Collapsible)

Dedicated panel for server-side proxy-wasm properties, positioned between Request and Hooks panels:

**Purpose:**

- Separate server properties from request configuration
- Provide clear visual hierarchy
- Start collapsed to reduce UI clutter

**Features:**

- **Title**: "Server Properties"
- **Default state**: Collapsed (`defaultExpanded={false}`)
- **Position**: Between RequestTabs and HookStagesPanel
- **Content**: PropertiesEditor with country presets

**Component:**

```typescript
interface ServerPropertiesPanelProps {
  properties: Record<string, string>;
  onPropertiesChange: (properties: Record<string, string>) => void;
}

export function ServerPropertiesPanel({
  properties,
  onPropertiesChange,
}: ServerPropertiesPanelProps) {
  return (
    <CollapsiblePanel title="Server Properties" defaultExpanded={false}>
      <PropertiesEditor value={properties} onChange={onPropertiesChange} />
    </CollapsiblePanel>
  );
}
```

**Rationale for Separation:**

- Properties are server-side concerns (geo-location, ASN, etc.), not part of HTTP request
- Request panel focused purely on HTTP data (headers, body)
- Better organization and discoverability
- Reduces cognitive load with collapsed-by-default state

### RequestTabs.tsx (Collapsible)

Configure request data with tabbed interface wrapped in CollapsiblePanel:

- **Tabs**: Headers, Body (Properties moved to ServerPropertiesPanel)
- **Headers tab**: HeadersEditor for key:value input with default headers support
- **Body tab**: Textarea for request body (JSON, XML, etc.)
- **Collapsible**: Uses CollapsiblePanel with title "Request", defaultExpanded={true}
- **Default headers**: Can pass `defaultHeaders` prop to provide preset suggestions

**Default Headers Example:**

````typescript
<RequestTabs
  headers={headers}
  onHeadersChange={setHeaders}
  defaultHeaders={{
    host: "example.com",
    "content-type": {
      value: "",
      enabled: false,
      placeholder: "<Calculated at runtime>",
    },
    Authorization: {
      value: "",
      enabled: false,
      placeholder: "Bearer <token>",
    },
  }}
/>

### HookStagesPanel.tsx (Collapsible)

Three-tab interface for comprehensive hook execution inspection, wrapped in CollapsiblePanel:

- **Main tabs**: One for each hook (onRequestHeaders, onRequestBody, onResponseHeaders, onResponseBody)
- **Sub-tabs**: Logs, Inputs, and Outputs
  - **Logs**: Shows WASM execution output, return codes, and errors for that hook
  - **Inputs**: Shows data received by the hook BEFORE WASM modifications (server-side captured state) - includes properties
  - **Outputs**: Shows data produced by the hook AFTER WASM modifications with git-style diffs (server-side captured state) - includes modified properties
- **Log level selector**: Filter logs by severity (Trace, Debug, Info, Warn, Error, Critical)
- **Collapsible**: Uses CollapsiblePanel with title "Logging", defaultExpanded={false}

**Input/Output Separation (Updated February 5, 2026):**

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

**Used by**: HookStagesPanel (all tabs), ResponseViewer (JSON bodies)

### ResponseViewer.tsx (Collapsible)

Displays final HTTP response after all WASM processing, wrapped in CollapsiblePanel:

- **Body tab**: Formatted text display
  - JSON: Pretty-printed with 2-space indent
  - HTML: Formatted with proper indentation
  - XML: Formatted with proper indentation
  - Plain text: As-is
  - Hidden for binary content
- **Preview tab**: Visual rendering
  - HTML: Rendered in sandboxed iframe
  - Images: Displayed with proper base64 decoding
  - Other: "Preview not available" message
  - Hidden for non-visual content (JSON, plain text, etc.)
- **Headers tab**: Final response headers as key-value pairs
- **Status display**: Color-coded HTTP status and content-type in header
- **Smart defaults**: Auto-selects appropriate tab based on content type
- **Collapsible**: Uses CollapsiblePanel with title "Response", status/contentType in headerExtra, defaultExpanded={true}

### RequestBar.tsx

Top navigation bar with integrated styling:

- HTTP method dropdown (GET, POST) - integrated with URL input
- URL input field - shares focus border with method selector
- **"Send" button**: Triggers full flow execution (all hooks + HTTP fetch)
- Disabled when WASM not loaded
- Custom styling removes orange focus borders

## Custom Hooks

### useWasm.ts

WASM functionality is now integrated into the Zustand WASM store slice.

Located at: `frontend/src/stores/slices/wasmSlice.ts`

```typescript
export const createWasmSlice: StateCreator<AppStore, [['zustand/immer', never]], [], WasmSlice> =
  (set, get) => ({
    wasmPath: null,
    wasmBuffer: null,
    wasmFile: null,
    loading: false,
    error: null,

    loadWasm: async (file: File, dotenvEnabled: boolean = true) => {
      set(state => { state.loading = true; state.error = null; });
      try {
        await uploadWasm(file, dotenvEnabled);
        const buffer = await file.arrayBuffer();
        set(state => {
          state.wasmPath = file.name;
          state.wasmBuffer = buffer;
          state.wasmFile = file;
          state.loading = false;
        });
      } catch (err) {
        set(state => {
          state.error = err instanceof Error ? err.message : "Failed to load WASM";
          state.loading = false;
        });
      }
    },

    reloadWasm: async (dotenvEnabled: boolean = true) => {
      const { wasmFile } = get();
      if (!wasmFile) {
        set(state => { state.error = "No WASM file loaded to reload"; });
        return;
      }
      await get().loadWasm(wasmFile, dotenvEnabled);
    },

    clearWasm: () => set(state => {
      state.wasmPath = null;
      state.wasmBuffer = null;
      state.wasmFile = null;
      state.loading = false;
      state.error = null;
    }),
  });
```

**Key Features:**
- Stores original file for reloading
- `reloadWasm()` function to re-upload without file picker
- Support for dotenv toggle (environment variable injection)
- Error handling and loading states
- Integrated into centralized Zustand store

### useWebSocket.ts

WebSocket connection management with auto-reconnect (314 lines). See [WEBSOCKET_IMPLEMENTATION.md](../features/WEBSOCKET_IMPLEMENTATION.md) for details.

## State Management

State is managed using **Zustand** with a modular slices pattern:

### Architecture

**5 Store Slices:**
1. **Request Slice** - HTTP request/response configuration (persisted)
2. **WASM Slice** - Binary loading and state (ephemeral)
3. **Results Slice** - Hook execution results (ephemeral)
4. **Config Slice** - Properties, settings, auto-save (persisted)
5. **UI Slice** - UI state, tabs, panels (partially persisted)

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

Store logic is fully tested with 176 tests:
- All actions validated
- Persistence behavior verified
- Async operations tested
- 90%+ coverage on all slices

See [STATE_MANAGEMENT.md](./STATE_MANAGEMENT.md) for complete documentation.

### Related Documentation

- [STATE_MANAGEMENT.md](./STATE_MANAGEMENT.md) - Complete Zustand implementation guide
- [TEST_PATTERNS.md](../development/TEST_PATTERNS.md) - Testing patterns including store tests
- [CHANGELOG.md](../CHANGELOG.md) - Full migration details (Feb 6, 2026 entry)

## API Layer

### API Client (`api/index.ts`)

Two main functions:

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

**CSS Modules Migration Complete** (February 6, 2026):

- All 14 components migrated from global CSS to CSS modules
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

## Key Differences from Old Vanilla JS Frontend

### Before (Vanilla JS)

- Single `app.js` file (~180 lines)
- Manual DOM manipulation
- String-based templates
- No type safety
- Global event listeners
- Direct fetch calls throughout

### After (React + TypeScript)

- Component-based architecture
- Declarative UI
- JSX templates
- Full type safety
- Component-scoped logic
- Centralized API layer
- Reusable components (HeadersEditor)
- Better state management
- Development server with HMR

## Future Enhancements

### Potential Improvements

1. ~~**State Management**: Add Zustand for complex state~~ ✅ **COMPLETED** (Feb 6, 2026)
2. ~~**Testing**: Add Vitest for unit tests~~ ✅ **COMPLETED** (Feb 6, 2026)
3. ~~**Persistence**: Save test configurations to localStorage~~ ✅ **COMPLETED** (Feb 6, 2026)
4. **Styling**: Consider Tailwind CSS or styled-components
5. **Validation**: Add Zod for runtime type validation
6. **Error Handling**: Add React Error Boundaries
7. **Import/Export**: Save/load test scenarios as JSON
8. **Code Splitting**: Lazy load components
9. **Accessibility**: Improve ARIA labels and keyboard navigation
10. **Dark Mode**: Add theme toggle

## Notes

- Vite requires Node.js 20.19+ or 22.12+ (currently warns about 20.12.2)
- Frontend package.json has `"type": "module"` for ESM support
- No `node_modules` in frontend/ - uses parent's via pnpm
- Build output goes to parent directory for easier deployment
- Backend serves both API and static frontend (single server deployment)
- **G-Core SDK quirk**: Returns empty string `""` for missing headers, not `null`
- Content-type detection runs only when header not explicitly set by user
- Default headers support three formats: string, {value, enabled}, {value, enabled, placeholder}
- **Input/Output tracking**: Backend captures state before and after each hook execution
- **JSON prettification**: Automatic formatting for JSON bodies based on content-type header
- **Three-tab interface**: Logs (execution output), Inputs (before WASM), Outputs (after WASM)

Last Updated: February 6, 2026 (Zustand state management implemented)
