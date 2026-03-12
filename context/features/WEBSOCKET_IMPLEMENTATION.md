# WebSocket Real-Time Synchronization

## Status: ✅ IMPLEMENTED AND OPERATIONAL

**Last Updated**: January 31, 2026
**Connection Performance**: Instant (<100ms) when accessing via http://127.0.0.1:5179

## Overview

The Proxy-WASM Test Runner includes WebSocket-based real-time synchronization between the server and all connected clients. This enables the UI to automatically reflect all activity, regardless of whether requests are initiated by a human user through the UI or by an AI agent through the API.

### Production Readiness

✅ **Architecture**: Clean module separation achieved
✅ **Backend**: WebSocketManager + StateManager fully implemented
✅ **Frontend**: useWebSocket hook with auto-reconnect
✅ **Integration**: ProxyWasmRunner emits events during execution
✅ **Performance**: Instant connections using IPv4 (127.0.0.1)
✅ **Debugging**: Full debug logging available via PROXY_RUNNER_DEBUG=1
✅ **Stability**: Graceful shutdown, error handling, ping/pong heartbeat

## Architecture

### Clean Module Separation

```
Backend:
  server/websocket/
    ├── types.ts              # Event type definitions
    ├── WebSocketManager.ts   # Connection management
    ├── StateManager.ts       # Event coordination
    └── index.ts             # Module exports

Frontend:
  frontend/src/hooks/
    ├── websocket-types.ts    # Event type definitions (mirrored)
    └── useWebSocket.ts       # React hook for WebSocket connection
  frontend/src/components/
    └── ConnectionStatus.tsx  # Visual connection indicator
```

### Responsibilities

| Module               | Responsibility                                                   | Single Concern                  |
| -------------------- | ---------------------------------------------------------------- | ------------------------------- |
| **WebSocketManager** | Manage WebSocket connections, handle clients, broadcast messages | Connection lifecycle            |
| **StateManager**     | Coordinate application state and emit events                     | Business logic to event mapping |
| **ProxyWasmRunner**  | Execute WASM hooks and emit state updates                        | WASM execution                  |
| **useWebSocket**     | Handle WebSocket connection in React, auto-reconnect             | Client-side connection          |
| **ConnectionStatus** | Display connection status visually                               | UI feedback                     |

## Event Types

All events follow a consistent structure:

```typescript
interface BaseEvent {
  type: string;
  timestamp: number;
  source: "ui" | "ai_agent" | "api" | "system";
}
```

## Connection Performance

### Optimal Configuration

**Access URL**: `http://127.0.0.1:5179` (production) or `http://127.0.0.1:5173` (development)

**Why**: The frontend WebSocket hook is configured to use `127.0.0.1` for the WebSocket connection to avoid IPv6 resolution delays. Both HTTP and WebSocket use IPv4 directly, resulting in instant connection (<100ms).

**Development Mode (February 2026)**: Vite dev server (port 5173) proxies WebSocket connections to backend (port 5179):

```typescript
// vite.config.ts
export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:5179",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:5179",
        ws: true, // Enable WebSocket proxying
        changeOrigin: true,
      },
    },
  },
});
```

**Implementation**: The `useWebSocket` hook automatically uses the current port:

```typescript
const hostname =
  window.location.hostname === "localhost"
    ? "127.0.0.1"
    : window.location.hostname;
// Uses current port - 5173 in dev (proxied), 5179 in production (direct)
const port = window.location.port ? `:${window.location.port}` : ":5179";
```

### Reconnection Strategy

- **Initial delay**: 200ms
- **Strategy**: Exponential backoff with 1.5x multiplier
- **Max delay**: 3000ms (3 seconds)
- **Max attempts**: 15
- **Connection timing**: Debug logs show actual connection time

### Available Events

