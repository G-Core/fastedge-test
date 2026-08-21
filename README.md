# @gcoredev/fastedge-test

Test FastEdge WASM binaries programmatically — no server required. Use it in CI pipelines, agent scripts, or alongside your existing test runner (vitest, jest, etc.).

Supports both FastEdge binary types:
- **CDN (proxy-wasm)** — request/response filter binaries
- **HTTP-WASM** — component model HTTP handler binaries

The WASM type is detected automatically from the binary.

## Installation

```bash
npm install @gcoredev/fastedge-test
# or
pnpm add @gcoredev/fastedge-test
```

**Requirements**: Node.js 18+

## Two Ways to Use This Package

### 1. Headless test framework (CI / scripts)

Import the test framework to test WASM binaries programmatically — no server, no browser:

| Import | Purpose |
|--------|---------|
| `@gcoredev/fastedge-test` | Low-level runner — load and execute WASM directly |
| `@gcoredev/fastedge-test/test` | High-level test framework — define and run structured test suites |

Start with `@gcoredev/fastedge-test/test` unless you need direct runner control.

### 2. Local visual debugger (browser UI)

Run a local server with a browser UI, REST API, and WebSocket log streaming — useful for interactive debugging without VSCode:

```bash
npx @gcoredev/fastedge-test
# Opens http://localhost:5179
```

If port 5179 is already in use, the server automatically tries the next port sequentially (up to 10 attempts, e.g. 5179–5188). The bound port is written to `.fastedge-debug/.debug-port` and deleted on shutdown. Set `PORT` to bypass auto-increment when a predictable port is required:

```bash
PORT=8080 npx @gcoredev/fastedge-test
```

See **[Local Debugger Server](docs/LOCAL_SERVER.md)** for the full guide including programmatic usage, REST API access, and WebSocket log streaming.

---

## Quick Start

### CDN (proxy-wasm)

```typescript
import { defineTestSuite, runAndExit, runFlow } from '@gcoredev/fastedge-test/test';
import { assertRequestHeader, assertFinalStatus } from '@gcoredev/fastedge-test/test';

const suite = defineTestSuite({
  wasmPath: './build/my-cdn-app.wasm',
  tests: [
    {
      name: 'injects x-custom header',
      run: async (runner) => {
        const result = await runFlow(runner, {
          url: 'https://example.com/page',
          method: 'GET',
          requestHeaders: { 'user-agent': 'Mozilla/5.0' },
          responseStatus: 200,
        });

        assertRequestHeader(result.hookResults.onRequestHeaders, 'x-custom', 'expected-value');
      },
    },
    {
      name: 'blocks /admin with 403',
      run: async (runner) => {
        const result = await runFlow(runner, { url: 'https://example.com/admin' });
        assertFinalStatus(result, 403);
      },
    },
  ],
});

await runAndExit(suite);
// Output:
//   ✓ injects x-custom header (12ms)
//   ✓ blocks /admin with 403 (5ms)
//   2/2 passed in 17ms
```

### HTTP-WASM (component model)

```typescript
import { defineTestSuite, runAndExit } from '@gcoredev/fastedge-test/test';

const suite = defineTestSuite({
  wasmPath: './build/my-http-app.wasm',
  tests: [
    {
      name: 'responds with 200 OK',
      run: async (runner) => {
        const response = await runner.execute({
          path: '/api/hello',
          method: 'GET',
          headers: { 'content-type': 'application/json' },
        });

        if (response.status !== 200) {
          throw new Error(`Expected 200, got ${response.status}`);
        }
      },
    },
  ],
});

await runAndExit(suite);
```

---

## Test Suite API

### `defineTestSuite(config)`

Validates and returns a typed suite definition.

```typescript
type TestSuite =
  | { wasmPath: string;   runnerConfig?: RunnerConfig; tests: TestCase[] }
  | { wasmBuffer: Buffer; runnerConfig?: RunnerConfig; tests: TestCase[] }
```

Exactly one of `wasmPath` or `wasmBuffer` is required — TypeScript enforces this at compile time.

```typescript
interface RunnerConfig {
  dotenvEnabled?: boolean;                  // Load .env file (default: false)
  enforceProductionPropertyRules?: boolean; // CDN property access control (default: true)
}
```

### `runTestSuite(suite)` → `SuiteResult`

Runs all tests sequentially. Each test gets a fresh, isolated runner instance.

```typescript
interface SuiteResult {
  passed: number;
  failed: number;
  total: number;
  durationMs: number;
  results: TestResult[];
}

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}
```

### `runAndExit(suite)`

Runs the suite, prints a summary to stdout, and exits with code `0` (all passed) or `1` (any failures). Designed for CI scripts and Makefile targets.

### `runFlow(runner, options)` — CDN helper

Convenience wrapper around the full CDN request/response flow. Accepts named options and derives HTTP/2 pseudo-headers from the URL automatically.

```typescript
interface FlowOptions {
  url: string;
  method?: string;                           // Default: 'GET'
  requestHeaders?: Record<string, string>;
  requestBody?: string;
  responseStatus?: number;                   // Default: 200
  responseStatusText?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  properties?: Record<string, unknown>;
  enforceProductionPropertyRules?: boolean;  // Default: true
}
```

Returns a `FullFlowResult` containing `hookResults`, `finalResponse`, and `calculatedProperties`.

### `loadConfigFile(path)` — Reuse `fastedge-config.test.json`

