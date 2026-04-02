# HTTP WASM Preview — Live Mode & Open in Browser

**Status**: ✅ Complete (March 2026)
**Affects**: `ResponsePanel`, `HttpWasmRunner`, `StateManager`, `httpWasmSlice`, `App.tsx`

---

## Problem This Solves

When an HTTP WASM app serves a Single Page Application (e.g. react-app-hono), executing `GET /`
returns an HTML shell that references JS bundles and CSS (`/assets/index-XXX.js`, etc.). These
assets are embedded in the WASM binary and served by the `fastedge-run` process.

Before this feature:
1. The HTML preview used `<iframe srcDoc={response.body} sandbox="allow-same-origin" />`.
2. `sandbox` without `allow-scripts` **blocks all JavaScript execution** — the SPA never mounts.
3. Relative asset URLs resolved against `:5179` (the debugger server), which has no WASM assets.
4. The preview panel showed a frozen HTML skeleton with no styles, no JS, no content.

---

## Why No Reverse Proxy?

The obvious fix (proxy `:5179 → :5180`) was considered and rejected:

- `fastedge-run` already runs persistently on its allocated port (8100–8199). It does **not** exit
  after serving a response — it stays alive until `HttpWasmRunner.cleanup()` kills it.
- The debugger's own frontend (React UI) lives at `:5179/`. Proxying all unmatched requests to the
  WASM runner would create routing conflicts between the debugger UI and the WASM app (both want `/`).
- Pointing the iframe `src` directly at `http://localhost:{runnerPort}/` is simpler, has zero
  routing conflicts, and gives the browser exactly the same experience as hitting the app directly.

---

## Solution: Live Toggle + Open in Browser

### Two modes in the ResponsePanel HTML preview:

**Static (default — `srcDoc`)**
- Renders the response body HTML as a frozen snapshot.
- JavaScript blocked (sandboxed). Assets won't load from the WASM runner.
- Useful for inspecting the raw HTML structure of any response, including non-SPA apps.
- Zero network activity after render.

**Live (`src` pointing to fastedge-run)**
- The iframe `src` is set to `http://localhost:{runnerPort}{requestPath}`.
- Browser fetches the page and all assets directly from the running `fastedge-run` process.
- JavaScript executes. The SPA mounts. Assets load. Behaves exactly like a real browser.
- No `sandbox` attribute — scripts run normally.
- Only available when an HTTP WASM runner is active (`httpRunnerPort !== null`).

**Open in Browser button**
- Opens `http://localhost:{runnerPort}/` in the system browser.
- Useful when browser DevTools (network tab, console) are needed.
- Also only enabled when a runner is active.

### Naming decision
The toggle is labelled **"Live"** (not "Proxy"). A proxy implies a network middleman — there is none.
The iframe connects directly to `fastedge-run`. "Live" is familiar from VS Code Live Server and
browser live-editing tools: it means "connected to the running process".

---

## How the Runner Port Reaches the Frontend

The runner port is piggybacked on the existing `wasm_loaded` WebSocket event — no new REST
endpoint. The data flow:

```
/api/load → HttpWasmRunner.load() → port allocated (8100–8199)
          → stateManager.emitWasmLoaded(filename, size, source, runnerPort)
          → WebSocket broadcast: { type: "wasm_loaded", data: { filename, size, runnerPort } }
          → App.tsx handleServerEvent("wasm_loaded") → setHttpRunnerPort(runnerPort)
          → Zustand store: httpRunnerPort: number | null
          → ResponsePanel reads httpRunnerPort via useAppStore() — no prop drilling
```

When a non-HTTP WASM is loaded, `runnerPort` is `null` in the event, so `httpRunnerPort` is cleared.

**Why WebSocket and not a REST endpoint?**
The `wasm_loaded` event fires at exactly the right moment (when the runner is ready) and already
reaches the frontend. Adding a new `GET /api/runner-port` would require an extra fetch with a
timing dependency. The WebSocket approach is zero-cost and architecturally consistent.

---

## Files Changed

| File | Change |
|------|--------|
| `server/runner/HttpWasmRunner.ts` | Added `getPort(): number \| null` public getter |
| `server/websocket/types.ts` | Added `runnerPort?: number \| null` to `WasmLoadedEvent` |
| `server/websocket/StateManager.ts` | Added `runnerPort` param to `emitWasmLoaded()` |
| `server/server.ts` | Passes `runnerPort` to `emitWasmLoaded()` on load; imports `HttpWasmRunner` |
| `frontend/src/hooks/websocket-types.ts` | Mirrored `runnerPort` in frontend `WasmLoadedEvent` |
| `frontend/src/stores/types.ts` | Added `httpRunnerPort: number \| null` to `HttpWasmState` + `setHttpRunnerPort` action |
| `frontend/src/stores/slices/httpWasmSlice.ts` | Default value + `setHttpRunnerPort` action |
| `frontend/src/App.tsx` | Wires `setHttpRunnerPort` from `wasm_loaded` event handler |
| `frontend/src/components/common/ResponsePanel/ResponsePanel.tsx` | Live toggle + Open in Browser toolbar; `src` vs `srcDoc` switching |
| `frontend/src/components/common/ResponsePanel/ResponsePanel.module.css` | Toolbar styles; preview height fix (600px, scrollable) |

---

## Preview Panel Sizing

The `.htmlPreview` iframe uses `height: 600px` (not `height: 100%`). Using `height: 100%`
constrained the iframe to the flex container height, producing a letterbox effect. `600px` gives a
realistic viewport height, and `.responsePreview` has `overflow-y: auto` so the panel scrolls to
reveal the full page.

---

