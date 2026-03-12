# FastEdge Debugger REST API Documentation

## Overview

The FastEdge Debugger provides a comprehensive REST API for programmatic testing and debugging of FastEdge applications. This API enables AI agents, CI/CD pipelines, and automated testing tools to interact with the debugger.

**Base URL**: `http://localhost:5179`

**Default Ports**:
- REST API & Web UI: `5179`
- WebSocket (logs): `5178`

## Authentication

Currently, no authentication is required. The debugger is intended for local development use only.

## API Endpoints

### Health Check

Check if the debugger server is running and healthy.

**Endpoint**: `GET /health`

**Response**:
```json
{
  "status": "ok"
}
```

**Status Codes**:
- `200 OK`: Server is healthy and running

**Example**:
```bash
curl http://localhost:5179/health
```

---

### Load WASM Module

Load a WebAssembly module into the debugger. This must be called before executing any requests.

**Endpoint**: `POST /api/load`

**Request Body**:
```json
{
  "wasmBase64": "string",      // Base64-encoded WASM binary (provide this OR wasmPath)
  "wasmPath": "string",        // Absolute path to WASM file on disk (provide this OR wasmBase64)
  "dotenvEnabled": boolean     // Enable .env file loading (optional, default: true)
}
```

**Response**:
```json
{
  "ok": true,
  "wasmType": "http-wasm" | "proxy-wasm"
}
```

**Status Codes**:
- `200 OK`: WASM loaded successfully
- `400 Bad Request`: Missing or invalid wasmBase64
- `500 Internal Server Error`: Failed to load WASM

**Example**:
```bash
# Read WASM file and encode to base64
WASM_BASE64=$(base64 -w 0 ./dist/app.wasm)

# Load into debugger
curl -X POST http://localhost:5179/api/load \
  -H "Content-Type: application/json" \
  -d "{\"wasmBase64\": \"$WASM_BASE64\", \"dotenvEnabled\": true}"
```

**Notes**:
- The debugger automatically detects whether the WASM is HTTP or CDN (proxy-wasm) type
- Previous WASM modules are automatically cleaned up when loading a new one
- Set `X-Source` header to track the source of the load (e.g., "cli", "vscode", "ci")

---

### Execute Request

Execute an HTTP request or CDN full flow against the loaded WASM module.

**Endpoint**: `POST /api/execute`

**Request Body**:

For **HTTP WASM**:
```json
{
  "url": "string",              // Full URL or path (required)
  "method": "string",           // HTTP method (optional, default: "GET")
  "headers": object,            // Request headers (optional)
  "body": "string"              // Request body (optional)
}
```

For **CDN (Proxy WASM)**:
```json
{
  "url": "string",              // Target URL (required)
  "request": {
    "method": "string",         // HTTP method (optional, default: "GET")
    "headers": object,          // Request headers (optional)
    "body": "string"            // Request body (optional)
  },
  "response": {
    "body": "string",           // Origin response body (optional)
    "status": number,           // HTTP status code (optional, default: 200)
    "statusText": "string",     // Status text (optional)
    "headers": object           // Response headers (optional)
  },
  "properties": object          // CDN properties (optional)
}
```

**Response**:

For **HTTP WASM**:
```json
{
  "ok": true,
  "status": number,
  "statusText": "string",
  "headers": object,
  "body": "string",
  "contentType": "string",
  "isBase64": boolean
}
```

For **CDN (Proxy WASM)**:
```json
{
  "ok": true,
  "hookResults": {
    "onRequestHeader": object,
    "onRequestBody": object,
    "onResponseHeader": object,
    "onResponseBody": object
  },
  "finalResponse": {
    "status": number,
    "statusText": "string",
    "headers": object,
    "body": "string"
  },
  "calculatedProperties": object
}
```

**Status Codes**:
- `200 OK`: Request executed successfully
- `400 Bad Request`: No WASM loaded or invalid request
- `500 Internal Server Error`: Execution failed

**Examples**:

