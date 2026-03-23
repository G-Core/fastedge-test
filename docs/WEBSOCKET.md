# WebSocket API

Real-time event stream from the test runner server to connected clients.

## Connection

Connect to the WebSocket server at:

```
ws://localhost:{port}/ws
```

Replace `{port}` with the port the server is running on (default: `5179`).

```javascript
const ws = new WebSocket('ws://localhost:5179/ws');

ws.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  console.log(data.type, data);
});
```

On connection, the server immediately sends a `connection_status` event confirming the connection and current client count.

## Connection Lifecycle

| Phase | Description |
|---|---|
| Connect | Client opens a WebSocket to `/ws`. Server sends `connection_status` with `connected: true`. |
| Active | Server broadcasts events to all connected clients as test runner state changes. |
| Ping/Pong | Server pings clients every 15 seconds. Clients inactive for more than 30 seconds are terminated. |
| Disconnect | Client closes the connection or is terminated. Remaining clients receive an updated `connection_status`. |

The WebSocket protocol's native ping/pong frames are used for keepalive — no application-level heartbeat is required.

## Event Format

All events share a common base structure:

```typescript
interface BaseEvent {
  type: string;
  timestamp: number;      // Unix milliseconds
  source: EventSource;    // "ui" | "ai_agent" | "api" | "system"
}
```

Every message is a JSON object. Parse with `JSON.parse(event.data)` and switch on `type` to handle specific events.

## Event Types

### wasm_loaded

Fired when a WASM binary has been loaded into the runner.

```typescript
interface WasmLoadedEvent {
  type: "wasm_loaded";
  timestamp: number;
  source: EventSource;
  data: {
    filename: string;
    size: number;
    runnerPort: number | null;
    wasmType: "proxy-wasm" | "http-wasm";
    resolvedPath: string | null;
  };
}
```

```json
{
  "type": "wasm_loaded",
  "timestamp": 1742652000000,
  "source": "api",
  "data": {
    "filename": "my-filter.wasm",
    "size": 204800,
    "runnerPort": 5179,
    "wasmType": "proxy-wasm",
    "resolvedPath": "/workspace/my-filter.wasm"
  }
}
```

### request_started

Fired when the runner begins executing a request against the loaded WASM.

```typescript
interface RequestStartedEvent {
  type: "request_started";
  timestamp: number;
  source: EventSource;
  data: {
    url: string;
    method: string;
    headers: Record<string, string>;
  };
}
```

```json
{
  "type": "request_started",
  "timestamp": 1742652001000,
  "source": "api",
  "data": {
    "url": "https://example.com/api/resource",
    "method": "GET",
    "headers": {
      "x-custom-header": "value",
      "content-type": "application/json"
    }
  }
}
```

### hook_executed

Fired each time an individual proxy-wasm hook completes during a request. Multiple `hook_executed` events may be emitted per request, one per hook invocation.

```typescript
interface HookExecutedEvent {
  type: "hook_executed";
  timestamp: number;
  source: EventSource;
  data: {
    hook: string;
    returnCode: number | null;
    logCount: number;
    input: {
      request: { headers: Record<string, string>; body: string };
      response: { headers: Record<string, string>; body: string };
    };
    output: {
      request: { headers: Record<string, string>; body: string };
      response: { headers: Record<string, string>; body: string };
    };
  };
}
```

```json
{
  "type": "hook_executed",
  "timestamp": 1742652001050,
  "source": "system",
  "data": {
    "hook": "on_http_request_headers",
    "returnCode": 0,
    "logCount": 2,
    "input": {
      "request": {
        "headers": { "x-forwarded-for": "1.2.3.4" },
        "body": ""
      },
      "response": { "headers": {}, "body": "" }
    },
    "output": {
      "request": {
        "headers": { "x-forwarded-for": "1.2.3.4", "x-added-by-wasm": "true" },
        "body": ""
      },
      "response": { "headers": {}, "body": "" }
    }
  }
}
```

### request_completed

Fired when all hooks for a request have completed and a final response has been determined.

```typescript
interface RequestCompletedEvent {
  type: "request_completed";
  timestamp: number;
  source: EventSource;
  data: {
    hookResults: Record<string, unknown>;
    finalResponse: {
      status: number;
      statusText: string;
      headers: Record<string, string>;
      body: string;
      contentType: string;
      isBase64?: boolean;
    };
    calculatedProperties?: Record<string, unknown>;
  };
}
```