## Active Tab Hover — Consistent Fix (Same Session)

While working in this area, a global tab styling bug was also fixed: across all tab components,
hovering an active tab showed the brand orange background with white/orange text — unreadable.

**Fix applied to all 5 tab CSS files:**
```css
.tab.active:hover {
  color: #1a1a1a;
  background: rgba(255, 108, 55, 0.85);
}
```

Files fixed: `ResponsePanel.module.css`, `HookStagesPanel.module.css`,
`RequestInfoTabs.module.css`, `WasmLoader.module.css` (uses `.tabActive`),
`ConfigEditorModal.module.css` (uses `.activeTab`).

---

---

## Real-Time Log Streaming (March 2026)

### The Problem

Before this change, HTTP WASM logs worked correctly for explicit "Send" requests but were
completely missing in live mode.

**Execute flow (Send button)**: `POST /api/execute` (with `{ path }` for HTTP WASM) → `HttpWasmRunner.execute()` → logs
accumulated in `this.logs[]` → returned in HTTP response → emitted in `http_wasm_request_completed`
WebSocket event → frontend replaced `httpLogs` with the new batch.

**Live mode flow**: The iframe points directly at `http://localhost:{runnerPort}/`. Every asset
request the browser makes (HTML, CSS, JS, images) goes straight to the `fastedge-run` process,
bypassing `/api/execute` entirely. Logs from those requests accumulated in `this.logs[]` but were
never read or emitted — they silently disappeared.

### Why Unify Instead of Differentiate

The naive fix would add an `isExecuting` flag to suppress live-mode log forwarding during
`execute()` calls (to avoid double-emission). But this creates an unnecessary split between
"execute logs" and "live logs". Both come from the same process stdout/stderr. Treating them
identically is simpler and more correct.

### Solution: Unconditional Real-Time Streaming

Every log line emitted by the `fastedge-run` process is now forwarded to all WebSocket clients
immediately as it arrives — regardless of whether it came from an explicit `execute()` call or a
live mode request.

**Data flow:**

```
fastedge-run stdout/stderr
  → HttpWasmRunner.setupLogCapture() data handler
  → this.logs.push(log)             ← retained for execute() return value + waitForServerReady()
  → stateManager.emitHttpWasmLog(log)
  → StateManager.broadcast()
  → WebSocket: { type: "http_wasm_log", data: { level, message } }
  → App.tsx handleServerEvent("http_wasm_log")
  → appendHttpLogs([event.data])    ← appends to httpLogs[], never replaces
```

`http_wasm_request_completed` still fires on Send, but now carries only the response object —
no logs. The logs have already arrived (or are still arriving) via `http_wasm_log` events.

**Log panel behaviour:**
- **Send** — `executeHttpRequest()` clears `httpLogs` before firing the request, giving a clean
  slate. Logs then stream in as the WASM executes.
- **Live mode** — logs append continuously as each asset request is served. No clearing occurs.
- **Both** — the same `http_wasm_log` event, the same `appendHttpLogs` action. No special cases.

### Why `this.logs[]` Was Kept

`this.logs[]` on `HttpWasmRunner` still serves two internal purposes:

1. **`waitForServerReady()`** — polls `this.logs` every 50ms looking for `"Listening on"` during
   process startup. Removing it would require a separate startup buffer.
2. **`execute()` return value** — the REST API (`POST /api/execute`) still returns logs in the
   response body. npm package users and test-framework consumers depend on this.

`this.logs[]` is never used to drive the UI. The UI is driven exclusively by `http_wasm_log`
WebSocket events.

### Files Changed

| File | Change |
|------|--------|
| `server/runner/HttpWasmRunner.ts` | `setupLogCapture()` calls `stateManager?.emitHttpWasmLog(log)` for every log line |
| `server/runner/IStateManager.ts` | Added `emitHttpWasmLog()`; removed `logs` param from `emitHttpWasmRequestCompleted()` |
| `server/runner/NullStateManager.ts` | Added `emitHttpWasmLog(): void {}` stub |
| `server/websocket/types.ts` | Added `HttpWasmLogEvent`; removed `logs` from `HttpWasmRequestCompletedEvent` |
| `server/websocket/StateManager.ts` | Added `emitHttpWasmLog()`; `emitHttpWasmRequestCompleted()` no longer includes logs in event payload |
| `server/server.ts` | Removed `result.logs` from `emitHttpWasmRequestCompleted()` call |
| `frontend/src/hooks/websocket-types.ts` | Mirrored server-side type changes; added `HttpWasmLogEvent` |
| `frontend/src/stores/types.ts` | Added `appendHttpLogs()` to `HttpWasmActions` |
| `frontend/src/stores/slices/httpWasmSlice.ts` | Added `appendHttpLogs` action; `executeHttpRequest` clears `httpLogs` at start |
| `frontend/src/App.tsx` | Handles `http_wasm_log` via `appendHttpLogs`; `http_wasm_request_completed` updates response only |

---

## Key Invariants for Future Work

- **`fastedge-run` stays alive** between requests. It only exits on `SIGINT`/`SIGTERM` from
  `HttpWasmRunner.cleanup()`. The live iframe relies on this — do not add single-shot logic.
- **Runner port is dynamic** (8100–8199, allocated by `PortManager`). Never hardcode a port.
  Always read `httpRunnerPort` from the Zustand store.
- **Live mode resets to false** when a new WASM is loaded (local state in `ResponsePanel`).
  This is intentional: each new WASM load should default back to the safe static preview.
- **`httpRunnerPort` is `null` for proxy-wasm** — the Live toggle and Open in Browser button are
  disabled in that case. These features are HTTP WASM only.
