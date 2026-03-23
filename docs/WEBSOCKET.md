# WebSocket API

Real-time event stream from the `@gcoredev/fastedge-test` server to connected clients.

## Connection

Connect to the WebSocket server at:

```
ws://localhost:{port}/ws
```

where `{port}` is the port the server is running on (default `5179`).

```typescript
const ws = new WebSocket("ws://localhost:5179/ws");

ws.addEventListener("open", () => {
  console.log("Connected");
});

ws.addEventListener("message", (event) => {
  const data = JSON.parse(event.data);
  console.log(data.type, data);
});
```

### Connection Lifecycle

| Phase | Description |
|---|---|
| Connect | Server sends a `connection_status` event immediately on connection |
| Active | Server broadcasts events as they occur; server pings every 15 seconds |
| Ping/Pong | Server uses WebSocket-level `ping` frames; clients must respond with `pong` (most WebSocket clients do this automatically) |
| Timeout | Clients that do not respond to pings within 30 seconds are terminated |
| Disconnect | Connection closes normally; remaining clients receive an updated `connection_status` |

## Event Format

All events share a common envelope:

```typescript
interface BaseEvent {
  type: string;       // Event discriminator
  timestamp: number;  // Unix milliseconds (Date.now())
  source: "ui" | "ai_agent" | "api" | "system";
  data: object;       // Event-specific payload
}
```

Events are delivered as JSON strings. Parse with `JSON.parse(event.data)` and switch on `type`.

## Event Types

### wasm_loaded

Fired when a WASM binary has been loaded and is ready for execution.

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

| Field | Description |
|---|---|
| `filename` | Name of the loaded WASM file |
| `size` | File size in bytes |
| `runnerPort` | Port used by the runner process, or `null` if not applicable |
| `wasmType` | Whether this is a proxy-wasm or http-wasm binary |
| `resolvedPath` | Absolute path to the file on disk, or `null` |

```json
{
  "type": "wasm_loaded",
  "timestamp": 1742738400000,
  "source": "api",
  "data": {
    "filename": "my-filter.wasm",
    "size": 204800,
    "runnerPort": 8080,
    "wasmType": "proxy-wasm",
    "resolvedPath": "/home/user/project/my-filter.wasm"
  }
}
```

---

### request_started

Fired at the beginning of a request execution, before any hooks run.

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
  "timestamp": 1742738400000,
  "source": "api",
  "data": {
    "url": "https://example.com/api/resource",
    "method": "GET",
    "headers": {
      "accept": "application/json",
      "x-forwarded-for": "1.2.3.4"
    }
  }
}
```

---

### hook_executed

Fired after each individual proxy-wasm hook completes. Multiple `hook_executed` events may be emitted per request.

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

| Field | Description |
|---|---|
| `hook` | Hook name (e.g. `on_request_headers`, `on_response_headers`) |
| `returnCode` | The action code returned by the hook, or `null` |
| `logCount` | Number of log lines emitted by this hook |
| `input` | Request and response state passed into the hook |
| `output` | Request and response state after the hook ran |

```json
{
  "type": "hook_executed",
  "timestamp": 1742738400000,
  "source": "system",
  "data": {
    "hook": "on_request_headers",
    "returnCode": 0,
    "logCount": 2,
    "input": {
      "request": {
        "headers": { ":method": "GET", ":path": "/api/resource" },
        "body": ""
      },
      "response": { "headers": {}, "body": "" }
    },
    "output": {
      "request": {
        "headers": { ":method": "GET", ":path": "/api/resource", "x-added": "value" },
        "body": ""
      },
      "response": { "headers": {}, "body": "" }
    }
  }
}
```

---

### request_completed

Fired when all hooks have run and the request execution is complete. Contains the aggregated results and final response.

```typescript
interface RequestCompletedEvent {
  type: "request_completed";
  timestamp: number;
  source: EventSource;
  data: {
    hookResults: Record<string, any>;
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

| Field | Description |
|---|---|
| `hookResults` | Map of hook name to result data |
| `finalResponse` | The HTTP response produced by the filter |
| `finalResponse.isBase64` | If `true`, `body` is base64-encoded binary data |
| `calculatedProperties` | Property values computed during execution, if any |

```json
{
  "type": "request_completed",
  "timestamp": 1742738400000,
  "source": "system",
  "data": {
    "hookResults": {
      "on_request_headers": { "returnCode": 0 }
    },
    "finalResponse": {
      "status": 200,
      "statusText": "OK",
      "headers": { "content-type": "application/json" },
      "body": "{\"ok\":true}",
      "contentType": "application/json",
      "isBase64": false
    },
    "calculatedProperties": {
      "my_property": "computed_value"
    }
  }
}
```

---

### request_failed

Fired when request execution fails due to an error (e.g. WASM trap, invalid input).

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
  "timestamp": 1742738400000,
  "source": "system",
  "data": {
    "error": "WASM execution failed",
    "details": "RuntimeError: unreachable executed at offset 0x1a2b"
  }
}
```

---

### properties_updated

Fired when the set of proxy-wasm properties is updated on the server.

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

`properties` is the full current property map after the update — not a diff.

```json
{
  "type": "properties_updated",
  "timestamp": 1742738400000,
  "source": "api",
  "data": {
    "properties": {
      "plugin.name": "my-filter",
      "plugin.vm_id": "vm1"
    }
  }
}
```

---

### http_wasm_request_completed

Fired when an http-wasm filter finishes processing a request. Equivalent to `request_completed` but for http-wasm binaries.

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
  "timestamp": 1742738400000,
  "source": "system",
  "data": {
    "response": {
      "status": 403,
      "statusText": "Forbidden",
      "headers": { "content-type": "text/plain" },
      "body": "Access denied",
      "contentType": "text/plain",
      "isBase64": false
    }
  }
}
```

---

### http_wasm_log

Fired for each log line emitted by an http-wasm filter. These are streamed in real-time during both single-execution and live-mode runs.

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

| `level` | Meaning |
|---|---|
| `0` | Trace |
| `1` | Debug |
| `2` | Info |
| `3` | Warn |
| `4` | Error |
| `5` | Critical |

```json
{
  "type": "http_wasm_log",
  "timestamp": 1742738400000,
  "source": "system",
  "data": {
    "level": 2,
    "message": "Processing request to /api/resource"
  }
}
```

---

### connection_status

Fired on initial connection and whenever the connected client count changes (a client connects or disconnects). Can also be received in response to a client `ping` message.

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

| Field | Description |
|---|---|
| `connected` | Always `true` when received (connection is established) |
| `clientCount` | Total number of currently connected WebSocket clients |

```json
{
  "type": "connection_status",
  "timestamp": 1742738400000,
  "source": "system",
  "data": {
    "connected": true,
    "clientCount": 2
  }
}
```

## Client Messages

The WebSocket channel is primarily server → client. The only message clients can send is a `ping` to check connectivity:

```json
{ "type": "ping" }
```

The server responds with a `connection_status` event. All other commands (loading WASM, executing requests, updating properties) are performed via the HTTP REST API.

## See Also

- [API.md](./API.md) — REST endpoints for executing requests, loading WASM, and updating properties
- [TEST_FRAMEWORK.md](./TEST_FRAMEWORK.md) — Using WebSocket events within test suites
- [RUNNER.md](./RUNNER.md) — Starting the server and configuring the port
