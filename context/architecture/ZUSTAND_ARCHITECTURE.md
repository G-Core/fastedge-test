# Zustand Store Architecture Design
## proxy-runner State Management

**Version:** 1.0
**Date:** 2026-02-06
**Status:** Design Phase

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Analysis](#current-state-analysis)
3. [Architecture Overview](#architecture-overview)
4. [Store Structure](#store-structure)
5. [TypeScript Interfaces](#typescript-interfaces)
6. [Action Signatures](#action-signatures)
7. [Auto-Save Strategy](#auto-save-strategy)
8. [Store Composition](#store-composition)
9. [WebSocket Integration](#websocket-integration)
10. [Migration Strategy](#migration-strategy)
11. [Best Practices & Patterns](#best-practices--patterns)
12. [Implementation Roadmap](#implementation-roadmap)

---

## Executive Summary

This document outlines a comprehensive Zustand-based state management architecture for the proxy-runner application. The design follows modern best practices from 2026, including the slices pattern for modularity, TypeScript-first approach, and integration with existing WebSocket infrastructure.

### Key Design Principles

- **Separation of Concerns**: User-configurable state (persisted) vs. runtime state (ephemeral)
- **Type Safety**: Full TypeScript coverage with proper inference
- **Performance**: Selective re-renders using Zustand selectors
- **Developer Experience**: Clear, maintainable, testable code
- **Auto-Save**: Debounced persistence for user configuration
- **Real-Time Sync**: WebSocket integration for multi-client coordination

---

## Current State Analysis

### Existing State in App.tsx

The application currently uses 14 separate `useState` hooks:

**User-Configurable State** (Should be persisted):
- `method`: string - HTTP method (GET, POST)
- `url`: string - Target URL for requests
- `requestHeaders`: Record<string, string> - HTTP request headers
- `requestBody`: string - Request payload
- `responseHeaders`: Record<string, string> - Mock response headers
- `responseBody`: string - Mock response payload
- `properties`: Record<string, string> - Server properties
- `dotenv`: `{ enabled: boolean; path: string | null }` - Dotenv configuration
- `logLevel`: number - Log filtering level (0-5)

**Runtime/Ephemeral State** (Should NOT be persisted):
- `wasmState`: WasmState - Loaded WASM binary info
- `loading`: boolean - WASM loading indicator
- `error`: string | null - Error messages
- `results`: Record<string, HookResult> - Hook execution results
- `finalResponse`: FinalResponse | null - Final HTTP response
- `wsStatus`: WebSocketStatus - WebSocket connection status

### Current Config System

- **Load**: `GET /api/config` → loads fastedge-config.test.json
- **Save**: `POST /api/config` → saves fastedge-config.test.json
- Manual save/load via UI buttons

### Challenges with Current Approach

1. **Scattered State**: 14 separate useState calls make state management complex
2. **No Auto-Save**: Users must manually save configuration
3. **Type Safety**: Prop drilling leads to type inconsistencies
4. **Testing**: Difficult to test components in isolation
5. **No Undo/Redo**: Lost productivity feature
6. **Synchronization**: Manual coordination between WebSocket updates and local state

---

## Architecture Overview

### Store Organization

```
┌─────────────────────────────────────────────────────────────┐
│                     Root Store (Combined)                   │
│                                                             │
│  ┌───────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ Request Slice │  │  WASM Slice  │  │ Results Slice  │  │
│  │ (persisted)   │  │ (ephemeral)  │  │  (ephemeral)   │  │
│  └───────────────┘  └──────────────┘  └────────────────┘  │
│                                                             │
│  ┌───────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │  Config Slice │  │   UI Slice   │  │ WebSocket Mgr  │  │
│  │ (persisted)   │  │ (ephemeral)  │  │   (external)   │  │
│  └───────────────┘  └──────────────┘  └────────────────┘  │
│                                                             │
│  Middleware: [devtools, persist (selective), immer]        │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

```
┌─────────────┐
│   UI Event  │
└──────┬──────┘
       │
       v
┌─────────────────┐       ┌──────────────┐
│  Store Action   │──────>│  State Slice │
└─────────────────┘       └──────┬───────┘
       │                         │
       │                         v
       │                  ┌──────────────┐
       │                  │   Listeners  │
       │                  └──────┬───────┘
       │                         │
       v                         v
┌─────────────────┐       ┌──────────────┐
│  Auto-Save      │       │   WebSocket  │
│  (debounced)    │       │   Broadcast  │
└─────────────────┘       └──────────────┘
       │                         │
       v                         v
┌─────────────────┐       ┌──────────────┐
│  localStorage   │       │ Other Clients│
└─────────────────┘       └──────────────┘
```

---

## Store Structure

### 1. Request Store Slice

**Purpose**: Manages HTTP request configuration

**State**:
```typescript
{
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody: string;
  responseHeaders: Record<string, string>;
  responseBody: string;
}
```

**Persistence**: YES (user configuration)

### 2. WASM Store Slice

**Purpose**: Manages WASM binary loading and state

**State**:
```typescript
{
  wasmPath: string | null;
  wasmBuffer: ArrayBuffer | null;
  wasmFile: File | null;
  loading: boolean;
  error: string | null;
}
```

**Persistence**: NO (ephemeral, reload required)

### 3. Results Store Slice

**Purpose**: Manages hook execution results and final response

**State**:
```typescript
{
  hookResults: Record<string, HookResult>;
  finalResponse: FinalResponse | null;
  isExecuting: boolean;
}
```

**Persistence**: NO (runtime data)

### 4. Config Store Slice

**Purpose**: Manages application configuration and properties

**State**:
```typescript
{
  properties: Record<string, string>;
  dotenv: { enabled: boolean; path: string | null };
  logLevel: number;
  autoSave: boolean;
  lastSaved: number | null;
  isDirty: boolean;
}
```

**Persistence**: YES (user configuration)

### 5. UI Store Slice

**Purpose**: Manages UI-specific state

**State**:
```typescript
{
  activeHookTab: string;
  activeSubView: 'logs' | 'inputs' | 'outputs';
  expandedPanels: Record<string, boolean>;
  wsStatus: WebSocketStatus;
}
```

**Persistence**: PARTIAL (only expandedPanels)

---

## TypeScript Interfaces

### Core Types

```typescript
// ============================================================================
// SHARED TYPES (from existing types/index.ts)
// ============================================================================

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

export interface LogEntry {
  level: number;
  message: string;
}

export interface HookResult {
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

export interface FinalResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  contentType: string;
  isBase64?: boolean;
}

export interface WebSocketStatus {
  connected: boolean;
  reconnecting: boolean;
  clientCount: number;
  error: string | null;
}

// ============================================================================
// STORE SLICE INTERFACES
// ============================================================================

// Request Store
export interface RequestState {
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody: string;
  responseHeaders: Record<string, string>;
  responseBody: string;
}

export interface RequestActions {
  setMethod: (method: string) => void;
  setUrl: (url: string) => void;
  setRequestHeaders: (headers: Record<string, string>) => void;
  setRequestBody: (body: string) => void;
  setResponseHeaders: (headers: Record<string, string>) => void;
  setResponseBody: (body: string) => void;
  updateRequestHeader: (key: string, value: string) => void;
  removeRequestHeader: (key: string) => void;
  updateResponseHeader: (key: string, value: string) => void;
  removeResponseHeader: (key: string) => void;
  resetRequest: () => void;
}

export type RequestSlice = RequestState & RequestActions;

// WASM Store
export interface WasmState {
  wasmPath: string | null;
  wasmBuffer: ArrayBuffer | null;
  wasmFile: File | null;
  loading: boolean;
  error: string | null;
}

export interface WasmActions {
  loadWasm: (file: File, dotenvEnabled: boolean) => Promise<void>;
  reloadWasm: (dotenvEnabled: boolean) => Promise<void>;
  clearWasm: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export type WasmSlice = WasmState & WasmActions;

// Results Store
export interface ResultsState {
  hookResults: Record<string, HookResult>;
  finalResponse: FinalResponse | null;
  isExecuting: boolean;
}

export interface ResultsActions {
  setHookResult: (hook: string, result: HookResult) => void;
  setHookResults: (results: Record<string, HookResult>) => void;
  setFinalResponse: (response: FinalResponse | null) => void;
  setIsExecuting: (executing: boolean) => void;
  clearResults: () => void;
}

export type ResultsSlice = ResultsState & ResultsActions;

// Config Store
export interface ConfigState {
  properties: Record<string, string>;
  dotenv: { enabled: boolean; path: string | null };
  logLevel: number;
  autoSave: boolean;
  lastSaved: number | null;
  isDirty: boolean;
}

export interface ConfigActions {
  setProperties: (properties: Record<string, string>) => void;
  updateProperty: (key: string, value: string) => void;
  removeProperty: (key: string) => void;
  mergeProperties: (properties: Record<string, string>) => void;
  setDotenvEnabled: (enabled: boolean) => void;
  setLogLevel: (level: number) => void;
  setAutoSave: (enabled: boolean) => void;
  markDirty: () => void;
  markClean: () => void;
  loadFromConfig: (config: TestConfig) => void;
  exportConfig: () => TestConfig;
  resetConfig: () => void;
}

export type ConfigSlice = ConfigState & ConfigActions;

// UI Store
export interface UIState {
  activeHookTab: string;
  activeSubView: 'logs' | 'inputs' | 'outputs';
  expandedPanels: Record<string, boolean>;
  wsStatus: WebSocketStatus;
}

export interface UIActions {
  setActiveHookTab: (tab: string) => void;
  setActiveSubView: (view: 'logs' | 'inputs' | 'outputs') => void;
  togglePanel: (panel: string) => void;
  setWsStatus: (status: WebSocketStatus) => void;
}

export type UISlice = UIState & UIActions;

// ============================================================================
// COMBINED STORE TYPE
// ============================================================================

export type AppStore = RequestSlice &
                       WasmSlice &
                       ResultsSlice &
                       ConfigSlice &
                       UISlice;

// ============================================================================
// SELECTOR TYPES (for components)
// ============================================================================

// Request selectors
export type RequestSelector = (state: AppStore) => RequestState;
export type MethodSelector = (state: AppStore) => string;
export type UrlSelector = (state: AppStore) => string;

// WASM selectors
export type WasmLoadedSelector = (state: AppStore) => boolean;
export type WasmLoadingSelector = (state: AppStore) => boolean;

// Results selectors
export type HookResultsSelector = (state: AppStore) => Record<string, HookResult>;
export type SingleHookResultSelector = (hook: string) => (state: AppStore) => HookResult | undefined;

// Config selectors
export type PropertiesSelector = (state: AppStore) => Record<string, string>;
export type LogLevelSelector = (state: AppStore) => number;
export type IsDirtySelector = (state: AppStore) => boolean;

// UI selectors
export type ActiveHookTabSelector = (state: AppStore) => string;
export type WsStatusSelector = (state: AppStore) => WebSocketStatus;

// ============================================================================
// UTILITY TYPES
// ============================================================================

export interface TestConfig {
  description?: string;
  wasm?: {
    path: string;
    description?: string;
  };
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body: string;
  };
  properties: Record<string, string>;
  logLevel: number;
}

export interface PersistConfig {
  request: RequestState;
  config: Omit<ConfigState, 'isDirty' | 'lastSaved'>;
  ui: Pick<UIState, 'expandedPanels'>;
}
```

---

## Action Signatures

### Request Actions

```typescript
// Basic setters
setMethod(method: string): void
setUrl(url: string): void
setRequestHeaders(headers: Record<string, string>): void
setRequestBody(body: string): void
setResponseHeaders(headers: Record<string, string>): void
setResponseBody(body: string): void

// Granular header operations
updateRequestHeader(key: string, value: string): void
removeRequestHeader(key: string): void
updateResponseHeader(key: string, value: string): void
removeResponseHeader(key: string): void

// Bulk operations
resetRequest(): void
```

### WASM Actions

```typescript
// Async operations (return promises)
loadWasm(file: File, dotenvEnabled: boolean): Promise<void>
reloadWasm(dotenvEnabled: boolean): Promise<void>

// Sync operations
clearWasm(): void
setLoading(loading: boolean): void
setError(error: string | null): void
```

### Results Actions

```typescript
// Single result
setHookResult(hook: string, result: HookResult): void

// Bulk results
setHookResults(results: Record<string, HookResult>): void

// Response
setFinalResponse(response: FinalResponse | null): void

// Execution state
setIsExecuting(executing: boolean): void

// Clear all
clearResults(): void
```

### Config Actions

```typescript
// Properties
setProperties(properties: Record<string, string>): void
updateProperty(key: string, value: string): void
removeProperty(key: string): void
mergeProperties(properties: Record<string, string>): void

// Settings
setDotenvEnabled(enabled: boolean): void
setLogLevel(level: number): void
setAutoSave(enabled: boolean): void

// Dirty tracking
markDirty(): void
markClean(): void

// Config I/O
loadFromConfig(config: TestConfig): void
exportConfig(): TestConfig

// Reset
resetConfig(): void
```

### UI Actions

```typescript
// Tab management
setActiveHookTab(tab: string): void
setActiveSubView(view: 'logs' | 'inputs' | 'outputs'): void

// Panel management
togglePanel(panel: string): void

// WebSocket status
setWsStatus(status: WebSocketStatus): void
```

---

## Auto-Save Strategy

### Overview

Auto-save automatically persists user configuration changes to localStorage with debouncing to prevent excessive writes.

### Architecture

```typescript
┌─────────────┐
│ User Action │
└──────┬──────┘
       │
       v
┌─────────────────┐
│  Store Mutation │
│   (via action)  │
└──────┬──────────┘
       │
       v
┌─────────────────┐
│   markDirty()   │
│ isDirty = true  │
└──────┬──────────┘
       │
       v
┌─────────────────┐       ┌──────────────┐
│ Zustand persist │──────>│   Debounce   │
│   middleware    │       │    500ms     │
└─────────────────┘       └──────┬───────┘
                                 │
                                 v
                          ┌──────────────┐
                          │ localStorage │
                          │    write     │
                          └──────┬───────┘
                                 │
                                 v
                          ┌──────────────┐
                          │  markClean() │
                          │isDirty=false │
                          └──────────────┘
```

### Implementation Details

#### 1. Custom Persist Middleware

Use `zustand-debounce` library for debounced persistence:

```typescript
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { createDebouncedJSONStorage } from 'zustand-debounce';

const debouncedStorage = createDebouncedJSONStorage('localStorage', {
  debounceTime: 500, // 500ms debounce
  onFlush: () => {
    // Called when data is actually written
    console.log('[Store] Auto-saved to localStorage');
  },
  onError: (error) => {
    console.error('[Store] Auto-save failed:', error);
  }
});

export const useAppStore = create<AppStore>()(
  devtools(
    immer(
      persist(
        (set, get) => ({
          // ... store implementation
        }),
        {
          name: 'proxy-runner-config',
          storage: debouncedStorage,
          partialize: (state) => ({
            // Only persist user-configurable state
            request: {
              method: state.method,
              url: state.url,
              requestHeaders: state.requestHeaders,
              requestBody: state.requestBody,
              responseHeaders: state.responseHeaders,
              responseBody: state.responseBody,
            },
            config: {
              properties: state.properties,
              dotenv: state.dotenv,
              logLevel: state.logLevel,
              autoSave: state.autoSave,
            },
            ui: {
              expandedPanels: state.expandedPanels,
            },
          }),
          version: 1, // For future migrations
        }
      )
    )
  )
);
```

#### 2. Dirty State Tracking

Track when persisted state has changed:

```typescript
// In store implementation
markDirty: () => {
  set((state) => {
    state.isDirty = true;
  });
},

markClean: () => {
  set((state) => {
    state.isDirty = false;
    state.lastSaved = Date.now();
  });
},
```

#### 3. Visual Indicators

Show save status in UI:

```typescript
// Component usage
function SaveIndicator() {
  const isDirty = useAppStore((state) => state.isDirty);
  const lastSaved = useAppStore((state) => state.lastSaved);

  return (
    <div className="save-indicator">
      {isDirty ? (
        <span>⚠️ Unsaved changes...</span>
      ) : lastSaved ? (
        <span>✓ Saved {formatRelativeTime(lastSaved)}</span>
      ) : null}
    </div>
  );
}
```

#### 4. Manual Save/Load Integration

Preserve existing manual save/load functionality:

```typescript
// Manual save to fastedge-config.test.json
const handleManualSave = async () => {
  const config = useAppStore.getState().exportConfig();
  await saveConfig(config); // API call
  alert('✅ Saved to fastedge-config.test.json');
};

// Manual load from fastedge-config.test.json
const handleManualLoad = async () => {
  const config = await loadConfig(); // API call
  useAppStore.getState().loadFromConfig(config);
  alert('✅ Loaded from fastedge-config.test.json');
};
```

### What Gets Auto-Saved

**Persisted (localStorage)**:
- ✅ Request configuration (method, url, headers, body)
- ✅ Response configuration (headers, body)
- ✅ Server properties
- ✅ Dotenv enabled flag
- ✅ Log level
- ✅ UI preferences (expanded panels)

**Not Persisted**:
- ❌ WASM state (file must be reloaded)
- ❌ Execution results (runtime data)
- ❌ Final response (runtime data)
- ❌ Loading states
- ❌ Error messages
- ❌ WebSocket status
- ❌ Active tab state (UX preference)

### Performance Optimization

- **Debounce Window**: 500ms (user stops typing → save)
- **Selective Persistence**: Only changed slices trigger writes
- **Shallow Comparison**: Zustand uses shallow equality by default
- **Partialize**: Only serialize necessary state (reduces localStorage size)

---

## Store Composition

### Slices Pattern

Use the official Zustand slices pattern for modularity:

```typescript
// stores/slices/requestSlice.ts
import { StateCreator } from 'zustand';
import { AppStore } from '../types';

const DEFAULT_REQUEST_STATE: RequestState = {
  method: 'POST',
  url: 'http://fastedge-builtin.debug',
  requestHeaders: {},
  requestBody: '{"message": "Hello"}',
  responseHeaders: { 'content-type': 'application/json' },
  responseBody: '{"response": "OK"}',
};

export const createRequestSlice: StateCreator<
  AppStore,
  [['zustand/devtools', never], ['zustand/immer', never], ['zustand/persist', unknown]],
  [],
  RequestSlice
> = (set) => ({
  ...DEFAULT_REQUEST_STATE,

  setMethod: (method) =>
    set((state) => {
      state.method = method;
      state.markDirty();
    }, false, 'request/setMethod'),

  setUrl: (url) =>
    set((state) => {
      state.url = url;
      state.markDirty();
    }, false, 'request/setUrl'),

  setRequestHeaders: (headers) =>
    set((state) => {
      state.requestHeaders = headers;
      state.markDirty();
    }, false, 'request/setRequestHeaders'),

  // ... other actions

  resetRequest: () =>
    set((state) => {
      Object.assign(state, DEFAULT_REQUEST_STATE);
      state.markDirty();
    }, false, 'request/reset'),
});
```

### Combining Slices

```typescript
// stores/index.ts
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { createDebouncedJSONStorage } from 'zustand-debounce';
import { createRequestSlice } from './slices/requestSlice';
import { createWasmSlice } from './slices/wasmSlice';
import { createResultsSlice } from './slices/resultsSlice';
import { createConfigSlice } from './slices/configSlice';
import { createUISlice } from './slices/uiSlice';
import { AppStore } from './types';

const debouncedStorage = createDebouncedJSONStorage('localStorage', {
  debounceTime: 500,
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
          partialize: (state) => ({
            request: {
              method: state.method,
              url: state.url,
              requestHeaders: state.requestHeaders,
              requestBody: state.requestBody,
              responseHeaders: state.responseHeaders,
              responseBody: state.responseBody,
            },
            config: {
              properties: state.properties,
              dotenv: state.dotenv,
              logLevel: state.logLevel,
              autoSave: state.autoSave,
            },
            ui: {
              expandedPanels: state.expandedPanels,
            },
          }),
          version: 1,
        }
      )
    ),
    { name: 'ProxyRunner' }
  )
);

// ============================================================================
// SELECTOR HOOKS (for components)
// ============================================================================

// Selective selectors for performance
export const useMethod = () => useAppStore((state) => state.method);
export const useUrl = () => useAppStore((state) => state.url);
export const useRequestHeaders = () => useAppStore((state) => state.requestHeaders);
export const useWasmLoaded = () => useAppStore((state) => state.wasmPath !== null);
export const useHookResults = () => useAppStore((state) => state.hookResults);
export const useProperties = () => useAppStore((state) => state.properties);
export const useLogLevel = () => useAppStore((state) => state.logLevel);

// Action hooks
export const useRequestActions = () =>
  useAppStore((state) => ({
    setMethod: state.setMethod,
    setUrl: state.setUrl,
    setRequestHeaders: state.setRequestHeaders,
    setRequestBody: state.setRequestBody,
  }));

export const useWasmActions = () =>
  useAppStore((state) => ({
    loadWasm: state.loadWasm,
    reloadWasm: state.reloadWasm,
    clearWasm: state.clearWasm,
  }));

export const useResultsActions = () =>
  useAppStore((state) => ({
    setHookResult: state.setHookResult,
    setHookResults: state.setHookResults,
    setFinalResponse: state.setFinalResponse,
    clearResults: state.clearResults,
  }));

export const useConfigActions = () =>
  useAppStore((state) => ({
    setProperties: state.setProperties,
    updateProperty: state.updateProperty,
    setLogLevel: state.setLogLevel,
    setDotenvEnabled: state.setDotenvEnabled,
  }));
```

### Cross-Slice Communication

Slices can access other slices via the combined store:

```typescript
// Example: WASM reload triggers results clear
reloadWasm: async (dotenvEnabled) => {
  const { clearResults } = get(); // Access other slice actions

  set({ loading: true, error: null });

  try {
    clearResults(); // Clear results from results slice
    // ... reload logic
  } catch (error) {
    set({ error: error.message });
  } finally {
    set({ loading: false });
  }
}
```

---

## WebSocket Integration

### Architecture

WebSocket updates should synchronize with store state:

```typescript
// In useWebSocket hook or component
function handleServerEvent(event: ServerEvent) {
  const store = useAppStore.getState();

  switch (event.type) {
    case 'wasm_loaded':
      // Update WASM state from server event
      store.setWasmPath(event.data.filename);
      break;

    case 'request_started':
      store.setUrl(event.data.url);
      store.setMethod(event.data.method);
      store.setRequestHeaders(event.data.headers);
      store.clearResults();
      break;

    case 'hook_executed':
      store.setHookResult(event.data.hook, {
        returnValue: event.data.returnCode,
        input: event.data.input,
        output: event.data.output,
        logs: [], // Populated by request_completed
      });
      break;

    case 'request_completed':
      store.setHookResults(event.data.hookResults);
      store.setFinalResponse(event.data.finalResponse);
      if (event.data.calculatedProperties) {
        store.mergeProperties(event.data.calculatedProperties);
      }
      break;

    case 'request_failed':
      const errorResult = {
        logs: [],
        error: event.data.error,
      };
      store.setHookResults({
        onRequestHeaders: errorResult,
        onRequestBody: errorResult,
        onResponseHeaders: errorResult,
        onResponseBody: errorResult,
      });
      break;

    case 'properties_updated':
      store.setProperties(event.data.properties);
      break;

    case 'connection_status':
      store.setWsStatus({
        connected: event.data.connected,
        clientCount: event.data.clientCount,
        reconnecting: false,
        error: null,
      });
      break;
  }
}
```

### WebSocket Status in Store

WebSocket status is stored in the UI slice:

```typescript
// UI Slice
export interface UIState {
  wsStatus: WebSocketStatus;
  // ...
}

export interface UIActions {
  setWsStatus: (status: WebSocketStatus) => void;
  // ...
}

// Implementation
setWsStatus: (status) =>
  set((state) => {
    state.wsStatus = status;
  }, false, 'ui/setWsStatus'),
```

### Preventing Circular Updates

To prevent WebSocket updates from triggering auto-save:

```typescript
// Option 1: Flag-based approach
let isWebSocketUpdate = false;

function handleServerEvent(event: ServerEvent) {
  isWebSocketUpdate = true;
  // ... update store
  isWebSocketUpdate = false;
}

// In persist middleware
partialize: (state) => {
  if (isWebSocketUpdate) {
    return {}; // Skip persistence during WS updates
  }
  return { /* ... normal persistence */ };
}

// Option 2: Separate actions for external updates
// Create parallel actions that don't trigger auto-save
setUrlFromWebSocket: (url) =>
  set((state) => {
    state.url = url;
    // Don't call markDirty()
  }, false, 'request/setUrlFromWebSocket'),
```

---

## Migration Strategy

### Phase 1: Setup (1-2 hours)

1. **Install Dependencies**
   ```bash
   pnpm add zustand zustand-debounce
   ```

2. **Create Store Structure**
   ```
   frontend/src/
   └── stores/
       ├── index.ts              # Combined store + exports
       ├── types.ts              # All type definitions
       └── slices/
           ├── requestSlice.ts   # Request state + actions
           ├── wasmSlice.ts      # WASM state + actions
           ├── resultsSlice.ts   # Results state + actions
           ├── configSlice.ts    # Config state + actions
           └── uiSlice.ts        # UI state + actions
   ```

3. **Define Types**
   - Copy types from this document to `stores/types.ts`
   - Import existing types from `types/index.ts`

### Phase 2: Implement Slices (2-3 hours)

1. **Request Slice** (30 min)
   - Implement state + actions
   - Add dirty tracking to all mutating actions
   - Test with DevTools

2. **WASM Slice** (30 min)
   - Port useWasm logic
   - Handle async loadWasm/reloadWasm
   - Integrate with API calls

3. **Results Slice** (20 min)
   - Simple state + setters
   - No complex logic

4. **Config Slice** (30 min)
   - Properties management
   - Config I/O functions
   - Dirty tracking

5. **UI Slice** (20 min)
   - Tab state
   - Panel expansion
   - WebSocket status

### Phase 3: Component Migration (3-4 hours)

**Migration Order** (from leaves to root):

1. **RequestBar** (30 min)
   ```typescript
   // Before
   function RequestBar({ method, url, onMethodChange, onUrlChange, ... }) {
     // ...
   }

   // After
   function RequestBar() {
     const method = useMethod();
     const url = useUrl();
     const wasmLoaded = useWasmLoaded();
     const { setMethod, setUrl } = useRequestActions();
     const { sendRequest } = useSendRequest(); // Custom hook

     return (
       <div className={styles.requestBar}>
         <select value={method} onChange={(e) => setMethod(e.target.value)}>
           {/* ... */}
         </select>
         <input value={url} onChange={(e) => setUrl(e.target.value)} />
         <button onClick={sendRequest} disabled={!wasmLoaded}>
           Send
         </button>
       </div>
     );
   }
   ```

2. **ServerPropertiesPanel** (30 min)
   ```typescript
   // After
   function ServerPropertiesPanel() {
     const properties = useProperties();
     const dotenv = useAppStore((state) => state.dotenv);
     const { setProperties, setDotenvEnabled } = useConfigActions();

     return (
       <CollapsiblePanel title="Server Properties">
         <PropertiesEditor value={properties} onChange={setProperties} />
         <Toggle checked={dotenv.enabled} onChange={setDotenvEnabled} />
       </CollapsiblePanel>
     );
   }
   ```

3. **HookStagesPanel** (45 min)
   ```typescript
   // After
   function HookStagesPanel() {
     const results = useHookResults();
     const logLevel = useLogLevel();
     const activeHookTab = useAppStore((state) => state.activeHookTab);
     const { setLogLevel } = useConfigActions();
     const { setActiveHookTab } = useAppStore((state) => ({
       setActiveHookTab: state.setActiveHookTab,
     }));

     // ... rest of component logic
   }
   ```

4. **WasmLoader** (30 min)
5. **RequestTabs** (30 min)
6. **ResponseViewer** (20 min)
7. **ConnectionStatus** (15 min)

8. **App.tsx** (60 min)
   - Remove all useState hooks
   - Remove prop drilling
   - Keep WebSocket integration
   - Simplify event handlers

### Phase 4: WebSocket Integration (1-2 hours)

1. **Update useWebSocket**
   - Import store actions
   - Update handleServerEvent to use store
   - Remove onEvent callback prop

2. **Update App.tsx**
   - Use store for WebSocket status
   - Simplify event handling

### Phase 5: Testing & Validation (2-3 hours)

1. **Unit Tests**
   - Test each slice in isolation
   - Test store composition
   - Test persistence

2. **Integration Tests**
   - Test WebSocket integration
   - Test auto-save behavior
   - Test manual save/load

3. **E2E Testing**
   - Full user workflows
   - Multi-client synchronization

### Phase 6: Documentation (1 hour)

1. Update README with store usage
2. Add JSDoc comments to actions
3. Create migration guide for team

### Total Estimated Time: 10-15 hours

---

## Best Practices & Patterns

### 1. Selector Optimization

**Problem**: Components re-render on every store change

**Solution**: Use selective selectors

```typescript
// ❌ Bad: Re-renders on ANY store change
function MyComponent() {
  const store = useAppStore();
  return <div>{store.url}</div>;
}

// ✅ Good: Re-renders only when url changes
function MyComponent() {
  const url = useAppStore((state) => state.url);
  return <div>{url}</div>;
}

// ✅ Better: Custom hook for reusability
function MyComponent() {
  const url = useUrl();
  return <div>{url}</div>;
}
```

### 2. Action Grouping

**Group related state updates** to avoid multiple re-renders:

```typescript
// ❌ Bad: 3 re-renders
setMethod('POST');
setUrl('https://example.com');
setRequestBody('{}');

// ✅ Good: 1 re-render
set((state) => {
  state.method = 'POST';
  state.url = 'https://example.com';
  state.requestBody = '{}';
}, false, 'request/bulkUpdate');
```

### 3. Async Actions

**Handle async operations properly**:

```typescript
loadWasm: async (file, dotenvEnabled) => {
  set({ loading: true, error: null });

  try {
    const buffer = await file.arrayBuffer();
    const path = await uploadWasm(file, dotenvEnabled);

    set({
      wasmPath: path,
      wasmBuffer: buffer,
      wasmFile: file,
      loading: false,
    });
  } catch (error) {
    set({
      error: error.message,
      loading: false,
    });
  }
}
```

### 4. DevTools Integration

Use action names for better debugging:

```typescript
set((state) => {
  state.method = method;
}, false, 'request/setMethod'); // Show in Redux DevTools
```

### 5. Immer for Nested Updates

Use Immer middleware for cleaner nested mutations:

```typescript
// Without Immer
updateRequestHeader: (key, value) =>
  set((state) => ({
    requestHeaders: {
      ...state.requestHeaders,
      [key]: value,
    },
  })),

// With Immer (cleaner)
updateRequestHeader: (key, value) =>
  set((state) => {
    state.requestHeaders[key] = value;
  }),
```

### 6. TypeScript Best Practices

```typescript
// Use StateCreator for proper type inference
export const createRequestSlice: StateCreator<
  AppStore,
  [['zustand/devtools', never], ['zustand/immer', never], ['zustand/persist', unknown]],
  [],
  RequestSlice
> = (set, get) => ({
  // Implementation
});

// Use proper selector typing
const url = useAppStore((state) => state.url); // Type is inferred as string
```

### 7. Testing Strategies

```typescript
// Test store in isolation
describe('RequestSlice', () => {
  it('should update method', () => {
    const { result } = renderHook(() => useAppStore());

    act(() => {
      result.current.setMethod('GET');
    });

    expect(result.current.method).toBe('GET');
  });
});

// Mock store in component tests
import { useAppStore } from '@/stores';

jest.mock('@/stores', () => ({
  useAppStore: jest.fn(),
}));

describe('RequestBar', () => {
  it('should render with store values', () => {
    useAppStore.mockReturnValue({
      method: 'POST',
      url: 'https://example.com',
      setMethod: jest.fn(),
      setUrl: jest.fn(),
    });

    render(<RequestBar />);
    expect(screen.getByText('POST')).toBeInTheDocument();
  });
});
```

---

## Implementation Roadmap

### Sprint 1: Foundation (Week 1)

- [ ] Install Zustand and dependencies
- [ ] Create store structure (folders, files)
- [ ] Define all TypeScript interfaces
- [ ] Implement Request Slice
- [ ] Implement WASM Slice
- [ ] Add DevTools integration
- [ ] Write unit tests for slices

### Sprint 2: Store Completion (Week 1-2)

- [ ] Implement Results Slice
- [ ] Implement Config Slice
- [ ] Implement UI Slice
- [ ] Configure persist middleware
- [ ] Implement auto-save with debouncing
- [ ] Test store composition
- [ ] Write integration tests

### Sprint 3: Component Migration (Week 2)

- [ ] Migrate RequestBar
- [ ] Migrate ServerPropertiesPanel
- [ ] Migrate WasmLoader
- [ ] Migrate RequestTabs
- [ ] Migrate HookStagesPanel
- [ ] Migrate ResponseViewer
- [ ] Migrate ConnectionStatus
- [ ] Update component tests

### Sprint 4: App Integration (Week 3)

- [ ] Refactor App.tsx
- [ ] Integrate WebSocket with store
- [ ] Test WebSocket synchronization
- [ ] Verify auto-save behavior
- [ ] Test manual save/load
- [ ] Performance optimization
- [ ] Bug fixes

### Sprint 5: Polish & Documentation (Week 3)

- [ ] Complete E2E testing
- [ ] Update README
- [ ] Add JSDoc comments
- [ ] Create developer guide
- [ ] Performance profiling
- [ ] Code review
- [ ] Final deployment

---

## Conclusion

This Zustand architecture provides a robust, type-safe, and maintainable state management solution for proxy-runner. Key benefits:

1. **Reduced Complexity**: From 14 useState hooks to unified store
2. **Type Safety**: Full TypeScript coverage with proper inference
3. **Auto-Save**: Debounced persistence without manual save buttons
4. **Performance**: Selective re-renders using Zustand selectors
5. **Developer Experience**: DevTools, testing utilities, clear patterns
6. **Real-Time Sync**: WebSocket integration for multi-client coordination
7. **Maintainability**: Slices pattern for modular, testable code

### Key Features

- ✅ Slices pattern for modularity
- ✅ TypeScript-first with proper inference
- ✅ Auto-save with 500ms debouncing
- ✅ Selective persistence (user config only)
- ✅ WebSocket integration
- ✅ DevTools for debugging
- ✅ Immer for clean mutations
- ✅ Comprehensive testing strategy
- ✅ Performance optimized

### Next Steps

1. Review this architecture with team
2. Get approval for implementation
3. Follow the migration roadmap
4. Iterate based on feedback

---

## References

### Zustand Resources

- [Official Zustand Documentation](https://zustand.docs.pmnd.rs/)
- [Slices Pattern Guide](https://zustand.docs.pmnd.rs/guides/slices-pattern)
- [TypeScript Guide](https://zustand.docs.pmnd.rs/guides/beginner-typescript)
- [GitHub Repository](https://github.com/pmndrs/zustand)

### Libraries

- [zustand-debounce](https://github.com/AbianS/zustand-debounce) - Debounced persistence
- [zustand-slices](https://github.com/zustandjs/zustand-slices) - Slice utilities

### Best Practices Articles

- [A Slice-Based Zustand Store for Next.js and TypeScript](https://engineering.atlys.com/a-slice-based-zustand-store-for-next-js-14-and-typescript-6b92385a48f5)
- [Frontend Masters: Introducing Zustand](https://frontendmasters.com/blog/introducing-zustand/)
- [Top React State Management Tools 2026](https://www.syncfusion.com/blogs/post/react-state-management-libraries)

---

**Document Version:** 1.0
**Last Updated:** 2026-02-06
**Author:** Claude Sonnet 4.5
**Status:** Ready for Review