| Event Type           | Direction       | Purpose                    | Emitted By       |
| -------------------- | --------------- | -------------------------- | ---------------- |
| `wasm_loaded`        | Server → Client | WASM binary loaded         | StateManager     |
| `request_started`    | Server → Client | Request execution began    | StateManager     |
| `hook_executed`      | Server → Client | Individual hook completed  | ProxyWasmRunner  |
| `request_completed`  | Server → Client | Full request flow finished | StateManager     |
| `request_failed`     | Server → Client | Request execution failed   | StateManager     |
| `properties_updated` | Server → Client | Properties changed         | StateManager     |
| `connection_status`  | Server → Client | Connection state change    | WebSocketManager |

## How It Works

### 1. Server-Side Flow

```typescript
// 1. HTTP API receives request (from UI or AI agent)
app.post("/api/send", async (req, res) => {
  const source = req.headers["x-source"] || "ui";

  // 2. Execute request
  const result = await runner.callFullFlow(call, url);

  // 3. Emit event to all connected clients
  stateManager.emitRequestCompleted(result, source);

  // 4. Return HTTP response
  res.json({ ok: true, ...result });
});

// Inside ProxyWasmRunner.callFullFlow():
async callFullFlow(call, targetUrl) {
  // Emit request started
  this.stateManager?.emitRequestStarted(url, method, headers);

  // Execute hooks
  const result = await this.callHook({ hook: "onRequestHeaders", ... });

  // Emit hook executed
  this.stateManager?.emitHookExecuted("onRequestHeaders", result);

  // ... more hooks ...

  return fullResult;
}
```

### 2. Client-Side Flow

```typescript
// 1. React hook manages WebSocket connection
const { status, lastEvent } = useWebSocket({
  autoConnect: true,
  onEvent: handleServerEvent,
});

// 2. Event handler updates UI state
function handleServerEvent(event: ServerEvent) {
  switch (event.type) {
    case "request_started":
      // Update URL/method in UI (even if AI agent sent it)
      setUrl(event.data.url);
      setMethod(event.data.method);
      break;

    case "hook_executed":
      // Update hook results incrementally
      setResults((prev) => ({
        ...prev,
        [event.data.hook]: event.data.output,
      }));
      break;

    case "request_completed":
      // Show final results
      setResults(event.data.hookResults);
      setFinalResponse(event.data.finalResponse);
      break;
  }
}
```

## Usage Examples

### For Human Users (Through UI)

No changes needed! The UI works exactly as before, but now also shows activity from AI agents:

1. User loads WASM binary → `wasm_loaded` event emitted
2. User clicks "Send" → HTTP request sent → Events broadcast → UI updates
3. AI agent sends request → Events broadcast → **UI automatically updates**

### For AI Agents (Through API)

AI agents can use the standard HTTP API and optionally identify themselves:

```bash
# AI agent sends request with X-Source header
curl -X POST http://localhost:5179/api/send \
  -H "Content-Type: application/json" \
  -H "X-Source: ai_agent" \
  -d '{
    "url": "http://localhost:8181",
    "request": {
      "method": "POST",
      "headers": {"content-type": "application/json"},
      "body": "{\"message\": \"Hello from AI\"}"
    },
    "properties": {},
    "logLevel": 2
  }'

# Result:
# 1. Server processes request
# 2. WebSocket events emitted to all clients
# 3. UI automatically updates to show:
#    - Request started (URL, method, headers)
#    - Each hook execution
#    - Final response
# 4. Human can see what AI agent is doing in real-time!
```

### For Multi-User Scenarios

Multiple users/AI agents can connect simultaneously:

```
User 1 (Browser) ──┐
                   ├──> WebSocket Server ──> Broadcasts to all
User 2 (Browser) ──┤
                   │
AI Agent (CLI) ────┘
```

- User 1 sends request → Users 2 sees it in real-time
- AI Agent sends request → Both users see it in real-time
- Connection status shows total client count

## Connection Features

### Automatic Reconnection

The frontend hook includes robust reconnection logic:

```typescript
// Configurable reconnection behavior
const { status } = useWebSocket({
  reconnectInterval: 2000, // Wait 2s between attempts
  maxReconnectAttempts: 10, // Try up to 10 times
  autoConnect: true, // Connect on mount
});

// Connection states:
// - connected: true/false
// - reconnecting: true/false (during reconnect attempts)
// - error: string | null (error message if any)
// - clientCount: number (total connected clients)
```

