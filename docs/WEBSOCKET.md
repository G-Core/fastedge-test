# WebSocket API

Real-time event stream from the `@gcoredev/fastedge-test` server to connected clients.

> **Note on header values.** All header fields in this protocol use `Record<string, string | string[]>` — single-valued headers are a `string`, multi-valued headers (notably `Set-Cookie` per RFC 6265) are a `string[]`. HTTP-wasm response headers additionally allow `undefined` values (`Record<string, string | string[] | undefined>`), though `undefined` entries are dropped during JSON serialization. JSON examples below use `Record<string, string>` for brevity.

## Connection

Connect to the WebSocket server at:

```
ws://localhost:{port}/ws
```

where `{port}` is the port the server is running on (default `5179`).

```javascript
const ws = new WebSocket("ws://localhost:5179/ws");

ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  console.log(msg.type, msg.data);
});
```

### Lifecycle

1. **Connect** — the server accepts all connections and immediately sends a `connection_status` event confirming the connection and the current client count.
2. **Ping / pong** — the server sends WebSocket `ping` frames every 15 seconds. Clients that have not responded within 30 seconds are terminated. Standard WebSocket clients handle pong automatically.
3. **Disconnect** — when a client disconnects, the server broadcasts an updated `connection_status` to remaining clients.

## Event Format

Every event shares a common envelope:

```typescript
interface BaseEvent {
  type: string;      // event discriminant
  timestamp: number; // Unix ms
  source: "ui" | "ai_agent" | "api" | "system";
  data: object;      // event-specific payload
}
```

| Field       | Type                                       | Description                                         |
| ----------- | ------------------------------------------ | --------------------------------------------------- |
| `type`      | `string`                                   | Event discriminant — one of the values listed below |
| `timestamp` | `number`                                   | Unix epoch in milliseconds                          |
| `source`    | `'ui' \| 'ai_agent' \| 'api' \| 'system'` | What triggered the event                            |
| `data`      | `object`                                   | Event-specific payload                              |

## Event Types

### wasm_loaded

Fired when a WASM binary has been loaded and is ready to handle requests.

```typescript
interface WasmLoadedEvent {
  type: "wasm_loaded";
  timestamp: number;
  source: "ui" | "ai_agent" | "api" | "system";
  data: {
    filename: string;
    size: number;
    runnerPort?: number | null;
    wasmType: "proxy-wasm" | "http-wasm";
    resolvedPath?: string | null;
  };
}
```

| Field           | Type                          | Description                                                          |
| --------------- | ----------------------------- | -------------------------------------------------------------------- |
| `filename`      | `string`                      | Name of the loaded WASM file                                         |
| `size`          | `number`                      | File size in bytes                                                   |
| `runnerPort?`   | `number \| null`              | Port the runner is listening on, if applicable. Omitted when not set |
| `wasmType`      | `'proxy-wasm' \| 'http-wasm'` | The WASM filter type                                                 |
| `resolvedPath?` | `string \| null`              | Absolute filesystem path to the loaded binary. Omitted when not set  |

**Example:**

```json
{
  "type": "wasm_loaded",
  "timestamp": 1742734800000,
  "source": "api",
  "data": {
    "filename": "filter.wasm",
    "size": 204800,
    "runnerPort": 8081,
    "wasmType": "proxy-wasm",
    "resolvedPath": "/workspace/filter.wasm"
  }
}
```

---

### request_started

Fired when the server begins processing an incoming request through the WASM filter.

```typescript
interface RequestStartedEvent {
  type: "request_started";
  timestamp: number;
  source: "ui" | "ai_agent" | "api" | "system";
  data: {
    url: string;
    method: string;
    headers: Record<string, string | string[]>;
  };
}
```

| Field     | Type                                 | Description                       |
| --------- | ------------------------------------ | --------------------------------- |
| `url`     | `string`                             | Full request URL                  |
| `method`  | `string`                             | HTTP method (`GET`, `POST`, etc.) |
| `headers` | `Record<string, string \| string[]>` | Request headers                   |

**Example:**

```json
{
  "type": "request_started",
  "timestamp": 1742734800100,
  "source": "api",
  "data": {
    "url": "https://example.com/api/resource",
    "method": "GET",
    "headers": {
      "host": "example.com",
      "user-agent": "curl/8.0"
    }
  }
}
```

---

### hook_executed

Fired after each individual proxy-wasm hook completes. Multiple `hook_executed` events are emitted per request — one per hook phase that runs.

