# Test Framework API

High-level API for defining and running WASM test suites against the FastEdge runtime.

## Import

```typescript
import {
  defineTestSuite,
  runTestSuite,
  runAndExit,
  runFlow,
  loadConfigFile,
  assertRequestHeader,
  assertResponseHeader,
  assertFinalStatus,
  // ... other assertions
} from '@gcoredev/fastedge-test/test';
```

## Types

### TestSuite

A discriminated union requiring exactly one of `wasmPath` or `wasmBuffer`. Supplying both or neither is a TypeScript compile-time error.

```typescript
type TestSuiteBase = {
  runnerConfig?: RunnerConfig;
  tests: TestCase[];
};

type TestSuite =
  | (TestSuiteBase & { wasmPath: string; wasmBuffer?: never })
  | (TestSuiteBase & { wasmBuffer: Buffer; wasmPath?: never });
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `wasmPath` | `string` | One of | Filesystem path to the `.wasm` file |
| `wasmBuffer` | `Buffer` | One of | Pre-loaded WASM binary |
| `runnerConfig` | `RunnerConfig` | No | Runner configuration (see [RUNNER.md](RUNNER.md)) |
| `tests` | `TestCase[]` | Yes | At least one test case |

### TestCase

```typescript
interface TestCase {
  name: string;
  run: (runner: IWasmRunner) => Promise<void>;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Display name shown in test output |
| `run` | `(runner: IWasmRunner) => Promise<void>` | Test body; throw or use assertion helpers to fail |

Each test case receives a fresh, fully loaded runner instance. Tests are isolated — state does not carry between cases.

### TestResult & SuiteResult

```typescript
interface TestResult {
  name: string;
  passed: boolean;
  error?: string;      // Present when passed is false
  durationMs: number;
}

interface SuiteResult {
  passed: number;
  failed: number;
  total: number;
  durationMs: number;
  results: TestResult[];
}
```

### FlowOptions

Object-based alternative to the low-level runner `callFullFlow` method. HTTP/2 pseudo-headers (`:method`, `:path`, `:authority`, `:scheme`) are derived automatically from `url` and `method` and can be overridden via `requestHeaders`.

```typescript
interface FlowOptions {
  url: string;
  method?: string;
  requestHeaders?: Record<string, string>;
  requestBody?: string;
  responseStatus?: number;
  responseStatusText?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  properties?: Record<string, unknown>;
  enforceProductionPropertyRules?: boolean;
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `url` | `string` | — | Full request URL (required) |
| `method` | `string` | `"GET"` | HTTP method |
| `requestHeaders` | `Record<string, string>` | `{}` | Additional request headers; override derived pseudo-headers here |
| `requestBody` | `string` | `""` | Request body |
| `responseStatus` | `number` | `200` | Simulated upstream response status |
| `responseStatusText` | `string` | `"OK"` | Simulated upstream response status text |
| `responseHeaders` | `Record<string, string>` | `{}` | Simulated upstream response headers |
| `responseBody` | `string` | `""` | Simulated upstream response body |
| `properties` | `Record<string, unknown>` | `{}` | FastEdge property values available to the WASM module |
| `enforceProductionPropertyRules` | `boolean` | `true` | Enforce production FastEdge property access rules |

### RunnerConfig

Re-exported from the runner layer. See [RUNNER.md](RUNNER.md) for the full definition and all fields.

```typescript
import type { RunnerConfig } from '@gcoredev/fastedge-test/test';
```

## Functions

### defineTestSuite

```typescript
function defineTestSuite(suite: TestSuite): TestSuite
```

Validates and returns a typed `TestSuite` definition. Throws if neither `wasmPath` nor `wasmBuffer` is provided, or if `tests` is empty.

```typescript
import { defineTestSuite } from '@gcoredev/fastedge-test/test';

const suite = defineTestSuite({
  wasmPath: './dist/my-filter.wasm',
  tests: [
    {
      name: 'adds custom header',
      async run(runner) {
        const result = await runner.callOnRequestHeaders(/* ... */);
        // assertions here
      },
    },
  ],
});
```

### runTestSuite

```typescript
function runTestSuite(suite: TestSuite): Promise<SuiteResult>
```

Executes all test cases in the suite sequentially. Each test receives a fresh runner instance; the runner is cleaned up after each test regardless of pass or fail. Returns a `SuiteResult` — does not throw and does not call `process.exit`.

```typescript
import { runTestSuite } from '@gcoredev/fastedge-test/test';

const result = await runTestSuite(suite);
console.log(`${result.passed}/${result.total} passed`);
```

### runAndExit

```typescript
function runAndExit(suite: TestSuite): Promise<never>
```

Runs the suite via `runTestSuite`, prints a summary to stdout, then calls `process.exit`. Exits with code `0` if all tests pass, `1` if any fail. Intended for standalone Node.js test scripts and CI pipelines.

Output format:

```
  ✓ adds custom header (12ms)
  ✗ removes forbidden header (8ms)
      Expected request header 'x-internal' to be absent, but found 'secret'