**HTTP WASM** - Simple GET:
```bash
curl -X POST http://localhost:5179/api/execute \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://localhost/api/test",
    "method": "GET"
  }'
```

**HTTP WASM** - POST with body:
```bash
curl -X POST http://localhost:5179/api/execute \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://localhost/api/data",
    "method": "POST",
    "headers": {
      "Content-Type": "application/json",
      "Authorization": "Bearer token123"
    },
    "body": "{\"key\": \"value\"}"
  }'
```

**CDN (Proxy WASM)** - Full flow:
```bash
curl -X POST http://localhost:5179/api/execute \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/page",
    "request": {
      "method": "GET",
      "headers": {
        "User-Agent": "Mozilla/5.0"
      }
    },
    "response": {
      "body": "<html>Original content</html>",
      "status": 200,
      "headers": {
        "Content-Type": "text/html"
      }
    },
    "properties": {
      "client.ip": "1.2.3.4",
      "request.path": "/page"
    }
  }'
```

---

### Get Configuration

Retrieve the current test configuration including environment variables and properties.

**Endpoint**: `GET /api/config`

**Response**:
```json
{
  "ok": true,
  "config": {
    "envVars": object,
    "secrets": object,
    "properties": object
  }
}
```

**Status Codes**:
- `200 OK`: Configuration retrieved
- `404 Not Found`: No configuration file exists

**Example**:
```bash
curl http://localhost:5179/api/config
```

---

### Update Configuration

Update the test configuration including environment variables, secrets, and properties.

**Endpoint**: `POST /api/config`

**Request Body**:
```json
{
  "config": {
    "envVars": {
      "DEBUG": "true",
      "API_URL": "https://api.example.com"
    },
    "secrets": {
      "api_key": "secret_name"
    },
    "properties": {
      "client.ip": "1.2.3.4",
      "request.path": "/test"
    }
  }
}
```

**Response**:
```json
{
  "ok": true
}
```

**Status Codes**:
- `200 OK`: Configuration updated
- `400 Bad Request`: Missing config in request body
- `500 Internal Server Error`: Failed to save configuration

**Example**:
```bash
curl -X POST http://localhost:5179/api/config \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "envVars": {
        "DEBUG": "true",
        "LOG_LEVEL": "verbose"
      }
    }
  }'
```

**Notes**:
- Configuration is saved to `fastedge-config.test.json` in the project root
- Environment variables are available to the WASM module via `getEnv()`
- Properties are used for CDN (proxy-wasm) applications
- Configuration must be set BEFORE loading the WASM module to take effect

---

## WebSocket API

The debugger provides real-time log streaming via WebSocket.

**Endpoint**: `ws://localhost:5178/ws` (or port specified by `WS_PORT` env var)

**Events**:

### WASM Loaded
```json
{
  "type": "wasm_loaded",
  "data": {
    "name": "binary.wasm",
    "size": 123456,
    "timestamp": "2025-01-15T10:30:00Z",
    "source": "ui" | "cli" | "vscode"
  }
}
```

### HTTP Request Completed
```json
{
  "type": "http_request_completed",
  "data": {
    "response": {
      "status": 200,
      "statusText": "OK",
      "headers": {...},
      "body": "...",
      "contentType": "text/html"
    },
    "timestamp": "2025-01-15T10:30:01Z",
    "source": "ui"
  }
}
```

### CDN Request Completed
```json
{
  "type": "request_completed",
  "data": {
    "hookResults": {...},
    "finalResponse": {...},
    "calculatedProperties": {...},
    "timestamp": "2025-01-15T10:30:01Z",
    "source": "ui"
  }
}
```

### Request Failed
```json
{
  "type": "request_failed",
  "data": {
    "message": "Error message",
    "error": "Error details",
    "timestamp": "2025-01-15T10:30:01Z",
    "source": "ui"
  }
}
```

### Properties Updated
```json
{
  "type": "properties_updated",
  "data": {
    "properties": {...},
    "timestamp": "2025-01-15T10:30:01Z",
    "source": "ui"
  }
}
```