Load and validate a `fastedge-config.test.json` file, returning a typed `TestConfig`.

```typescript
import { loadConfigFile, defineTestSuite, runAndExit } from '@gcoredev/fastedge-test/test';

const config = await loadConfigFile('./fastedge-config.test.json');

const suite = defineTestSuite({
  wasmPath: './build/app.wasm',
  tests: [
    {
      name: 'uses config properties',
      run: async (runner) => {
        const result = await runFlow(runner, {
          url: 'https://example.com',
          properties: config.properties,
        });
      },
    },
  ],
});
```

---

## Assertion Helpers

All helpers throw a descriptive `Error` on failure — compatible with any test framework or plain try/catch.

### Request / Response Headers (CDN)

```typescript
assertRequestHeader(hookResult, 'x-custom')               // header exists
assertRequestHeader(hookResult, 'x-custom', 'value')      // header equals value
assertNoRequestHeader(hookResult, 'x-should-not-exist')

assertResponseHeader(hookResult, 'cache-control', 'no-store')
assertNoResponseHeader(hookResult, 'x-sensitive')
```

### Final Response (CDN full flow)

```typescript
assertFinalStatus(fullFlowResult, 200)
assertFinalHeader(fullFlowResult, 'content-type', 'application/json')
```

### Hook Return Code

```typescript
assertReturnCode(hookResult, 0)   // 0 = Ok, 1 = Pause
```

### Logs

```typescript
assertLog(hookResult, 'cache hit')          // at least one log contains substring
assertNoLog(hookResult, 'error')            // no log contains substring
const found = logsContain(hookResult, 'x')  // boolean — for conditional logic
```

### CDN Property Access

```typescript
assertPropertyAllowed(hookResult, 'client.ip')    // access was permitted
assertPropertyDenied(hookResult, 'internal.key')  // access was denied
const violated = hasPropertyAccessViolation(hookResult)
```

---

## Integrating with Vitest / Jest

The assertion helpers throw plain `Error` instances, so they work inside any test framework:

```typescript
import { describe, it } from 'vitest';
import { createRunner } from '@gcoredev/fastedge-test';
import { runFlow, assertFinalStatus } from '@gcoredev/fastedge-test/test';

describe('my CDN app', () => {
  it('returns 200 for homepage', async () => {
    const runner = await createRunner('./build/app.wasm');
    try {
      const result = await runFlow(runner, { url: 'https://example.com/' });
      assertFinalStatus(result, 200);
    } finally {
      await runner.cleanup();
    }
  });
});
```

Or let `defineTestSuite` manage lifecycle and inspect `SuiteResult` inside your test:

```typescript
it('all flows pass', async () => {
  const suite = defineTestSuite({ wasmPath: './build/app.wasm', tests: [...] });
  const results = await runTestSuite(suite);
  expect(results.failed).toBe(0);
});
```

---

## Low-Level Runner API

For cases needing direct runner control:

```typescript
import { createRunner, createRunnerFromBuffer } from '@gcoredev/fastedge-test';

// From file path (preferred — faster startup, less memory)
const runner = await createRunner('./build/app.wasm');

// From buffer (e.g. fetched from URL or built in-memory)
const buffer = await fs.readFile('./build/app.wasm');
const runner = await createRunnerFromBuffer(buffer);

// CDN: run full request/response flow
const result = await runner.callFullFlow(
  'https://example.com', 'GET',
  {}, '',          // request headers, body
  {}, '',          // response headers, body
  200, 'OK',       // response status
  {},              // properties
  true,            // enforce production property rules
);

// HTTP-WASM: execute a request
const response = await runner.execute({
  path: '/api/hello',
  method: 'GET',
  headers: {},
});

// Always clean up when done
await runner.cleanup();
```

---

## JSON Schemas

The package ships JSON Schema files for `fastedge-config.test.json` and all API request/response bodies, enabling IDE autocomplete and validation.

Reference from `fastedge-config.test.json` for VS Code autocomplete:

```json
{
  "$schema": "./node_modules/@gcoredev/fastedge-test/schemas/fastedge-config.test.schema.json",
  "envVars": {},
  "secrets": {},
  "properties": {}
}
```

---

## CI / GitHub Actions Example

```yaml
- name: Test FastEdge WASM
  run: node test/my-suite.js
```

Where `test/my-suite.js`:

```typescript
import { defineTestSuite, runAndExit, runFlow } from '@gcoredev/fastedge-test/test';
import { assertFinalStatus } from '@gcoredev/fastedge-test/test';

await runAndExit(defineTestSuite({
  wasmPath: './build/app.wasm',
  tests: [
    {
      name: 'homepage returns 200',
      run: async (runner) => {
        assertFinalStatus(await runFlow(runner, { url: 'https://example.com/' }), 200);
      },
    },
  ],
}));
```

---

## Documentation

- **[Local Debugger Server](docs/LOCAL_SERVER.md)** — running the visual debugger UI, npx usage, programmatic `startServer()`, REST API quickstart
- **[Test Framework Guide](docs/TEST_FRAMEWORK.md)** — full API reference, all assertion helpers, examples
- **[REST API Reference](docs/API.md)** — HTTP endpoints for server-based testing (UI / WebSocket)
- **[WASM Loading Guide](docs/HYBRID_LOADING.md)** — path vs buffer tradeoffs and performance data
- **[Repository](https://github.com/G-Core/fastedge-debugger)** — source code, issues, contributing

---

## License

MIT
