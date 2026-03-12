# FastEdge Test Framework

`@gcoredev/fastedge-test` provides a programmatic API for testing FastEdge WASM binaries — no server required. Use it in CI pipelines, agent scripts, or alongside your existing test runner (vitest, jest, etc.).

## Installation

```bash
npm install @gcoredev/fastedge-test
# or
pnpm add @gcoredev/fastedge-test
```

## Two Entry Points

| Import | Purpose |
|--------|---------|
| `@gcoredev/fastedge-test` | Low-level runner — load and execute WASM directly |
| `@gcoredev/fastedge-test/test` | High-level test framework — define and run structured test suites |

---

## High-Level: Test Suites

The `./test` entry point is the recommended starting point. It manages the runner lifecycle for you — each test case gets a fresh, isolated runner instance.

### CDN (Proxy-WASM) Example

```typescript
import { defineTestSuite, runTestSuite, runFlow } from '@gcoredev/fastedge-test/test';
import {
  assertRequestHeader,
  assertFinalStatus,
  assertLog,
} from '@gcoredev/fastedge-test/test';

const suite = defineTestSuite({
  wasmPath: './build/my-cdn-app.wasm',
  tests: [
    {
      name: 'injects x-custom header on request',
      run: async (runner) => {
        const result = await runFlow(runner, {
          url: 'https://example.com/page',
          method: 'GET',
          requestHeaders: { 'user-agent': 'Mozilla/5.0' },
          responseBody: '<html>content</html>',
          responseStatus: 200,
        });

        assertRequestHeader(
          result.hookResults.onRequestHeaders,
          'x-custom',
          'expected-value',
        );
      },
    },
    {
      name: 'returns 403 for blocked paths',
      run: async (runner) => {
        const result = await runFlow(runner, {
          url: 'https://example.com/admin',
          method: 'GET',
        });

        assertFinalStatus(result, 403);
      },
    },
  ],
});

const results = await runTestSuite(suite);
console.log(`${results.passed}/${results.total} passed`);
```

### HTTP-WASM Example

HTTP-WASM binaries (component model) use `runner.execute()` instead of `runFlow()`:

```typescript
import { defineTestSuite, runTestSuite } from '@gcoredev/fastedge-test/test';

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

await runTestSuite(suite);
```

The WASM type (CDN vs HTTP) is detected automatically from the binary.

---

## `defineTestSuite(config)`

Validates and returns a typed suite definition. Throws if the config is invalid.

```typescript
type TestSuite =
  | { wasmPath: string;   runnerConfig?: RunnerConfig; tests: TestCase[] }
  | { wasmBuffer: Buffer; runnerConfig?: RunnerConfig; tests: TestCase[] }
```

Exactly one of `wasmPath` or `wasmBuffer` must be provided — TypeScript enforces this at compile time.

### `RunnerConfig`

```typescript
interface RunnerConfig {
  dotenvEnabled?: boolean;                  // Load .env file (default: false)
  enforceProductionPropertyRules?: boolean; // CDN property access control (default: true)
}
```

---

## `runTestSuite(suite)`

Executes all test cases and returns a `SuiteResult`. Tests run sequentially; each gets its own runner instance.

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
  error?: string;   // Set when passed is false
  durationMs: number;
}
```

---

## `runAndExit(suite)` — CI / Standalone Scripts

Runs the suite, prints a summary to stdout, and exits the process. Exit code 0 = all passed, 1 = any failures.

```typescript
import { defineTestSuite, runAndExit } from '@gcoredev/fastedge-test/test';

const suite = defineTestSuite({ ... });

await runAndExit(suite);
// Output:
//   ✓ injects x-custom header (12ms)
//   ✗ returns 403 for blocked paths (5ms)
//       Expected final response status 403, got 200
//
//   1/2 passed in 17ms
```

Designed for use in Makefile targets, shell scripts, and CI pipelines where a non-zero exit code signals failure.

---

## `runFlow(runner, options)` — CDN Helper

A convenience wrapper around the low-level `runner.callFullFlow()` that accepts named options and automatically derives HTTP/2 pseudo-headers (`:method`, `:path`, `:authority`, `:scheme`) from the URL.

```typescript
interface FlowOptions {
  url: string;
  method?: string;                           // Default: 'GET'
  requestHeaders?: Record<string, string>;
  requestBody?: string;
  responseStatus?: number;                   // Default: 200
  responseStatusText?: string;               // Default: 'OK'
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  properties?: Record<string, unknown>;
  enforceProductionPropertyRules?: boolean;  // Default: true
}
```

Returns a `FullFlowResult`:

```typescript
interface FullFlowResult {
  hookResults: Record<string, HookResult>; // Keys: 'onRequestHeaders', 'onRequestBody', etc.
  finalResponse: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
    contentType: string;
    isBase64?: boolean;
  };
  calculatedProperties?: Record<string, unknown>;
}
```

Each `HookResult` contains:

```typescript
interface HookResult {
  returnCode: number | null;
  logs: { level: number; message: string }[];
  input: {
    request: { headers: Record<string, string>; body: string };
    response: { headers: Record<string, string>; body: string };
  };
  output: {
    request: { headers: Record<string, string>; body: string };
    response: { headers: Record<string, string>; body: string };
  };
  properties: Record<string, unknown>;
}
```

---

## Assertion Helpers

All helpers throw a descriptive `Error` on failure — compatible with any test framework or plain try/catch.

### Request Headers (CDN)

```typescript
// Assert a header is present (and optionally matches a value)
assertRequestHeader(hookResult, 'x-custom')
assertRequestHeader(hookResult, 'x-custom', 'expected-value')