Hook names are camelCase: `onRequestHeaders`, `onRequestBody`, `onResponseHeaders`, `onResponseBody`.

```typescript
interface HookExecutedEvent {
  type: "hook_executed";
  timestamp: number;
  source: "ui" | "ai_agent" | "api" | "system";
  data: {
    hook: string;
    returnCode: number | null;
    logCount: number;
    input: {
      request: { headers: Record<string, string | string[]>; body: string };
      response: { headers: Record<string, string | string[]>; body: string };
    };
    output: {
      request: { headers: Record<string, string | string[]>; body: string };
      response: { headers: Record<string, string | string[]>; body: string };
    };
  };
}
```

| Field        | Type             | Description                                                |
| ------------ | ---------------- | ---------------------------------------------------------- |
| `hook`       | `string`         | Hook name (e.g. `onRequestHeaders`)                        |
| `returnCode` | `number \| null` | Return code from the WASM filter, or `null` if unavailable |
| `logCount`   | `number`         | Number of log lines emitted during this hook               |
| `input`      | `object`         | Request and response state passed into the hook            |
| `output`     | `object`         | Request and response state after the hook ran              |

**Example:**

```json
{
  "type": "hook_executed",
  "timestamp": 1742734800200,
  "source": "api",
  "data": {
    "hook": "onRequestHeaders",
    "returnCode": 0,
    "logCount": 2,
    "input": {
      "request": {
        "headers": { "host": "example.com" },
        "body": ""
      },
      "response": {
        "headers": {},
        "body": ""
      }
    },
    "output": {
      "request": {
        "headers": { "host": "example.com", "x-injected": "true" },
        "body": ""
      },
      "response": {
        "headers": {},
        "body": ""
      }
    }
  }
}
```

---

### request_completed

Fired when all hook phases have completed and a final response is available.

`hookResults` keys are camelCase hook names (`onRequestHeaders`, `onRequestBody`, `onResponseHeaders`, `onResponseBody`).

```typescript
interface RequestCompletedEvent {
  type: "request_completed";
  timestamp: number;
  source: "ui" | "ai_agent" | "api" | "system";
  data: {
    hookResults: Record<string, any>;
    finalResponse: {
      status: number;
      statusText: string;
      headers: Record<string, string | string[]>;
      body: string;
      contentType: string;
      isBase64?: boolean;
    };
    calculatedProperties?: Record<string, unknown>;
  };
}
```

| Field                       | Type                                   | Description                                           |
| --------------------------- | -------------------------------------- | ----------------------------------------------------- |
| `hookResults`               | `Record<string, any>`                  | Per-hook execution results, keyed by hook name        |
| `finalResponse.status`      | `number`                               | HTTP status code                                      |
| `finalResponse.statusText`  | `string`                               | HTTP status text                                      |
| `finalResponse.headers`     | `Record<string, string \| string[]>`   | Response headers                                      |
| `finalResponse.body`        | `string`                               | Response body (may be base64 if `isBase64` is `true`) |
| `finalResponse.contentType` | `string`                               | Content-Type of the response                          |
| `finalResponse.isBase64`    | `boolean \| undefined`                 | Whether `body` is base64-encoded                      |
| `calculatedProperties`      | `Record<string, unknown> \| undefined` | Properties computed during execution, if any          |

**Example:**

```json
{
  "type": "request_completed",
  "timestamp": 1742734800500,
  "source": "api",
  "data": {
    "hookResults": {
      "onRequestHeaders": { "returnCode": 0 },
      "onResponseHeaders": { "returnCode": 0 }
    },
    "finalResponse": {
      "status": 200,
      "statusText": "OK",
      "headers": { "content-type": "application/json" },
      "body": "{\"ok\":true}",
      "contentType": "application/json",
      "isBase64": false
    },
    "calculatedProperties": {}
  }
}
```

---

### request_failed

Fired when request processing fails before a response can be produced.

```typescript
interface RequestFailedEvent {
  type: "request_failed";
  timestamp: number;
  source: "ui" | "ai_agent" | "api" | "system";
  data: {
    error: string;
    details?: string;
  };
}
```

| Field     | Type                  | Description                                        |
| --------- | --------------------- | -------------------------------------------------- |
| `error`   | `string`              | Short error message                                |
| `details` | `string \| undefined` | Extended error detail or stack trace, if available |

**Example:**

```json
{
  "type": "request_failed",
  "timestamp": 1742734800300,
  "source": "api",
  "data": {
    "error": "WASM execution error",
    "details": "RuntimeError: memory access out of bounds"
  }
}
```

