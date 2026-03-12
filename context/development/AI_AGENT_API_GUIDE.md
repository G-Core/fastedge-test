# AI Agent API Guide

> **Full API reference**: [`docs/API.md`](../../docs/API.md)
>
> This file contains agent-specific guidance only. For endpoint details, request/response shapes, and examples, read `docs/API.md`.

---

## Agent-Specific Notes

### Use 127.0.0.1, not localhost

```bash
http://127.0.0.1:5179
```

Avoids IPv6 resolution delays that can slow down WebSocket connections when using `localhost`.

### Identify Your Requests with X-Source

```bash
-H "X-Source: ai_agent"
```

Shows up in the UI and server logs so humans can distinguish automated requests from manual ones. Visible in real-time to any connected UI client.

### All Logs Are Always Returned

The server captures all WASM logs at Trace level. There is no `logLevel` request parameter — it was removed. Filter by level client-side if needed:

```javascript
// Level values: 0=Trace, 1=Debug, 2=Info, 3=Warn, 4=Error, 5=Critical
const errors = hookResult.logs.filter(log => log.level >= 4);
```

### Real-Time UI Visibility

Every API call you make is broadcast to connected UI clients via WebSocket. Humans watching the UI will see your requests in real time — useful for collaborative debugging sessions.

### Verify WASM Load Before Testing

```bash
response=$(curl -s -X POST http://127.0.0.1:5179/api/load \
  -H "Content-Type: application/json" \
  -d "{\"wasmBase64\": \"$WASM_BASE64\"}")

if ! echo "$response" | jq -e '.ok' > /dev/null; then
  echo "Failed to load WASM: $response"
  exit 1
fi
```

---

## Prefer the Programmatic API for TDD

For structured test suites, use `@gcoredev/fastedge-test` instead of the HTTP API — no server required:

```typescript
import { defineTestSuite, runAndExit, runFlow } from '@gcoredev/fastedge-test/test';

const suite = defineTestSuite({
  wasmPath: './build/app.wasm',
  tests: [{ name: '...', run: async (runner) => { ... } }],
});

await runAndExit(suite);
```

See [`docs/TEST_FRAMEWORK.md`](../../docs/TEST_FRAMEWORK.md) for full documentation.