### Console Log
```json
{
  "type": "console_log",
  "data": {
    "message": "Log message from WASM",
    "level": "info" | "warn" | "error",
    "timestamp": "2025-01-15T10:30:01Z"
  }
}
```

**Example WebSocket Client** (Node.js):
```javascript
import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:5178/ws');

ws.on('open', () => {
  console.log('Connected to debugger WebSocket');
});

ws.on('message', (data) => {
  const event = JSON.parse(data.toString());
  console.log('Event:', event.type, event.data);
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});
```

---

## Common Workflows

### Complete Test Workflow

```bash
#!/bin/bash
set -e

# 1. Check health
curl -f http://localhost:5179/health || exit 1

# 2. Update configuration
curl -X POST http://localhost:5179/api/config \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "envVars": {
        "DEBUG": "true",
        "API_URL": "https://api.example.com"
      }
    }
  }'

# 3. Load WASM
WASM_BASE64=$(base64 -w 0 ./dist/app.wasm)
curl -X POST http://localhost:5179/api/load \
  -H "Content-Type: application/json" \
  -d "{\"wasmBase64\": \"$WASM_BASE64\"}"

# 4. Execute test requests
curl -X POST http://localhost:5179/api/execute \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://localhost/",
    "method": "GET"
  }' | jq .

curl -X POST http://localhost:5179/api/execute \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://localhost/api/data",
    "method": "POST",
    "headers": {"Content-Type": "application/json"},
    "body": "{\"test\": \"data\"}"
  }' | jq .

echo "Tests completed successfully!"
```

### CI/CD Integration

```yaml
# .github/workflows/test.yml
- name: Test with FastEdge Debugger
  run: |
    # Start debugger
    cd fastedge-debugger
    npm start &
    DEBUGGER_PID=$!

    # Wait for health check
    timeout 30 bash -c 'until curl -f http://localhost:5179/health; do sleep 1; done'

    # Build and test application
    cd ../my-app
    npm run build

    # Run automated tests
    ./test-scripts/run-tests.sh

    # Cleanup
    kill $DEBUGGER_PID
```

---

## Error Handling

All API endpoints return consistent error responses:

```json
{
  "ok": false,
  "error": "Error message describing what went wrong"
}
```

**Common Error Scenarios**:

1. **WASM not loaded**:
   - Status: `400`
   - Message: "No WASM module loaded. Call /api/load first."

2. **Invalid parameters**:
   - Status: `400`
   - Message: Specific parameter that's missing or invalid

3. **Execution failure**:
   - Status: `500`
   - Message: Error from WASM execution

4. **Configuration error**:
   - Status: `404` or `500`
   - Message: Configuration file issue

---

## Rate Limiting

Currently, no rate limiting is enforced. The debugger is designed for local development use.

---

## Best Practices

1. **Always check health** before running tests
2. **Set configuration BEFORE loading WASM** - env vars must be set before module initialization
3. **Use descriptive X-Source headers** - helps with debugging and tracking
4. **Clean shutdown** - ensure proper cleanup in CI/CD scripts
5. **Monitor WebSocket** for real-time logs and debugging
6. **Test incrementally** - test simple endpoints before complex flows
7. **Use absolute paths** for WASM files to avoid path resolution issues

---

## Environment Variables

Configure the debugger server:

- `PORT` - HTTP server port (default: 5179)
- `WS_PORT` - WebSocket port (default: 5178)
- `PROXY_RUNNER_DEBUG` - Enable debug logging (set to "1")

Example:
```bash
PORT=3000 WS_PORT=3001 npm start
```

---

## Version

**API Version**: 1.0.0
**Debugger Version**: See package.json

---

## Support

For issues, questions, or contributions:
- Repository: https://github.com/G-Core/fastedge-debugger
- Issues: https://github.com/G-Core/fastedge-debugger/issues

---

## Related Documentation

- **User Guide**: See README.md for web UI usage
- **Development**: See DEVELOPMENT.md for contributing
- **Architecture**: See context/architecture/ for implementation details