  1/2 passed in 20ms
```

```typescript
import { defineTestSuite, runAndExit } from '@gcoredev/fastedge-test/test';

const suite = defineTestSuite({ wasmPath: './dist/filter.wasm', tests: [...] });
await runAndExit(suite);
```

### runFlow

```typescript
function runFlow(runner: IWasmRunner, options: FlowOptions): Promise<FullFlowResult>
```

Object-based wrapper around the runner's full-flow execution. Derives HTTP/2 pseudo-headers from `url` and `method` automatically. Any pseudo-headers supplied in `requestHeaders` take precedence over the derived defaults.

Must be called inside a `TestCase.run` function with the runner provided by the framework.

```typescript
import { runFlow, assertFinalStatus } from '@gcoredev/fastedge-test/test';

{
  name: 'returns 403 for blocked path',
  async run(runner) {
    const result = await runFlow(runner, {
      url: 'https://example.com/admin',
      method: 'GET',
      responseStatus: 200,
    });
    assertFinalStatus(result, 403);
  },
}
```

### loadConfigFile

```typescript
function loadConfigFile(configPath: string): Promise<TestConfig>
```

Reads and validates a `fastedge-config.test.json` file from disk. Throws with a descriptive message if the file cannot be read, is not valid JSON, or fails schema validation. See [TEST_CONFIG.md](TEST_CONFIG.md) for the config file schema.

```typescript
import { loadConfigFile } from '@gcoredev/fastedge-test/test';

const config = await loadConfigFile('./fastedge-config.test.json');
```

## Assertion Helpers

All assertion helpers throw an `Error` on failure and return `void` on success (except `logsContain` and `hasPropertyAccessViolation`, which return `boolean`). They are compatible with any test framework or plain `try/catch`.

### Request Headers

```typescript
function assertRequestHeader(
  result: HookResult,
  name: string,
  expectedValue?: string,
): void
```

Asserts that `name` is present in the hook's output request headers. If `expectedValue` is provided, also asserts the value matches exactly.

```typescript
assertRequestHeader(hookResult, 'x-forwarded-for');
assertRequestHeader(hookResult, 'x-custom', 'my-value');
```

---

```typescript
function assertNoRequestHeader(result: HookResult, name: string): void
```

Asserts that `name` is absent from the hook's output request headers.

```typescript
assertNoRequestHeader(hookResult, 'x-internal-secret');
```

### Response Headers

```typescript
function assertResponseHeader(
  result: HookResult,
  name: string,
  expectedValue?: string,
): void
```

Asserts that `name` is present in the hook's output response headers. If `expectedValue` is provided, also asserts the value matches exactly.

```typescript
assertResponseHeader(hookResult, 'cache-control');
assertResponseHeader(hookResult, 'cache-control', 'no-store');
```

---

```typescript
function assertNoResponseHeader(result: HookResult, name: string): void
```

Asserts that `name` is absent from the hook's output response headers.

```typescript
assertNoResponseHeader(hookResult, 'x-debug-info');
```

### Final Response

These operate on a `FullFlowResult` returned by `runFlow` or the runner's full-flow method, not on individual hook results.

```typescript
function assertFinalStatus(result: FullFlowResult, expectedStatus: number): void
```

Asserts the final HTTP response status code.

```typescript
assertFinalStatus(flowResult, 200);
assertFinalStatus(flowResult, 403);
```

---

```typescript
function assertFinalHeader(
  result: FullFlowResult,
  name: string,
  expectedValue?: string,
): void
```

Asserts that `name` is present in the final response headers. If `expectedValue` is provided, also asserts the value matches exactly.

```typescript
assertFinalHeader(flowResult, 'x-cache-status');
assertFinalHeader(flowResult, 'x-cache-status', 'HIT');
```

### Return Code

```typescript
function assertReturnCode(result: HookResult, expectedCode: number): void
```

Asserts the hook return code. Common values: `0` = Ok (continue), `1` = Pause.

```typescript
assertReturnCode(hookResult, 0); // hook completed normally
```

### Logs

```typescript
function assertLog(result: HookResult, messageSubstring: string): void
```

Asserts that at least one log entry contains `messageSubstring`.

```typescript
assertLog(hookResult, 'cache miss');
```

---

```typescript
function assertNoLog(result: HookResult, messageSubstring: string): void
```

Asserts that no log entry contains `messageSubstring`.

```typescript
assertNoLog(hookResult, 'ERROR');
```

---

```typescript
function logsContain(result: HookResult, messageSubstring: string): boolean
```

Returns `true` if any log entry contains `messageSubstring`. Non-throwing; use for conditional logic in tests.

```typescript
if (logsContain(hookResult, 'cache miss')) {
  // assert cache-miss specific behaviour
}
```

### Properties

```typescript
function hasPropertyAccessViolation(result: HookResult): boolean
```

Returns `true` if any log entry records a property access denial. Non-throwing.

```typescript
const blocked = hasPropertyAccessViolation(hookResult);
```

---

```typescript
function assertPropertyAllowed(result: HookResult, propertyPath: string): void
```

Asserts that access to `propertyPath` was not denied.

```typescript
assertPropertyAllowed(hookResult, 'request.id');
```

---

```typescript
function assertPropertyDenied(result: HookResult, propertyPath: string): void
```

Asserts that access to `propertyPath` was denied.

```typescript
assertPropertyDenied(hookResult, 'upstream.address');
```

## CI Integration

`runAndExit` is the standard entry point for CI. It prints a human-readable summary and terminates the process with an appropriate exit code:

| Outcome | Exit code |
|---------|-----------|
| All tests pass | `0` |
| One or more tests fail | `1` |

A minimal CI test script:

```typescript
// test/run.ts
import { defineTestSuite, runAndExit } from '@gcoredev/fastedge-test/test';

const suite = defineTestSuite({
  wasmPath: process.env.WASM_PATH ?? './dist/filter.wasm',
  tests: [ /* ... */ ],
});

await runAndExit(suite);
```

```json
// package.json
{
  "scripts": {
    "test:wasm": "node --import tsx/esm test/run.ts"
  }
}
```

In a GitHub Actions workflow:

```yaml
- name: Run WASM tests
  run: pnpm test:wasm
  env:
    WASM_PATH: dist/filter.wasm
```

The process exits non-zero on any failure, which causes the CI step to fail automatically.

## Complete Example

A full test suite covering request manipulation, response headers, property access, and blocked requests:

```typescript
import {
  defineTestSuite,
  runAndExit,
  runFlow,
  assertRequestHeader,
  assertNoRequestHeader,
  assertResponseHeader,
  assertFinalStatus,
  assertFinalHeader,
  assertLog,
  assertNoLog,
  assertPropertyAllowed,
  assertPropertyDenied,
} from '@gcoredev/fastedge-test/test';

const suite = defineTestSuite({
  wasmPath: './dist/cdn-filter.wasm',
  runnerConfig: {
    logLevel: 'warn',
  },
  tests: [
    {
      name: 'injects x-request-id on all requests',
      async run(runner) {
        const result = await runFlow(runner, {
          url: 'https://cdn.example.com/assets/logo.png',
          method: 'GET',
        });
        assertFinalStatus(result, 200);
        assertFinalHeader(result, 'x-request-id');
      },
    },

    {
      name: 'strips internal headers before forwarding upstream',
      async run(runner) {
        const result = await runner.callOnRequestHeaders({
          ':method': 'GET',
          ':path': '/api/data',
          ':authority': 'cdn.example.com',
          ':scheme': 'https',
          'x-internal-token': 'secret',
        });
        assertNoRequestHeader(result, 'x-internal-token');
      },
    },

    {
      name: 'adds cache-control header on response',
      async run(runner) {
        const result = await runFlow(runner, {
          url: 'https://cdn.example.com/static/app.js',
          method: 'GET',
          responseStatus: 200,
          responseHeaders: { 'content-type': 'application/javascript' },
        });
        assertFinalHeader(result, 'cache-control', 'public, max-age=86400');
      },
    },

    {
      name: 'blocks requests to /admin with 403',
      async run(runner) {
        const result = await runFlow(runner, {
          url: 'https://cdn.example.com/admin',
          method: 'GET',
        });
        assertFinalStatus(result, 403);
      },
    },

    {
      name: 'logs cache decision',
      async run(runner) {
        const result = await runner.callOnRequestHeaders({
          ':method': 'GET',
          ':path': '/cacheable-resource',
          ':authority': 'cdn.example.com',
          ':scheme': 'https',
        });
        assertLog(result, 'cache');
        assertNoLog(result, 'ERROR');
      },
    },

    {
      name: 'allows access to request.id property',
      async run(runner) {
        const result = await runner.callOnRequestHeaders({
          ':method': 'GET',
          ':path': '/',
          ':authority': 'cdn.example.com',
          ':scheme': 'https',
        });
        assertPropertyAllowed(result, 'request.id');
      },
    },

    {
      name: 'denies access to upstream.address in production mode',
      async run(runner) {
        const result = await runFlow(runner, {
          url: 'https://cdn.example.com/',
          method: 'GET',
          enforceProductionPropertyRules: true,
        });
        // Access to upstream.address is restricted in production
        assertPropertyDenied(
          result.onRequestHeadersResult,
          'upstream.address',
        );
      },
    },

    {
      name: 'handles POST with body',
      async run(runner) {
        const result = await runFlow(runner, {
          url: 'https://cdn.example.com/api/submit',
          method: 'POST',
          requestHeaders: { 'content-type': 'application/json' },
          requestBody: JSON.stringify({ key: 'value' }),
          responseStatus: 201,
        });
        assertFinalStatus(result, 201);
      },
    },
  ],
});

await runAndExit(suite);
```

## See Also

- [RUNNER.md](RUNNER.md) — Low-level runner API (`IWasmRunner`, `callFullFlow`, `callOnRequestHeaders`, `HookResult`, `FullFlowResult`)
- [TEST_CONFIG.md](TEST_CONFIG.md) — Config file schema (`fastedge-config.test.json`) and `RunnerConfig` field reference
- [API.md](API.md) — REST API for server-based test execution
