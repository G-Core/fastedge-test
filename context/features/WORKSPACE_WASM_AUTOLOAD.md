# Workspace WASM Loading (VSCode Integration)

**Status:** ✅ Implemented
**Date:** February 12, 2026
**Last Updated:** March 11, 2026
**Feature:** WASM loading and UI state sync when running inside VSCode

---

## Overview

When the fastedge-debugger runs inside VSCode, the WASM binary is loaded by the **VSCode extension** (not by the UI itself). The extension calls `POST /api/load` directly after building. The server emits a `wasm_loaded` WebSocket event, and the UI syncs its store state from that event.

This replaced an earlier approach where the UI auto-loaded on mount — see [Why auto-load on mount was removed](#why-auto-load-on-mount-was-removed).

---

## Architecture

### Who loads WASM in each context

| Context | Who calls POST /api/load | How UI learns about it |
|---------|--------------------------|----------------------|
| Node (browser) | UI itself (`loadWasm` store action) | API response populates store directly |
| VSCode (F5 build) | VSCode extension (`DebuggerWebviewProvider.loadWasm`) | `wasm_loaded` WebSocket event → `setWasmLoaded` store action |
| VSCode (F5 reload) | UI itself, triggered by `reload_workspace_wasm` WS event | API response populates store directly |

### Environment Detection

The server uses environment variables set by the extension at startup:

```typescript
// DebuggerServerManager.ts sets these when forking the server
env: {
  VSCODE_INTEGRATION: "true",
  WORKSPACE_PATH: workspacePath,
}
```

---

## Server Endpoints

**GET `/api/environment`**
- Returns: `{ environment: 'vscode' | 'node', supportsPathLoading: boolean }`
- Used by frontend to adapt UI (tab defaults, etc.)

**GET `/api/workspace-wasm`**
- Returns: `{ path: string | null }`
- Checks if `.fastedge-debug/app.wasm` exists in `WORKSPACE_PATH`
- Only returns a path in VSCode environment

**POST `/api/reload-workspace-wasm`**
- Called by extension after subsequent F5 rebuilds (not the initial load)
- Emits `reload_workspace_wasm` WebSocket event to the UI
- UI receives it and calls `loadWasm` store action itself

**GET `/api/client-count`**
- Returns: `{ count: number }` — number of connected WebSocket clients
- Used by extension to wait for UI connection before loading WASM
- See [Timing: waiting for WebSocket connection](#timing-waiting-for-websocket-connection)

---

## WebSocket Events

### `wasm_loaded`

Emitted after every `POST /api/load` call, regardless of source.

```typescript
interface WasmLoadedEvent {
  type: "wasm_loaded";
  source: "ui" | "vscode" | "system" | ...;
  data: {
    filename: string;           // basename of the WASM file
    size: number;               // bytes
    runnerPort: number | null;  // HTTP WASM runner port, null for proxy-wasm
    wasmType: "proxy-wasm" | "http-wasm";
    resolvedPath: string | null; // absolute path (path-based loads only)
  };
}
```

**`resolvedPath`**: populated when the server received a file path (not a buffer). The extension always uses path-based loading, so this will be the absolute path to `app.wasm`. The UI uses this as `wasmPath` in the store so "Load from Path" works correctly.

### `reload_workspace_wasm`

Emitted by `POST /api/reload-workspace-wasm`. Only used for subsequent F5 rebuilds, not the initial load.

```typescript
interface ReloadWorkspaceWasmEvent {
  type: "reload_workspace_wasm";
  data: { path: string };  // always "<workspace>/.fastedge-debug/app.wasm"
}
```

---

## Frontend: UI State Sync

### `wasm_loaded` handler (`App.tsx`)

When the event arrives from a non-UI source (e.g. VSCode extension), the UI calls `setWasmLoaded` to populate the store without making another API call:

```typescript
case "wasm_loaded":
  setHttpRunnerPort(event.data.runnerPort ?? null);
  if (event.source !== "ui") {
    setWasmLoaded(
      event.data.resolvedPath ?? event.data.filename,
      event.data.wasmType,
      event.data.size
    );
  }
  break;
```

When source is `"ui"`, the store is already populated from the `loadWasm` action's API response — no double-update needed.

### `setWasmLoaded` store action (`wasmSlice.ts`)

Sets `wasmPath`, `wasmType`, `fileSize`, and `loadingMode` directly without making an API call. Used only for external loads (VSCode extension, API clients).

```typescript
setWasmLoaded(wasmPath: string, wasmType: WasmState['wasmType'], fileSize: number) => void
```

Note: `wasmFile` is NOT set (no File object available). This means the dotenv toggle's auto-reload guard (`if (wasmFile)` in App.tsx) won't fire after an extension-driven load — the user would need to re-trigger manually. This is acceptable for the current use case.

---

## Timing: Waiting for WebSocket Connection

### The problem

The extension calls `POST /api/load` immediately after creating the webview panel. But the panel loads the React app in an iframe, and React mounts and connects its WebSocket asynchronously. If `/api/load` completes before the WebSocket connects, the `wasm_loaded` event is emitted into a void — the UI misses it and stays on "Load a WASM binary to get started."

### The fix

Before calling `loadWasm`, the extension polls `GET /api/client-count` until the count is > 0 (i.e., the UI's WebSocket is connected), then proceeds. The poll runs every 50ms with a 5-second timeout.

```typescript
// DebuggerWebviewProvider.ts
private async waitForWebSocketClient(timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { count } = await fetch(`${url}/api/client-count`).then(r => r.json());
    if (count > 0) return;
    await sleep(50);
  }
  // timeout — proceed anyway
}

// In showDebugger():
if (wasmPath) {
  await this.waitForWebSocketClient();
  await this.loadWasm(wasmPath);
}
```

Typical wait time is under 500ms (time for iframe + React mount + WebSocket handshake).

---

## Why auto-load on mount was removed

The original implementation had `App.tsx` detect VSCode environment on mount and auto-call `GET /api/workspace-wasm` → `loadWasm(path)`. This caused a **double-load race**:

1. Extension calls `POST /api/load` → process starts on port **8100**
2. React mounts → auto-load fires → `POST /api/load` again → kills 8100, process starts on port **8101**
3. Both "Listening on" log lines appear in the UI

The UI was seeing two `http_service > Listening on` log entries. Removing the on-mount auto-load eliminated the race. The UI now learns about loads exclusively through WebSocket events.

**The "restore previous session" justification was weak**: `onDidDispose` stops the server when the panel closes, so the runner is dead anyway when the panel reopens. There is nothing to restore.

---

## F5 Reload Flow (subsequent rebuilds)

After the first load, F5 rebuilds use a different path:

```
1. Extension detects build completion
   ↓
2. Extension calls POST /api/reload-workspace-wasm
   ↓
3. Server checks WORKSPACE_PATH/.fastedge-debug/app.wasm exists
   ↓
4. Server emits reload_workspace_wasm WebSocket event
   ↓
5. UI receives event → calls loadWasm(path) store action
   ↓
6. Store's loadWasm calls POST /api/load itself → API response populates store
```

This path does NOT have a timing issue because the WebSocket is already connected for subsequent reloads.

---

## Key Files

**Server:**
- `server/server.ts` — `/api/load`, `/api/client-count`, `/api/reload-workspace-wasm`, `/api/workspace-wasm`
- `server/websocket/types.ts` — `WasmLoadedEvent` (includes `wasmType`, `resolvedPath`)
- `server/websocket/StateManager.ts` — `emitWasmLoaded()` signature

**Frontend:**
- `frontend/src/App.tsx` — `wasm_loaded` handler, on-mount effect (environment detection only)
- `frontend/src/stores/slices/wasmSlice.ts` — `setWasmLoaded` action
- `frontend/src/stores/types.ts` — `WasmActions` interface
- `frontend/src/hooks/websocket-types.ts` — `WasmLoadedEvent` frontend type
- `frontend/src/api/index.ts` — `getEnvironment()`, `getWorkspaceWasm()`

**VSCode Extension:**
- `src/debugger/DebuggerWebviewProvider.ts` — `waitForWebSocketClient()`, `loadWasm()` (path-based)
- `src/debugger/DebuggerServerManager.ts` — `reloadWorkspaceWasm()`

---

## See Also

- [VSCODE_BUNDLING.md](../VSCODE_BUNDLING.md) — what gets bundled and why
- [WEBSOCKET_IMPLEMENTATION.md](./WEBSOCKET_IMPLEMENTATION.md) — WebSocket architecture
- [HTTP_WASM_IMPLEMENTATION.md](./HTTP_WASM_IMPLEMENTATION.md) — HTTP WASM runner and port management
- FastEdge-vscode `context/BUNDLED_DEBUGGER.md` — extension-side loading flow