```json
{
  "type": "request_completed",
  "timestamp": 1742652001200,
  "source": "system",
  "data": {
    "hookResults": {
      "on_http_request_headers": 0,
      "on_http_response_headers": 0
    },
    "finalResponse": {
      "status": 200,
      "statusText": "OK",
      "headers": { "content-type": "application/json" },
      "body": "{\"result\":\"ok\"}",
      "contentType": "application/json",
      "isBase64": false
    },
    "calculatedProperties": {
      "request.path": "/api/resource"
    }
  }
}
```

### request_failed

Fired when a request execution fails before completing all hooks.

```typescript
interface RequestFailedEvent {
  type: "request_failed";
  timestamp: number;
  source: EventSource;
  data: {
    error: string;
    details?: string;
  };
}
```

```json
{
  "type": "request_failed",
  "timestamp": 1742652001100,
  "source": "system",
  "data": {
    "error": "WASM trap: unreachable",
    "details": "Hook on_http_request_headers panicked at src/lib.rs:42"
  }
}
```

### properties_updated

Fired when the set of active proxy-wasm properties changes.

```typescript
interface PropertiesUpdatedEvent {
  type: "properties_updated";
  timestamp: number;
  source: EventSource;
  data: {
    properties: Record<string, string>;
  };
}
```

```json
{
  "type": "properties_updated",
  "timestamp": 1742652002000,
  "source": "api",
  "data": {
    "properties": {
      "request.path": "/api/resource",
      "upstream.address": "10.0.0.1"
    }
  }
}
```

### http_wasm_request_completed

Fired when an http-wasm request completes. Equivalent to `request_completed` for the http-wasm runtime.

```typescript
interface HttpWasmRequestCompletedEvent {
  type: "http_wasm_request_completed";
  timestamp: number;
  source: EventSource;
  data: {
    response: {
      status: number;
      statusText: string;
      headers: Record<string, string>;
      body: string;
      contentType: string | null;
      isBase64?: boolean;
    };
  };
}
```

```json
{
  "type": "http_wasm_request_completed",
  "timestamp": 1742652003000,
  "source": "system",
  "data": {
    "response": {
      "status": 403,
      "statusText": "Forbidden",
      "headers": { "content-type": "text/plain" },
      "body": "Blocked by policy",
      "contentType": "text/plain",
      "isBase64": false
    }
  }
}
```

### http_wasm_log

Fired for each log line emitted by an http-wasm module. Events are streamed in real-time during both execute and live modes.

```typescript
interface HttpWasmLogEvent {
  type: "http_wasm_log";
  timestamp: number;
  source: EventSource;
  data: {
    level: number;
    message: string;
  };
}
```

Log levels follow the proxy-wasm log level convention:

| Level | Meaning |
|---|---|
| `0` | trace |
| `1` | debug |
| `2` | info |
| `3` | warn |
| `4` | error |
| `5` | critical |

```json
{
  "type": "http_wasm_log",
  "timestamp": 1742652003050,
  "source": "system",
  "data": {
    "level": 2,
    "message": "Processing request to /api/resource"
  }
}
```

### connection_status

Sent by the server to all clients when a client connects or disconnects, and immediately to a newly connected client as a welcome message. Also sent in response to a client `ping` message (see [Client Messages](#client-messages)).

```typescript
interface ConnectionStatusEvent {
  type: "connection_status";
  timestamp: number;
  source: "system";
  data: {
    connected: boolean;
    clientCount: number;
  };
}
```

```json
{
  "type": "connection_status",
  "timestamp": 1742652000000,
  "source": "system",
  "data": {
    "connected": true,
    "clientCount": 1
  }
}
```

## Client Messages

The WebSocket channel is primarily server → client. One client-initiated message type is supported:

### ping

Send a `ping` message to request the server's current connection status without waiting for the next state change.

```json
{ "type": "ping" }
```

The server responds with a `connection_status` event sent only to the requesting client.

```javascript
ws.send(JSON.stringify({ type: 'ping' }));
```

All other control commands (loading WASM, executing requests, updating properties) are sent via the REST API documented in API.md.

## See Also

- [API Reference](API.md) — REST endpoints for controlling the test runner
- [Test Framework](TEST_FRAMEWORK.md) — Using WebSocket events in automated tests
- [Runner Guide](RUNNER.md) — Starting the server and configuration options