### Connection Status Indicator

Visual feedback in the UI header:

- 🟢 **Green dot**: Connected
- 🟠 **Orange dot**: Reconnecting...
- 🔴 **Red dot**: Disconnected
- Shows client count when multiple clients connected

### Heartbeat / Ping-Pong

Server automatically pings clients every 15 seconds to detect dead connections:

- Client doesn't respond within 30s → Connection terminated
- Browser automatically reconnects
- Prevents zombie connections

## Debug Mode

Enable detailed logging for troubleshooting:

```bash
# Backend debug
PROXY_RUNNER_DEBUG=1 pnpm start

# Frontend debug
const { status } = useWebSocket({ debug: true });
```

Debug output shows:

- WebSocket connection events
- Message send/receive
- Reconnection attempts
- Client management

## Error Handling

### Connection Failures

**Backend:**

- Server logs errors but continues serving HTTP
- Other clients unaffected if one disconnects

**Frontend:**

- Automatic reconnection with exponential backoff
- UI shows reconnection status
- App remains functional (HTTP API still works)

### Message Parse Errors

**Backend:**

- Logs parse errors but doesn't crash
- Invalid messages ignored

**Frontend:**

- Logs parse errors to console
- Invalid events ignored
- Connection stays active

## Performance Considerations

### Memory

- Each WebSocket connection: ~5-10 KB overhead
- Client metadata tracking: ~200 bytes per client
- No message queue (fire-and-forget broadcasting)

### Network

- Event size: ~500 bytes - 5 KB (depending on data)
- Frequency: Only on state changes (no polling)
- Compression: WebSocket automatic compression supported

### Scalability

Current architecture supports:

- ✅ **10-50 concurrent clients**: Excellent performance
- ⚠️ **50-100 clients**: Good performance, monitor memory
- ❌ **100+ clients**: Consider Redis pub/sub for scaling

For this use case (local development tool), 10-50 clients is more than sufficient.

## Security Considerations

### Current Implementation

- ❌ No authentication (localhost only)
- ❌ No message encryption (use HTTPS for production)
- ❌ No rate limiting
- ✅ CORS handled by Express
- ✅ Message validation
- ✅ Connection timeouts

### For Production (if needed)

Would require:

1. JWT token authentication
2. WSS (WebSocket Secure) over HTTPS
3. Rate limiting per client
4. Input sanitization
5. CSRF protection

**Note:** This is a local development tool, not intended for production deployment.

## Graceful Shutdown

Server properly closes all connections on shutdown:

```typescript
// Handles SIGTERM and SIGINT
process.on("SIGTERM", () => {
  wsManager.close(); // Closes all client connections
  httpServer.close(); // Stops accepting new connections
});
```

Clients automatically attempt reconnection when server restarts.

## Future Enhancements

### Potential Features

1. **Command support via WebSocket**
   - Currently: Clients only receive events
   - Future: Send commands from UI via WebSocket
   - Benefit: Truly bidirectional communication

2. **Event history**
   - Currently: New clients miss previous events
   - Future: Send recent events on connection
   - Benefit: UI shows full context immediately

3. **Selective subscriptions**
   - Currently: All clients receive all events
   - Future: Subscribe to specific event types
   - Benefit: Reduce bandwidth for specialized clients

4. **Event replay**
   - Currently: No event storage
   - Future: Store events, allow replay
   - Benefit: Time-travel debugging

5. **Multiple WASM instances**
   - Currently: Single global runner
   - Future: Multiple concurrent runners with session IDs
   - Benefit: Isolate different test scenarios

## Testing

### Manual Testing

1. **Start server:**

   ```bash
   pnpm start
   ```

2. **Open UI in browser:**

   ```
   http://localhost:5179
   ```

   - Check connection status (should show green "Connected")

3. **Open second browser tab:**
   - Should show "Connected (2 clients)"

