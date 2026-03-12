# State Management Guide
## Zustand Implementation in proxy-runner

**Version:** 1.0
**Last Updated:** 2026-02-06
**Status:** Production

---

## Table of Contents

1. [Overview](#overview)
2. [Store Structure](#store-structure)
3. [Using Stores in Components](#using-stores-in-components)
4. [Auto-Save System](#auto-save-system)
5. [Persistence Configuration](#persistence-configuration)
6. [Testing Stores](#testing-stores)
7. [Adding New State](#adding-new-state)
8. [Migration Notes](#migration-notes)
9. [Best Practices](#best-practices)
10. [Troubleshooting](#troubleshooting)

---

## Overview

### Why Zustand?

The proxy-runner application uses Zustand for centralized state management, replacing 14 separate `useState` hooks that were previously scattered across `App.tsx`.

**Key Benefits:**
- **Simplicity**: Minimal boilerplate compared to Redux
- **TypeScript-First**: Full type inference and type safety
- **Performance**: Component re-renders only when selected state changes
- **DevTools**: Redux DevTools integration for debugging
- **Auto-Save**: Built-in debounced persistence to localStorage
- **Testability**: Easy to test in isolation
- **No Context Providers**: Direct hook usage without provider wrapping

**Why Not Redux?** Redux requires significant boilerplate (actions, reducers, types) for simple state updates. Zustand provides the same capabilities with 90% less code.

**Why Not Context + useState?** Context causes all consumers to re-render on any state change, leading to performance issues. Zustand supports selective subscriptions.

### Architecture Overview: 5 Slices Pattern

The store is organized into 5 focused slices, each managing a specific domain:

```
┌─────────────────────────────────────────────────────────┐
│                   Root Store (Combined)                  │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Request    │  │     WASM     │  │   Results    │  │
│  │   (persist)  │  │  (ephemeral) │  │ (ephemeral)  │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐                     │
│  │    Config    │  │      UI      │                     │
│  │   (persist)  │  │  (partial)   │                     │
│  └──────────────┘  └──────────────┘                     │
│                                                          │
│  Middleware: [devtools, persist, immer]                 │
└─────────────────────────────────────────────────────────┘
```

**Data Flow:**

```
User Action → Store Action → State Update → markDirty() → Debounce (500ms) → localStorage
                                  ↓
                            Component Re-render (selective)
```

### Auto-Save Functionality

The store automatically persists user configuration to localStorage with a 500ms debounce delay. This means:

- Users don't need to manually save settings
- Settings persist across browser sessions
- Performance impact is minimal (debounced writes)
- Only user-configurable state is saved (not runtime data)

### Persistence Strategy

**What Gets Saved:**
- Request configuration (method, URL, headers, body)
- Response configuration (headers, body)
- Server properties
- Application settings (dotenv, log level)
- UI preferences (expanded panels)

**What Doesn't Get Saved:**
- WASM binary state (must reload file)
- Execution results (runtime data)
- Loading states
- Error messages
- WebSocket status
- Active tab selection

---

## Store Structure

### File Organization

```
frontend/src/stores/
├── index.ts              # Combined store + exports
├── types.ts              # All type definitions
└── slices/
    ├── requestSlice.ts   # HTTP request configuration
    ├── wasmSlice.ts      # WASM binary loading
    ├── resultsSlice.ts   # Hook execution results
    ├── configSlice.ts    # App configuration
    └── uiSlice.ts        # UI-specific state
```

### 1. Request Slice

**Purpose:** Manages HTTP request/response configuration for the test runner.

**State:**
```typescript
interface RequestState {
  method: string;                      // HTTP method (GET, POST, etc.)
  url: string;                         // Target URL
  requestHeaders: Record<string, string>;   // Request headers
  requestBody: string;                 // Request payload
  responseHeaders: Record<string, string>;  // Mock response headers
  responseBody: string;                // Mock response body
}
```

**Available Actions:**
```typescript
setMethod(method: string): void
setUrl(url: string): void
setRequestHeaders(headers: Record<string, string>): void
setRequestBody(body: string): void
setResponseHeaders(headers: Record<string, string>): void
setResponseBody(body: string): void
updateRequestHeader(key: string, value: string): void   // Granular update
removeRequestHeader(key: string): void                  // Granular remove
updateResponseHeader(key: string, value: string): void
removeResponseHeader(key: string): void
resetRequest(): void                                     // Reset to defaults
```

**Persistence:** YES (all state is persisted)

**markDirty() Calls:** All mutating actions call `markDirty()` to trigger auto-save

**Example Usage:**
```typescript
const { method, url, setMethod, setUrl } = useAppStore();

// Update method
setMethod('POST');

// Update single header
updateRequestHeader('Authorization', 'Bearer token123');
```

### 2. WASM Slice

**Purpose:** Manages WebAssembly binary loading and state.

**State:**
```typescript
interface WasmState {
  wasmPath: string | null;      // Server path to uploaded WASM
  wasmBuffer: ArrayBuffer | null;  // Binary data
  wasmFile: File | null;        // Original File object (for reload)
  loading: boolean;             // Loading indicator
  error: string | null;         // Error message
}
```

**Available Actions:**
```typescript
loadWasm(file: File, dotenvEnabled: boolean): Promise<void>
reloadWasm(dotenvEnabled: boolean): Promise<void>
clearWasm(): void
setLoading(loading: boolean): void
setError(error: string | null): void
```

**Persistence:** NO (ephemeral - file must be reloaded on page refresh)

**markDirty() Calls:** None (ephemeral state doesn't trigger auto-save)

**Example Usage:**
```typescript
const { wasmPath, loading, error, loadWasm, reloadWasm } = useAppStore();

// Load WASM file
const handleFileUpload = async (file: File) => {
  await loadWasm(file, dotenvEnabled);
};

// Reload when settings change
useEffect(() => {
  if (wasmFile) {
    reloadWasm(dotenvEnabled);
  }
}, [dotenvEnabled]);
```

**Implementation Details:**
- `loadWasm`: Reads file as ArrayBuffer, uploads to server, stores path and buffer
- `reloadWasm`: Re-uploads the stored File object (useful when .env changes)
- Error handling: Catches exceptions and sets error state
- Loading state: Automatically managed during async operations

### 3. Results Slice

**Purpose:** Manages hook execution results and final HTTP response.

**State:**
```typescript
interface ResultsState {
  hookResults: Record<string, HookResult>;  // Results keyed by hook name
  finalResponse: FinalResponse | null;       // Final HTTP response
  isExecuting: boolean;                      // Execution in progress
}

interface HookResult {
  logs: LogEntry[];
  returnValue?: number;
  error?: string;
  input?: {
    request: { headers: Record<string, string>; body: string };
    response: { headers: Record<string, string>; body: string };
  };
  output?: {
    request: { headers: Record<string, string>; body: string };
    response: { headers: Record<string, string>; body: string };
  };
  properties?: Record<string, unknown>;
}
```

**Available Actions:**
```typescript
setHookResult(hook: string, result: HookResult): void
setHookResults(results: Record<string, HookResult>): void
setFinalResponse(response: FinalResponse | null): void
setIsExecuting(executing: boolean): void
clearResults(): void
```

**Persistence:** NO (runtime data from test execution)

**markDirty() Calls:** None (runtime state)

**Example Usage:**
```typescript
const { hookResults, finalResponse, setHookResults, clearResults } = useAppStore();

// Update results from API response
const { hookResults: newResults, finalResponse: response } = await sendFullFlow(...);
setHookResults(newResults);
setFinalResponse(response);

// Clear before new execution
clearResults();
```

### 4. Config Slice

**Purpose:** Manages application configuration, server properties, and settings.

**State:**
```typescript
interface ConfigState {
  properties: Record<string, string>;  // Server properties (key-value pairs)
  dotenvEnabled: boolean;              // Enable .env file loading
  logLevel: number;                    // Log filtering level (0-5)
  autoSave: boolean;                   // Auto-save enabled
  lastSaved: number | null;            // Timestamp of last save
  isDirty: boolean;                    // Has unsaved changes
}
```

**Available Actions:**
```typescript
setProperties(properties: Record<string, string>): void
updateProperty(key: string, value: string): void
removeProperty(key: string): void
mergeProperties(properties: Record<string, string>): void  // Merge without replacing
setDotenvEnabled(enabled: boolean): void
setLogLevel(level: number): void
setAutoSave(enabled: boolean): void
markDirty(): void                                          // Mark as dirty
markClean(): void                                          // Mark as clean + update lastSaved
loadFromConfig(config: TestConfig): void                   // Load from fastedge-config.test.json
exportConfig(): TestConfig                                 // Export to fastedge-config.test.json format
resetConfig(): void                                        // Reset to defaults
```

**Persistence:** PARTIAL (properties, dotenvEnabled, logLevel, autoSave are persisted; isDirty and lastSaved are ephemeral)

**markDirty() Calls:** All mutating actions except `markClean()` call `markDirty()`

**Example Usage:**
```typescript
const { properties, dotenvEnabled, logLevel, mergeProperties, setLogLevel } = useAppStore();

// Merge calculated properties from server
mergeProperties({ 'request.id': '12345', 'request.timestamp': Date.now().toString() });

// Update log level
setLogLevel(4);

// Load from fastedge-config.test.json
const config = await loadConfigAPI();
loadFromConfig(config);

// Export to fastedge-config.test.json
const config = exportConfig();
await saveConfigAPI(config);
```

**Special Actions:**
- `mergeProperties`: Adds/updates properties without replacing entire object (useful for WebSocket updates)
- `loadFromConfig`: Bulk load from fastedge-config.test.json, marks as clean
- `exportConfig`: Exports entire store state to TestConfig format

### 5. UI Slice

**Purpose:** Manages UI-specific ephemeral and persisted state.

**State:**
```typescript
interface UIState {
  activeHookTab: string;                    // Currently selected hook tab
  activeSubView: 'logs' | 'inputs' | 'outputs';  // Active sub-view
  expandedPanels: Record<string, boolean>;  // Panel expansion state
  wsStatus: WebSocketStatus;                // WebSocket connection status
}

interface WebSocketStatus {
  connected: boolean;
  reconnecting: boolean;
  clientCount: number;
  error: string | null;
}
```

**Available Actions:**
```typescript
setActiveHookTab(tab: string): void
setActiveSubView(view: 'logs' | 'inputs' | 'outputs'): void
togglePanel(panel: string): void
setWsStatus(status: WebSocketStatus): void
```

**Persistence:** PARTIAL (only `expandedPanels` is persisted)

**markDirty() Calls:** Only `togglePanel()` calls `markDirty()` (since it's persisted)

**Example Usage:**
```typescript
const { activeHookTab, expandedPanels, setActiveHookTab, togglePanel } = useAppStore();

// Switch active tab
setActiveHookTab('onRequestBody');

// Toggle panel expansion
togglePanel('request-panel');

// Update WebSocket status
useEffect(() => {
  setWsStatus(websocketStatus);
}, [websocketStatus]);
```

**Why Partial Persistence?**
- `expandedPanels`: User preference that should persist across sessions
- `activeHookTab`, `activeSubView`: Reset to defaults on page load for consistency
- `wsStatus`: Runtime connection state, always starts disconnected

---

## Using Stores in Components

### Basic Usage

The simplest way to use the store is to destructure what you need:

```typescript
import { useAppStore } from '@/stores';

function RequestBar() {
  const { method, url, setMethod, setUrl } = useAppStore();

  return (
    <div>
      <select value={method} onChange={(e) => setMethod(e.target.value)}>
        <option value="GET">GET</option>
        <option value="POST">POST</option>
      </select>
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Enter URL"
      />
    </div>
  );
}
```

### Selective Subscriptions for Performance

**Problem:** Destructuring the entire store causes re-renders on ANY state change.

```typescript
// ❌ BAD: Re-renders on every store change
function MyComponent() {
  const store = useAppStore();
  return <div>{store.url}</div>;
}
```

**Solution:** Use selector functions to subscribe only to specific state:

```typescript
// ✅ GOOD: Re-renders only when url changes
function MyComponent() {
  const url = useAppStore((state) => state.url);
  return <div>{url}</div>;
}
```

**Best Practice:** For multiple values, use multiple selectors:

```typescript
function RequestBar() {
  // Each selector creates an independent subscription
  const method = useAppStore((state) => state.method);
  const url = useAppStore((state) => state.url);
  const setMethod = useAppStore((state) => state.setMethod);
  const setUrl = useAppStore((state) => state.setUrl);

  // Component only re-renders when method or url changes
  return (
    <div>
      <select value={method} onChange={(e) => setMethod(e.target.value)}>...</select>
      <input value={url} onChange={(e) => setUrl(e.target.value)} />
    </div>
  );
}
```

### Accessing Multiple Slices

You can access state and actions from different slices in the same component:

```typescript
function HookStagesPanel() {
  // From Results slice
  const hookResults = useAppStore((state) => state.hookResults);
  const clearResults = useAppStore((state) => state.clearResults);

  // From Config slice
  const logLevel = useAppStore((state) => state.logLevel);
  const properties = useAppStore((state) => state.properties);
  const setLogLevel = useAppStore((state) => state.setLogLevel);

  // From UI slice
  const activeHookTab = useAppStore((state) => state.activeHookTab);
  const setActiveHookTab = useAppStore((state) => state.setActiveHookTab);

  return (
    <div>
      <LogLevelSelector value={logLevel} onChange={setLogLevel} />
      <HookTabs active={activeHookTab} onSelect={setActiveHookTab} />
      <HookResultsDisplay results={hookResults} properties={properties} />
    </div>
  );
}
```

### Using Actions (Sync and Async)

**Synchronous Actions:**
```typescript
function PropertiesPanel() {
  const properties = useAppStore((state) => state.properties);
  const updateProperty = useAppStore((state) => state.updateProperty);
  const removeProperty = useAppStore((state) => state.removeProperty);

  return (
    <div>
      {Object.entries(properties).map(([key, value]) => (
        <div key={key}>
          <input
            value={value}
            onChange={(e) => updateProperty(key, e.target.value)}
          />
          <button onClick={() => removeProperty(key)}>Remove</button>
        </div>
      ))}
    </div>
  );
}
```

**Asynchronous Actions:**
```typescript
function WasmLoader() {
  const { loading, error, loadWasm } = useAppStore();

  const handleFileUpload = async (file: File) => {
    try {
      await loadWasm(file, true);  // Async action returns Promise
      alert('WASM loaded successfully!');
    } catch (err) {
      // Error is already stored in state, but you can handle it here too
      console.error('Failed to load WASM:', err);
    }
  };

  return (
    <div>
      <input
        type="file"
        accept=".wasm"
        onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
      />
      {loading && <Spinner />}
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </div>
  );
}
```

### Accessing Store Outside Components

Sometimes you need to access the store outside React components (e.g., in API utilities):

```typescript
import { useAppStore } from '@/stores';

// Get store state directly (non-reactive)
const currentState = useAppStore.getState();
console.log(currentState.method, currentState.url);

// Call actions directly
useAppStore.getState().setMethod('POST');
useAppStore.getState().clearResults();

// Subscribe to changes (for non-React code)
const unsubscribe = useAppStore.subscribe(
  (state) => state.url,
  (url) => console.log('URL changed:', url)
);
// Call unsubscribe() when done
```

### Custom Selector Hooks (Optional)

For commonly used selectors, you can create custom hooks:

```typescript
// stores/selectors.ts
export const useMethod = () => useAppStore((state) => state.method);
export const useUrl = () => useAppStore((state) => state.url);
export const useWasmLoaded = () => useAppStore((state) => state.wasmPath !== null);
export const useHookResults = () => useAppStore((state) => state.hookResults);

// Usage in components
function RequestBar() {
  const method = useMethod();
  const url = useUrl();
  const wasmLoaded = useWasmLoaded();
  // ...
}
```

---

## Auto-Save System

### How It Works

The auto-save system automatically persists user configuration to localStorage with a 500ms debounce delay.

**Flow:**
```
User edits request body → setRequestBody() → markDirty() →
  State updates → Persist middleware triggers →
    Debounce waits 500ms → More edits? → Reset debounce timer →
      User stops typing → 500ms elapses → Write to localStorage → markClean()
```

### Debouncing Explanation

**Without Debouncing:**
- User types "Hello World" (11 characters)
- 11 localStorage writes occur
- Performance impact, battery drain

**With 500ms Debouncing:**
- User types "Hello World"
- Timer starts on first keystroke
- Each keystroke resets the timer
- 500ms after user stops typing → 1 write
- 91% fewer writes

### What Triggers Auto-Save

Only actions that call `markDirty()` trigger auto-save:

**Request Slice:** All mutating actions
```typescript
setMethod()         // ✓ Triggers auto-save
setUrl()            // ✓ Triggers auto-save
updateRequestHeader()  // ✓ Triggers auto-save
// ... all mutating actions
```

**Config Slice:** All mutating actions except `setAutoSave()`
```typescript
setProperties()     // ✓ Triggers auto-save
updateProperty()    // ✓ Triggers auto-save
setLogLevel()       // ✓ Triggers auto-save
setAutoSave()       // ✗ Does NOT trigger auto-save (meta-setting)
```

**UI Slice:** Only `togglePanel()`
```typescript
togglePanel()       // ✓ Triggers auto-save (persisted preference)
setActiveHookTab()  // ✗ Does NOT trigger (ephemeral)
setActiveSubView()  // ✗ Does NOT trigger (ephemeral)
```

**WASM Slice:** None
```typescript
loadWasm()          // ✗ Ephemeral state
reloadWasm()        // ✗ Ephemeral state
// ... all actions are ephemeral
```

**Results Slice:** None
```typescript
setHookResults()    // ✗ Runtime data
setFinalResponse()  // ✗ Runtime data
// ... all actions are runtime data
```

### Dirty Tracking

**isDirty:** Boolean flag indicating unsaved changes
**lastSaved:** Timestamp of last successful save

```typescript
function SaveIndicator() {
  const isDirty = useAppStore((state) => state.isDirty);
  const lastSaved = useAppStore((state) => state.lastSaved);

  if (isDirty) {
    return <span>⚠️ Saving...</span>;
  }

  if (lastSaved) {
    const timeAgo = formatDistanceToNow(lastSaved);
    return <span>✓ Saved {timeAgo}</span>;
  }

  return null;
}
```

### Manual Save/Load vs Auto-Save

**Auto-Save (localStorage):**
- Automatic, transparent to user
- 500ms debounce
- Limited to ~5MB
- Persists across browser sessions
- Key: `proxy-runner-config`

**Manual Save/Load (fastedge-config.test.json):**
- User-initiated via buttons
- Immediate write
- No size limit
- Shareable with team
- Version controlled

```typescript
// Manual save to fastedge-config.test.json
const handleSaveConfig = async () => {
  const config = useAppStore.getState().exportConfig();
  await saveConfigAPI(config);  // POST /api/config
  alert('✅ Saved to fastedge-config.test.json');
};

// Manual load from fastedge-config.test.json
const handleLoadConfig = async () => {
  const config = await loadConfigAPI();  // GET /api/config
  useAppStore.getState().loadFromConfig(config);
  alert('✅ Loaded from fastedge-config.test.json');
};
```

**When to Use Each:**
- **Auto-save:** For most user interactions (editing requests, settings)
- **Manual save:** When you want to share config with team or CI/CD
- **Manual load:** When loading a specific test scenario

---

## Persistence Configuration

### Storage Key

All persisted state is stored under a single localStorage key:
```typescript
Key: 'proxy-runner-config'
```

### What Gets Persisted

The `partialize` function in `stores/index.ts` defines what gets saved:

```typescript
partialize: (state): PersistConfig => ({
  // Request configuration
  request: {
    method: state.method,
    url: state.url,
    requestHeaders: state.requestHeaders,
    requestBody: state.requestBody,
    responseHeaders: state.responseHeaders,
    responseBody: state.responseBody,
  },

  // Application configuration (excluding meta-state)
  config: {
    properties: state.properties,
    dotenvEnabled: state.dotenvEnabled,
    logLevel: state.logLevel,
    autoSave: state.autoSave,
    // Excluded: isDirty, lastSaved
  },

  // UI preferences (only expandedPanels)
  ui: {
    expandedPanels: state.expandedPanels,
  },
})
```

### What Gets Excluded

**Ephemeral State (Runtime):**
```typescript
// WASM Slice (must reload file on page refresh)
wasmPath: null
wasmBuffer: null
wasmFile: null
loading: false
error: null

// Results Slice (cleared on page refresh)
hookResults: {}
finalResponse: null
isExecuting: false

// Config Slice (meta-state)
isDirty: false      // Recalculated on load
lastSaved: null     // Recalculated on load

// UI Slice (ephemeral UI state)
activeHookTab: 'request_headers'  // Reset to default
activeSubView: 'logs'              // Reset to default
wsStatus: { ... }                  // Reconnect on load
```

### The partialize Function

**Purpose:** Define which state should be persisted and which should be ephemeral.

**Location:** `frontend/src/stores/index.ts`

**Implementation:**
```typescript
import { persist, createJSONStorage } from 'zustand/middleware';
import { debounce } from 'zustand-debounce';

const debouncedStorage = debounce(persist.createJSONStorage(() => localStorage), {
  interval: 500,  // 500ms debounce
});

export const useAppStore = create<AppStore>()(
  devtools(
    immer(
      persist(
        (...args) => ({
          ...createRequestSlice(...args),
          ...createWasmSlice(...args),
          ...createResultsSlice(...args),
          ...createConfigSlice(...args),
          ...createUISlice(...args),
        }),
        {
          name: 'proxy-runner-config',
          storage: debouncedStorage,
          partialize: (state): PersistConfig => ({
            // Only persist user-configurable state
            // (see above for implementation)
          }),
          version: 1,  // For future migrations
        }
      )
    ),
    {
      name: 'ProxyRunnerStore',
      enabled: import.meta.env.DEV,  // DevTools only in development
    }
  )
);
```

### Version and Migrations

**Current Version:** 1

**Future Migrations:**
When you need to change the persisted state structure, increment the version:

```typescript
{
  version: 2,
  migrate: (persistedState: any, version: number) => {
    if (version === 1) {
      // Migrate from v1 to v2
      return {
        ...persistedState,
        config: {
          ...persistedState.config,
          newField: 'defaultValue',
        },
      };
    }
    return persistedState;
  },
}
```

### Clearing Persisted State

**Manually (in browser console):**
```javascript
localStorage.removeItem('proxy-runner-config');
location.reload();
```

**Programmatically:**
```typescript
useAppStore.persist.clearStorage();
```

**On Reset:**
```typescript
const resetEverything = () => {
  useAppStore.getState().resetRequest();
  useAppStore.getState().resetConfig();
  useAppStore.persist.clearStorage();
};
```

---

## Testing Stores

### Testing Store Actions

**Setup:**
```typescript
import { renderHook, act } from '@testing-library/react';
import { useAppStore } from '@/stores';

describe('RequestSlice', () => {
  beforeEach(() => {
    // Reset store before each test
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.resetRequest();
    });
  });

  it('should update method', () => {
    const { result } = renderHook(() => useAppStore());

    act(() => {
      result.current.setMethod('GET');
    });

    expect(result.current.method).toBe('GET');
  });

  it('should update URL', () => {
    const { result } = renderHook(() => useAppStore());

    act(() => {
      result.current.setUrl('https://example.com');
    });

    expect(result.current.url).toBe('https://example.com');
  });

  it('should add request header', () => {
    const { result } = renderHook(() => useAppStore());

    act(() => {
      result.current.updateRequestHeader('Authorization', 'Bearer token');
    });

    expect(result.current.requestHeaders['Authorization']).toBe('Bearer token');
  });

  it('should remove request header', () => {
    const { result } = renderHook(() => useAppStore());

    act(() => {
      result.current.updateRequestHeader('Authorization', 'Bearer token');
      result.current.removeRequestHeader('Authorization');
    });

    expect(result.current.requestHeaders['Authorization']).toBeUndefined();
  });
});
```

### Testing Async Actions

```typescript
describe('WasmSlice', () => {
  it('should load WASM file', async () => {
    const { result } = renderHook(() => useAppStore());
    const mockFile = new File(['mock content'], 'test.wasm', { type: 'application/wasm' });

    await act(async () => {
      await result.current.loadWasm(mockFile, true);
    });

    expect(result.current.wasmPath).toBeTruthy();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should handle load errors', async () => {
    const { result } = renderHook(() => useAppStore());
    const mockFile = new File(['invalid'], 'bad.wasm', { type: 'application/wasm' });

    // Mock API to throw error
    vi.mock('@/api', () => ({
      uploadWasm: vi.fn().mockRejectedValue(new Error('Upload failed')),
    }));

    await act(async () => {
      await result.current.loadWasm(mockFile, true);
    });

    expect(result.current.error).toBe('Upload failed');
    expect(result.current.loading).toBe(false);
  });
});
```

### Mocking Store State in Component Tests

```typescript
import { render, screen } from '@testing-library/react';
import { useAppStore } from '@/stores';
import { RequestBar } from './RequestBar';

// Mock the store
vi.mock('@/stores', () => ({
  useAppStore: vi.fn(),
}));

describe('RequestBar', () => {
  it('should render with store values', () => {
    // Mock store return value
    (useAppStore as jest.Mock).mockReturnValue({
      method: 'POST',
      url: 'https://example.com',
      wasmPath: '/path/to/wasm',
      setMethod: vi.fn(),
      setUrl: vi.fn(),
    });

    render(<RequestBar />);

    expect(screen.getByDisplayValue('POST')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://example.com')).toBeInTheDocument();
  });

  it('should call actions when interacted with', async () => {
    const mockSetMethod = vi.fn();
    const mockSetUrl = vi.fn();

    (useAppStore as jest.Mock).mockReturnValue({
      method: 'GET',
      url: '',
      wasmPath: '/path/to/wasm',
      setMethod: mockSetMethod,
      setUrl: mockSetUrl,
    });

    const { user } = render(<RequestBar />);

    await user.selectOptions(screen.getByRole('combobox'), 'POST');
    expect(mockSetMethod).toHaveBeenCalledWith('POST');

    await user.type(screen.getByPlaceholderText('Enter URL'), 'https://test.com');
    expect(mockSetUrl).toHaveBeenCalledWith('https://test.com');
  });
});
```

### Testing Persistence

```typescript
describe('Store Persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should persist request state', () => {
    const { result } = renderHook(() => useAppStore());

    act(() => {
      result.current.setMethod('PUT');
      result.current.setUrl('https://persisted.com');
    });

    // Wait for debounce
    await new Promise((resolve) => setTimeout(resolve, 600));

    // Check localStorage
    const stored = JSON.parse(localStorage.getItem('proxy-runner-config')!);
    expect(stored.state.request.method).toBe('PUT');
    expect(stored.state.request.url).toBe('https://persisted.com');
  });

  it('should NOT persist runtime state', () => {
    const { result } = renderHook(() => useAppStore());

    act(() => {
      result.current.setHookResults({ onRequestHeaders: { logs: [], returnValue: 0 } });
    });

    await new Promise((resolve) => setTimeout(resolve, 600));

    const stored = JSON.parse(localStorage.getItem('proxy-runner-config')!);
    expect(stored.state.hookResults).toBeUndefined();
  });

  it('should restore persisted state on mount', () => {
    // Set initial state
    localStorage.setItem('proxy-runner-config', JSON.stringify({
      state: {
        request: { method: 'DELETE', url: 'https://restored.com' },
        config: { properties: { key: 'value' }, logLevel: 4 },
      },
      version: 1,
    }));

    const { result } = renderHook(() => useAppStore());

    expect(result.current.method).toBe('DELETE');
    expect(result.current.url).toBe('https://restored.com');
    expect(result.current.properties).toEqual({ key: 'value' });
    expect(result.current.logLevel).toBe(4);
  });
});
```

### Common Test Patterns

**1. Reset Store Between Tests:**
```typescript
beforeEach(() => {
  const { result } = renderHook(() => useAppStore());
  act(() => {
    result.current.resetRequest();
    result.current.resetConfig();
    result.current.clearResults();
  });
});
```

**2. Test Dirty Tracking:**
```typescript
it('should mark state as dirty after changes', () => {
  const { result } = renderHook(() => useAppStore());

  expect(result.current.isDirty).toBe(false);

  act(() => {
    result.current.setMethod('POST');
  });

  expect(result.current.isDirty).toBe(true);
});
```

**3. Test Cross-Slice Communication:**
```typescript
it('should clear results when reloading WASM', async () => {
  const { result } = renderHook(() => useAppStore());

  // Set initial results
  act(() => {
    result.current.setHookResults({ onRequestHeaders: { logs: [] } });
  });

  expect(Object.keys(result.current.hookResults).length).toBeGreaterThan(0);

  // Reload WASM (should clear results)
  await act(async () => {
    await result.current.reloadWasm(true);
  });

  expect(Object.keys(result.current.hookResults).length).toBe(0);
});
```

---

## Adding New State

### Step-by-Step Guide

**1. Identify the Appropriate Slice**

Ask yourself:
- Is this request/response configuration? → **Request Slice**
- Is this WASM-related? → **WASM Slice**
- Is this execution runtime data? → **Results Slice**
- Is this app configuration/settings? → **Config Slice**
- Is this UI-specific state? → **UI Slice**
- Doesn't fit existing slices? → **Create New Slice**

**2. Update types.ts**

Add your new state to the appropriate slice interface:

```typescript
// Example: Adding responseTimeout to Config Slice
export interface ConfigState {
  properties: Record<string, string>;
  dotenvEnabled: boolean;
  logLevel: number;
  autoSave: boolean;
  lastSaved: number | null;
  isDirty: boolean;
  responseTimeout: number;  // ← New field
}

export interface ConfigActions {
  // ... existing actions
  setResponseTimeout: (timeout: number) => void;  // ← New action
}
```

**3. Update Slice Implementation**

Add the new state and actions to the slice creator:

```typescript
// frontend/src/stores/slices/configSlice.ts
const DEFAULT_CONFIG_STATE: ConfigState = {
  // ... existing defaults
  responseTimeout: 5000,  // ← New default
};

export const createConfigSlice: StateCreator<...> = (set, get) => ({
  ...DEFAULT_CONFIG_STATE,

  // ... existing actions

  setResponseTimeout: (timeout) =>
    set((state) => {
      state.responseTimeout = timeout;
      state.markDirty();  // ← If persisted
    }),
});
```

**4. Decide if Persisted**

If the new state should be saved to localStorage, update the `partialize` function:

```typescript
// frontend/src/stores/index.ts
partialize: (state): PersistConfig => ({
  // ...
  config: {
    properties: state.properties,
    dotenvEnabled: state.dotenvEnabled,
    logLevel: state.logLevel,
    autoSave: state.autoSave,
    responseTimeout: state.responseTimeout,  // ← Add to persisted config
  },
  // ...
})
```

And update the `PersistConfig` type:

```typescript
// frontend/src/stores/types.ts
export interface PersistConfig {
  request: RequestState;
  config: Omit<ConfigState, 'isDirty' | 'lastSaved' | 'autoSave'> & {
    responseTimeout: number;  // ← Add explicit field
  };
  ui: Pick<UIState, 'expandedPanels'>;
}
```

**5. Add Tests**

Write tests for your new state and actions:

```typescript
// __tests__/configSlice.test.ts
describe('ConfigSlice - responseTimeout', () => {
  it('should set response timeout', () => {
    const { result } = renderHook(() => useAppStore());

    act(() => {
      result.current.setResponseTimeout(10000);
    });

    expect(result.current.responseTimeout).toBe(10000);
  });

  it('should persist response timeout', async () => {
    const { result } = renderHook(() => useAppStore());

    act(() => {
      result.current.setResponseTimeout(15000);
    });

    await new Promise((resolve) => setTimeout(resolve, 600));

    const stored = JSON.parse(localStorage.getItem('proxy-runner-config')!);
    expect(stored.state.config.responseTimeout).toBe(15000);
  });
});
```

**6. Use in Components**

Access your new state in components:

```typescript
function TimeoutSettings() {
  const timeout = useAppStore((state) => state.responseTimeout);
  const setResponseTimeout = useAppStore((state) => state.setResponseTimeout);

  return (
    <div>
      <label>Response Timeout (ms):</label>
      <input
        type="number"
        value={timeout}
        onChange={(e) => setResponseTimeout(Number(e.target.value))}
      />
    </div>
  );
}
```

### Creating a New Slice

If your state doesn't fit existing slices, create a new one:

**1. Create slice file:**
```typescript
// frontend/src/stores/slices/notificationSlice.ts
import { StateCreator } from 'zustand';
import { AppStore, NotificationSlice, NotificationState } from '../types';

const DEFAULT_NOTIFICATION_STATE: NotificationState = {
  messages: [],
  unreadCount: 0,
};

export const createNotificationSlice: StateCreator<
  AppStore,
  [['zustand/immer', never]],
  [],
  NotificationSlice
> = (set) => ({
  ...DEFAULT_NOTIFICATION_STATE,

  addNotification: (message) =>
    set((state) => {
      state.messages.push(message);
      state.unreadCount += 1;
    }),

  clearNotifications: () =>
    set((state) => {
      state.messages = [];
      state.unreadCount = 0;
    }),
});
```

**2. Add types:**
```typescript
// frontend/src/stores/types.ts
export interface NotificationState {
  messages: string[];
  unreadCount: number;
}

export interface NotificationActions {
  addNotification: (message: string) => void;
  clearNotifications: () => void;
}

export type NotificationSlice = NotificationState & NotificationActions;

// Update AppStore type
export type AppStore = RequestSlice &
                       WasmSlice &
                       ResultsSlice &
                       ConfigSlice &
                       UISlice &
                       NotificationSlice;  // ← Add here
```

**3. Add to store composition:**
```typescript
// frontend/src/stores/index.ts
import { createNotificationSlice } from './slices/notificationSlice';

export const useAppStore = create<AppStore>()(
  devtools(
    immer(
      persist(
        (...args) => ({
          ...createRequestSlice(...args),
          ...createWasmSlice(...args),
          ...createResultsSlice(...args),
          ...createConfigSlice(...args),
          ...createUISlice(...args),
          ...createNotificationSlice(...args),  // ← Add here
        }),
        {
          // ... persist config
        }
      )
    )
  )
);
```

---

## Migration Notes

### Before: useState Approach

Prior to Zustand, the application used 14 separate `useState` hooks in `App.tsx`:

```typescript
// Old App.tsx (simplified)
function App() {
  const [method, setMethod] = useState('POST');
  const [url, setUrl] = useState('');
  const [requestHeaders, setRequestHeaders] = useState({});
  const [requestBody, setRequestBody] = useState('');
  const [responseHeaders, setResponseHeaders] = useState({});
  const [responseBody, setResponseBody] = useState('');
  const [wasmState, setWasmState] = useState({ path: null, buffer: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState({});
  const [finalResponse, setFinalResponse] = useState(null);
  const [properties, setProperties] = useState({});
  const [dotenvEnabled, setDotenvEnabled] = useState(true);
  const [logLevel, setLogLevel] = useState(3);

  // Prop drilling to child components
  return (
    <>
      <RequestBar
        method={method}
        url={url}
        onMethodChange={setMethod}
        onUrlChange={setUrl}
      />
      <ServerPropertiesPanel
        properties={properties}
        onPropertiesChange={setProperties}
        dotenvEnabled={dotenvEnabled}
        onDotenvToggle={setDotenvEnabled}
      />
      {/* More prop drilling... */}
    </>
  );
}
```

**Problems:**
- 14 state declarations cluttered the component
- Prop drilling through component hierarchy
- No auto-save functionality
- Difficult to test components in isolation
- No type safety for state updates
- Manual state synchronization with WebSocket
- No persistence between sessions

### After: Zustand Approach

```typescript
// New App.tsx (simplified)
function App() {
  // Single hook, selective subscriptions
  const {
    method, url, requestHeaders, requestBody,
    setMethod, setUrl, setRequestHeaders, setRequestBody,
    wasmPath, loadWasm, reloadWasm,
    hookResults, setHookResults,
    properties, mergeProperties,
    dotenvEnabled, setDotenvEnabled,
    logLevel, setLogLevel,
    wsStatus, setWsStatus,
  } = useAppStore();

  // No more prop drilling - components access store directly
  return (
    <>
      <RequestBar />
      <ServerPropertiesPanel />
      {/* Components use useAppStore() internally */}
    </>
  );
}
```

**Benefits:**
- Single source of truth for all state
- No prop drilling - components access store directly
- Automatic persistence to localStorage (500ms debounce)
- Type-safe state and actions
- Easy to test in isolation
- WebSocket integration is cleaner
- Performance improvements (selective re-renders)

### Component Changes

**Before (props-based):**
```typescript
interface RequestBarProps {
  method: string;
  url: string;
  wasmLoaded: boolean;
  onMethodChange: (method: string) => void;
  onUrlChange: (url: string) => void;
  onSend: () => void;
}

function RequestBar({ method, url, wasmLoaded, onMethodChange, onUrlChange, onSend }: RequestBarProps) {
  return (
    <div>
      <select value={method} onChange={(e) => onMethodChange(e.target.value)}>...</select>
      <input value={url} onChange={(e) => onUrlChange(e.target.value)} />
      <button onClick={onSend} disabled={!wasmLoaded}>Send</button>
    </div>
  );
}
```

**After (store-based):**
```typescript
function RequestBar() {
  // No props needed!
  const method = useAppStore((state) => state.method);
  const url = useAppStore((state) => state.url);
  const wasmLoaded = useAppStore((state) => state.wasmPath !== null);
  const setMethod = useAppStore((state) => state.setMethod);
  const setUrl = useAppStore((state) => state.setUrl);

  const handleSend = async () => {
    // Call API directly using store state
    const response = await sendFullFlow(url, method, ...);
    useAppStore.getState().setHookResults(response.hookResults);
  };

  return (
    <div>
      <select value={method} onChange={(e) => setMethod(e.target.value)}>...</select>
      <input value={url} onChange={(e) => setUrl(e.target.value)} />
      <button onClick={handleSend} disabled={!wasmLoaded}>Send</button>
    </div>
  );
}
```

### Migration Checklist

When migrating a component from props to Zustand:

- [ ] Remove prop interface definition
- [ ] Remove props from component signature
- [ ] Replace prop usage with `useAppStore()` selectors
- [ ] Update parent component to remove prop passing
- [ ] Update component tests to mock `useAppStore`
- [ ] Verify functionality works the same
- [ ] Check DevTools to ensure selective re-renders

### No Breaking Changes for Users

The Zustand migration is internal - the UI and user workflows remain identical:
- Same buttons, inputs, and panels
- Same behavior and validation
- Same keyboard shortcuts
- Same WebSocket updates
- Same manual save/load functionality
- **Added:** Automatic persistence to localStorage

---

## Best Practices

### 1. Use Selectors for Performance

**Always use selector functions** to prevent unnecessary re-renders:

```typescript
// ❌ BAD: Re-renders on ANY store change
const { method, url, properties, hookResults } = useAppStore();

// ✅ GOOD: Re-renders only when specific values change
const method = useAppStore((state) => state.method);
const url = useAppStore((state) => state.url);
const properties = useAppStore((state) => state.properties);
const hookResults = useAppStore((state) => state.hookResults);
```

### 2. Group Related State Updates

**Minimize re-renders** by batching updates:

```typescript
// ❌ BAD: 3 separate updates = 3 re-renders
setMethod('POST');
setUrl('https://example.com');
setRequestBody('{}');

// ✅ GOOD: 1 batched update = 1 re-render
set((state) => {
  state.method = 'POST';
  state.url = 'https://example.com';
  state.requestBody = '{}';
  state.markDirty();
});
```

### 3. Keep Slices Focused

Each slice should have a **single responsibility**:

```typescript
// ✅ GOOD: Focused slice
RequestSlice: Request/response configuration
WasmSlice: WASM binary management
ResultsSlice: Hook execution results

// ❌ BAD: Mixing concerns
AppSlice: Everything together (request, WASM, results, config, UI)
```

### 4. Use Immer for Nested Updates

Zustand uses Immer middleware, allowing **mutable-style updates**:

```typescript
// Without Immer (manual immutability)
updateRequestHeader: (key, value) =>
  set((state) => ({
    requestHeaders: {
      ...state.requestHeaders,
      [key]: value,
    },
  })),

// With Immer (cleaner, less error-prone)
updateRequestHeader: (key, value) =>
  set((state) => {
    state.requestHeaders[key] = value;
    state.markDirty();
  }),
```

### 5. Add Action Names for DevTools

**Improve debugging** with descriptive action names:

```typescript
set((state) => {
  state.method = method;
}, false, 'request/setMethod');  // Shows in Redux DevTools timeline
```

### 6. Avoid Storing Derived State

**Don't store computed values** - calculate on-the-fly:

```typescript
// ❌ BAD: Storing derived state
interface RequestState {
  url: string;
  hostname: string;  // Derived from url
}

// ✅ GOOD: Compute in selector
const hostname = useAppStore((state) => {
  try {
    return new URL(state.url).hostname;
  } catch {
    return '';
  }
});
```

### 7. Use TypeScript Strictly

**Leverage TypeScript** for type safety:

```typescript
// ✅ GOOD: Strict types
setMethod: (method: string) => void

// ❌ BAD: Any types
setMethod: (method: any) => void
```

### 8. Test Actions, Not Implementation

**Test behavior, not internals**:

```typescript
// ✅ GOOD: Test behavior
it('should update URL', () => {
  const { result } = renderHook(() => useAppStore());
  act(() => result.current.setUrl('https://example.com'));
  expect(result.current.url).toBe('https://example.com');
});

// ❌ BAD: Testing implementation details
it('should call markDirty when setting URL', () => {
  const markDirtySpy = vi.spyOn(useAppStore.getState(), 'markDirty');
  useAppStore.getState().setUrl('https://example.com');
  expect(markDirtySpy).toHaveBeenCalled();
});
```

### 9. Use Get for Cross-Slice Communication

When one slice needs to access another:

```typescript
reloadWasm: async (dotenvEnabled) => {
  const { clearResults } = get();  // Access other slice actions

  set({ loading: true });
  clearResults();  // Clear results before reload

  // ... reload logic
},
```

### 10. Document Complex Actions

**Add JSDoc comments** for complex logic:

```typescript
/**
 * Merges calculated properties from server without replacing existing properties.
 * Used when WebSocket updates send partial property changes.
 *
 * @param properties - Partial properties to merge
 * @example
 * mergeProperties({ 'request.id': '123', 'request.timestamp': '1234567890' })
 */
mergeProperties: (properties) =>
  set((state) => {
    Object.assign(state.properties, properties);
    state.markDirty();
  }),
```

---

## Troubleshooting

### Store Not Persisting

**Problem:** Changes aren't saving to localStorage.

**Possible Causes:**

1. **Not calling markDirty():**
   ```typescript
   // ❌ Missing markDirty()
   setUrl: (url) =>
     set((state) => {
       state.url = url;
       // Missing: state.markDirty();
     }),
   ```

2. **State not in partialize:**
   ```typescript
   // Check stores/index.ts - is your state in partialize?
   partialize: (state) => ({
     request: { ... },
     config: { ... },
     ui: { ... },
     // Is your slice here?
   })
   ```

3. **localStorage disabled/full:**
   ```javascript
   // Check browser console
   localStorage.setItem('test', 'test');  // Throws if disabled/full
   ```

4. **Debounce not elapsed:**
   ```typescript
   // Wait 500ms after last change
   await new Promise((resolve) => setTimeout(resolve, 600));
   ```

**Solution:** Verify `markDirty()` is called, state is in `partialize`, and localStorage is available.

### Infinite Re-render Loops

**Problem:** Component re-renders continuously.

**Cause:** Creating new object/array references in selector:

```typescript
// ❌ BAD: Creates new array on every render
const headers = useAppStore((state) => Object.entries(state.requestHeaders));

// Component re-renders infinitely because `headers` reference changes
useEffect(() => {
  console.log('Headers changed:', headers);
}, [headers]);
```

**Solution:** Use stable references or memoization:

```typescript
// ✅ GOOD: Select raw object (stable reference)
const requestHeaders = useAppStore((state) => state.requestHeaders);
const headers = Object.entries(requestHeaders);  // Compute in component

// Or use useMemo
const headers = useMemo(
  () => Object.entries(requestHeaders),
  [requestHeaders]
);
```

### Stale Closure Issues

**Problem:** Action uses old state value.

**Cause:** Closure captures old `state` reference:

```typescript
const handleClick = () => {
  const url = useAppStore.getState().url;  // Captures current url

  setTimeout(() => {
    // url is stale if it changed during timeout
    console.log('Old URL:', url);
  }, 5000);
};
```

**Solution:** Always read fresh state:

```typescript
const handleClick = () => {
  setTimeout(() => {
    const url = useAppStore.getState().url;  // Fresh read
    console.log('Current URL:', url);
  }, 5000);
};
```

### Component Not Re-rendering

**Problem:** State changes but component doesn't update.

**Cause:** Not subscribing to state:

```typescript
// ❌ BAD: One-time read, no subscription
const method = useAppStore.getState().method;

// Component doesn't re-render when method changes
```

**Solution:** Use selector (creates subscription):

```typescript
// ✅ GOOD: Subscribes to changes
const method = useAppStore((state) => state.method);
```

### Tests Failing with Mock Store

**Problem:** Mock store doesn't work correctly.

**Cause:** Incomplete mock:

```typescript
// ❌ BAD: Missing actions
vi.mock('@/stores', () => ({
  useAppStore: vi.fn(() => ({
    method: 'GET',
    url: '',
    // Missing: setMethod, setUrl, etc.
  })),
}));
```

**Solution:** Mock all used properties:

```typescript
// ✅ GOOD: Complete mock
vi.mock('@/stores', () => ({
  useAppStore: vi.fn(() => ({
    method: 'GET',
    url: '',
    setMethod: vi.fn(),
    setUrl: vi.fn(),
    // ... all used properties/actions
  })),
}));
```

### DevTools Not Working

**Problem:** Redux DevTools doesn't show store.

**Cause:** DevTools only enabled in development:

```typescript
{
  name: 'ProxyRunnerStore',
  enabled: import.meta.env.DEV,  // Only in dev mode
}
```

**Solution:**
1. Ensure running in development mode: `npm run dev`
2. Install Redux DevTools browser extension
3. Check browser console for errors

### Auto-Save Too Slow/Fast

**Problem:** Auto-save debounce timing is wrong.

**Current:** 500ms debounce

**Adjust in `stores/index.ts`:**
```typescript
const debouncedStorage = debounce(persist.createJSONStorage(() => localStorage), {
  interval: 500,  // Change this value (milliseconds)
});
```

**Guidelines:**
- **100-300ms:** Very responsive, more writes
- **500ms:** Balanced (recommended)
- **1000ms+:** Less responsive, fewer writes

---

## Related Documentation

- [ZUSTAND_ARCHITECTURE.md](./ZUSTAND_ARCHITECTURE.md) - Original design document
- [FRONTEND_ARCHITECTURE.md](/home/gdoco/dev/playground/proxy-runner/context/FRONTEND_ARCHITECTURE.md) - Overall frontend architecture
- [TEST_PATTERNS.md](/home/gdoco/dev/playground/proxy-runner/context/TEST_PATTERNS.md) - Testing strategies
- [IMPLEMENTATION_GUIDE.md](/home/gdoco/dev/playground/proxy-runner/context/IMPLEMENTATION_GUIDE.md) - Development workflows
- [WEBSOCKET_IMPLEMENTATION.md](/home/gdoco/dev/playground/proxy-runner/context/WEBSOCKET_IMPLEMENTATION.md) - WebSocket integration

---

## Quick Reference

### Common Selectors

```typescript
// Request state
const method = useAppStore((state) => state.method);
const url = useAppStore((state) => state.url);
const requestHeaders = useAppStore((state) => state.requestHeaders);

// WASM state
const wasmLoaded = useAppStore((state) => state.wasmPath !== null);
const loading = useAppStore((state) => state.loading);

// Results state
const hookResults = useAppStore((state) => state.hookResults);
const finalResponse = useAppStore((state) => state.finalResponse);

// Config state
const properties = useAppStore((state) => state.properties);
const logLevel = useAppStore((state) => state.logLevel);

// UI state
const activeHookTab = useAppStore((state) => state.activeHookTab);
const wsStatus = useAppStore((state) => state.wsStatus);
```

### Common Actions

```typescript
// Get store instance
const store = useAppStore.getState();

// Request actions
store.setMethod('POST');
store.setUrl('https://example.com');
store.updateRequestHeader('Authorization', 'Bearer token');

// WASM actions
await store.loadWasm(file, true);
await store.reloadWasm(true);

// Results actions
store.setHookResults(results);
store.clearResults();

// Config actions
store.updateProperty('key', 'value');
store.mergeProperties({ key1: 'value1', key2: 'value2' });
store.setLogLevel(4);

// UI actions
store.setActiveHookTab('onRequestBody');
store.togglePanel('request-panel');
```

---

**Document Version:** 1.0
**Last Updated:** 2026-02-06
**Author:** Claude Sonnet 4.5
**Status:** Production Ready