// Assert a header is absent
assertNoRequestHeader(hookResult, 'x-should-not-exist')
```

### Response Headers (CDN)

```typescript
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
assertReturnCode(hookResult, 0) // 0 = Ok, 1 = Pause
```

### Logs

```typescript
assertLog(hookResult, 'cache hit')         // At least one log contains substring
assertNoLog(hookResult, 'error')           // No log contains substring
const found = logsContain(hookResult, 'x') // Boolean — for conditional logic
```

### CDN Property Access

```typescript
assertPropertyAllowed(hookResult, 'client.ip')   // Access was permitted
assertPropertyDenied(hookResult, 'internal.key') // Access was denied
const violated = hasPropertyAccessViolation(hookResult) // Boolean
```

---

## `loadConfigFile(path)` — Reuse `fastedge-config.test.json`

Load and validate a `fastedge-config.test.json` file, returning a typed `TestConfig`. Throws with a descriptive error if the file is missing, invalid JSON, or fails schema validation.

```typescript
import { loadConfigFile, defineTestSuite, runAndExit } from '@gcoredev/fastedge-test/test';

const config = await loadConfigFile('./fastedge-config.test.json');

const suite = defineTestSuite({
  wasmPath: './build/app.wasm',
  tests: [
    {
      name: 'uses env var from config',
      run: async (runner) => {
        // config.envVars, config.secrets, config.properties available here
        const result = await runFlow(runner, {
          url: 'https://example.com',
          properties: config.properties,
        });
        // ...
      },
    },
  ],
});

await runAndExit(suite);
```

---

## Low-Level: Runner API

For cases where you need direct control over the runner lifecycle — or want to integrate with an existing test framework — use the root entry point.

```typescript
import { createRunner, createRunnerFromBuffer } from '@gcoredev/fastedge-test';

// From a file path
const runner = await createRunner('./build/app.wasm');

// From a buffer (e.g. fetched from a URL or built in-memory)
const buffer = await fs.readFile('./build/app.wasm');
const runner = await createRunnerFromBuffer(buffer);

// CDN: run the full request/response flow
const result = await runner.callFullFlow(
  'https://example.com',  // url
  'GET',                  // method
  {},                     // request headers
  '',                     // request body
  {},                     // response headers
  '',                     // response body
  200,                    // response status
  'OK',                   // response status text
  {},                     // properties
  true,                   // enforce production property rules
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

> **Tip**: Prefer `runFlow()` from `@gcoredev/fastedge-test/test` over `callFullFlow()` directly — it handles pseudo-headers and has named parameters.

---

## Integrating with Vitest / Jest

The assertion helpers throw plain `Error` instances, so they work naturally inside any test framework:

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

Or use `defineTestSuite` / `runTestSuite` to manage the lifecycle automatically and inspect `SuiteResult` inside your test:

```typescript
it('all flows pass', async () => {
  const suite = defineTestSuite({ wasmPath: './build/app.wasm', tests: [...] });
  const results = await runTestSuite(suite);
  expect(results.failed).toBe(0);
});
```

---

## JSON Schemas

The package ships JSON Schema files for `fastedge-config.test.json` and all API request/response bodies. These enable IDE autocomplete and validation.

```typescript
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const schema = require('@gcoredev/fastedge-test/schemas/test-config.schema.json');
```

Or reference them directly from `fastedge-config.test.json` for VS Code autocomplete:

```json
{
  "$schema": "./node_modules/@gcoredev/fastedge-test/schemas/test-config.schema.json",
  "envVars": {},
  "secrets": {},
  "properties": {}
}
```

---

## Related Documentation

- **REST API**: `docs/API.md` — HTTP endpoints for server-based testing
- **WASM Loading**: `docs/HYBRID_LOADING.md` — path vs buffer performance tradeoffs