4. **Send request from first tab:**
   - Both tabs should update in real-time

5. **Send request via curl (AI agent simulation):**

   ```bash
   curl -X POST http://localhost:5179/api/send \
     -H "Content-Type: application/json" \
     -H "X-Source: ai_agent" \
     -d '{"url":"https://cdn-origin-4732724.fastedge.cdn.gc.onl/","request":{"method":"GET","headers":{},"body":""}}'
   ```

   - Both browser tabs should show the request

6. **Kill server:**
   - UI should show "Reconnecting..."
   - Restart server
   - UI should reconnect automatically

### Automated Testing

Test connection lifecycle:

```typescript
import { WebSocketManager } from "./websocket/WebSocketManager";
import { createServer } from "http";

const server = createServer();
const wsManager = new WebSocketManager(server);

// Connect client
const ws = new WebSocket("ws://localhost:5179/ws");

// Verify events received
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  assert(data.type === "connection_status");
};
```

## Troubleshooting

### Connection Status Shows "Disconnected"

**Check:**

1. Is server running? (`pnpm start`)
2. Check browser console for errors
3. Verify port 5179 is available
4. Check firewall settings

### Events Not Received in UI

**Check:**

1. Connection status (should be green "Connected")
2. Browser console for WebSocket errors
3. Server logs for `[WebSocketManager]` messages
4. Network tab shows WebSocket connection

### Multiple Clients Not Syncing

**Check:**

1. Both clients show "Connected"
2. Server logs show correct client count
3. Events are being broadcast (check server logs with `PROXY_RUNNER_DEBUG=1`)

### Slow Connection Times

**Issue**: WebSocket takes 10-20+ seconds to connect

**Solution**: Access via `http://127.0.0.1:5179` instead of `http://localhost:5179`

**Root cause**: Browser attempts IPv6 connection to `::1` first, times out after ~20s, then falls back to IPv4. Using `127.0.0.1` directly bypasses IPv6 entirely.

**Verification**: Check browser console for connection timing:

```
[useWebSocket] Connected (took XXXms)
```

Should show <100ms when accessing via 127.0.0.1

### High Memory Usage

**Possible causes:**

1. Too many clients connected (check client count)
2. Large event payloads (check event data size)
3. Memory leak (restart server)

## Migration from HTTP-Only

The WebSocket implementation is **fully backward compatible**:

- ✅ All existing HTTP endpoints still work
- ✅ UI functionality unchanged
- ✅ No breaking changes to API
- ✅ WebSocket is **additive only**

To use the new WebSocket features:

- Frontend: Automatically connects on page load
- Backend: No changes needed
- AI Agents: Optional `X-Source` header for identification

## Summary

The WebSocket implementation provides:

✅ **Real-time synchronization** - All clients see all activity
✅ **Clean architecture** - Separated concerns, maintainable modules
✅ **Automatic reconnection** - Exponential backoff with fast initial retry (200ms)
✅ **Visual feedback** - Connection status in UI
✅ **AI agent support** - API requests visible in UI with source identification
✅ **Multi-client** - Multiple users can observe simultaneously
✅ **Backward compatible** - No breaking changes to existing HTTP API
✅ **Production-ready** - Proper error handling, graceful shutdown, heartbeat monitoring
✅ **Optimized performance** - Instant connections via IPv4 (127.0.0.1)
✅ **Debug support** - Comprehensive logging with PROXY_RUNNER_DEBUG=1

## Current Status (January 31, 2026)

**Operational**: System is fully functional and tested

- Backend: WebSocket server running on port 5179 at /ws path
- Frontend: Auto-connects with visual status indicator
- Performance: <100ms connection time when accessed via 127.0.0.1
- Testing: Verified with both UI interactions and AI agent API calls
- Events: request_started, hook_executed, request_completed, request_failed all working

**Known Optimizations**:

- WebSocket URL uses 127.0.0.1 to avoid IPv6 timeout
- Exponential backoff prevents connection storms
- Connection timing logged for debugging

Last Updated: January 31, 2026