---

### properties_updated

Fired when the set of active properties changes (e.g. after a properties configuration update).

```typescript
interface PropertiesUpdatedEvent {
  type: "properties_updated";
  timestamp: number;
  source: "ui" | "ai_agent" | "api" | "system";
  data: {
    properties: Record<string, string>;
  };
}
```

| Field        | Type                     | Description                                |
| ------------ | ------------------------ | ------------------------------------------ |
| `properties` | `Record<string, string>` | Full current property map after the update |

**Example:**

```json
{
  "type": "properties_updated",
  "timestamp": 1742734800050,
  "source": "ui",
  "data": {
    "properties": {
      "plugin.name": "my-filter",
      "plugin.version": "1.0.0"
    }
  }
}
```

---

### http_wasm_request_completed

Fired when an http-wasm filter finishes processing a request and a response is available.

```typescript
interface HttpWasmRequestCompletedEvent {
  type: "http_wasm_request_completed";
  timestamp: number;
  source: "ui" | "ai_agent" | "api" | "system";
  data: {
    response: {
      status: number;
      statusText: string;
      headers: Record<string, string | string[] | undefined>;
      body: string;
      contentType: string | null;
      isBase64?: boolean;
    };
  };
}
```

`response.headers` mirrors Node's `IncomingHttpHeaders` — `undefined` values are dropped during JSON serialization and will not appear on the wire.

| Field                  | Type                                              | Description                                           |
| ---------------------- | ------------------------------------------------- | ----------------------------------------------------- |
| `response.status`      | `number`                                          | HTTP status code                                      |
| `response.statusText`  | `string`                                          | HTTP status text                                      |
| `response.headers`     | `Record<string, string \| string[] \| undefined>` | Response headers (`undefined` values omitted in JSON) |
| `response.body`        | `string`                                          | Response body (may be base64 if `isBase64` is `true`) |
| `response.contentType` | `string \| null`                                  | Content-Type, or `null` if absent                     |
| `response.isBase64`    | `boolean \| undefined`                            | Whether `body` is base64-encoded                      |

**Example:**

```json
{
  "type": "http_wasm_request_completed",
  "timestamp": 1742734800600,
  "source": "api",
  "data": {
    "response": {
      "status": 200,
      "statusText": "OK",
      "headers": { "content-type": "text/plain" },
      "body": "Hello, world!",
      "contentType": "text/plain",
      "isBase64": false
    }
  }
}
```

---

### http_wasm_log

Fired in real-time as the http-wasm filter emits log lines during both execute and live modes. One event is emitted per log line.

```typescript
interface HttpWasmLogEvent {
  type: "http_wasm_log";
  timestamp: number;
  source: "ui" | "ai_agent" | "api" | "system";
  data: {
    level: number;
    message: string;
  };
}
```

| Field     | Type     | Description       |
| --------- | -------- | ----------------- |
| `level`   | `number` | Numeric log level |
| `message` | `string` | Log message text  |

**Example:**

```json
{
  "type": "http_wasm_log",
  "timestamp": 1742734800250,
  "source": "api",
  "data": {
    "level": 2,
    "message": "processing request to /api/resource"
  }
}
```

---

### connection_status

Fired by the server in three situations:

1. Immediately after a client connects (sent only to the connecting client).
2. When any client connects or disconnects (broadcast to all clients).
3. In response to a client `ping` message.

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

| Field         | Type      | Description                                                      |
| ------------- | --------- | ---------------------------------------------------------------- |
| `connected`   | `boolean` | Always `true` when received (indicates this client is connected) |
| `clientCount` | `number`  | Total number of currently connected clients including this one   |

**Example:**

```json
{
  "type": "connection_status",
  "timestamp": 1742734800010,
  "source": "system",
  "data": {
    "connected": true,
    "clientCount": 1
  }
}
```

## Client Messages

The server accepts one client-to-server message type over WebSocket.

### ping

Requests a `connection_status` response from the server. Useful for verifying the connection is alive at the application level, independent of the underlying WebSocket ping/pong frames.

```json
{ "type": "ping" }
```

The server responds by sending a `connection_status` event to the requesting client.

All other commands (loading WASM, triggering requests, updating properties) are submitted via the REST API, not over WebSocket.

## See Also

- `API.md` — REST endpoints for triggering requests, loading WASM, and updating properties
- `TEST_FRAMEWORK.md` — Using WebSocket events in automated tests
