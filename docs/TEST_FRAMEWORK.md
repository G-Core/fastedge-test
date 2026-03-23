# Test Framework API

High-level API for defining and running proxy-wasm test suites with `@gcoredev/fastedge-test`.

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
  assertReturnCode,
  assertLog,
} from "@gcoredev/fastedge-test/test";
import type { TestSuite, TestCase, SuiteResult, FlowOptions } from "@gcoredev/fastedge-test/test";
```

## Types

### TestSuite

A discriminated union requiring exactly one of `wasmPath` or `wasmBuffer`. Supplying both, or neither, is a TypeScript compile-time error.

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
| `tests` | `TestCase[]` | Yes | Test cases to execute; must be non-empty |
| `runnerConfig` | `RunnerConfig` | No | Optional runner configuration (see [RUNNER.md](RUNNER.md)) |

### TestCase

A single test case. The `run` function receives a fully loaded `IWasmRunner` instance. Throw an error (or use assertion helpers) to fail the test.

```typescript
interface TestCase {
  name: string;
  run: (runner: IWasmRunner) => Promise<void>;
}
```

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

Object-based options for `runFlow()`. HTTP/2 pseudo-headers (`:method`, `:path`, `:authority`, `:scheme`) are derived from `url` and `method` automatically. Any pseudo-header supplied in `requestHeaders` overrides the derived default.

```typescript
interface FlowOptions {
  url: string;
  method?: string;                          // Default: "GET"
  requestHeaders?: Record<string, string>;
  requestBody?: string;                     // Default: ""
  responseStatus?: number;                  // Default: 200
  responseStatusText?: string;              // Default: "OK"
  responseHeaders?: Record<string, string>; // Default: {}
  responseBody?: string;                    // Default: ""
  properties?: Record<string, unknown>;     // Default: {}
  enforceProductionPropertyRules?: boolean; // Default: true
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `url` | — | Full URL including scheme and host; used to derive pseudo-headers |
| `method` | `"GET"` | HTTP method |
| `requestHeaders` | `{}` | Additional request headers; pseudo-headers here override derived values |
| `requestBody` | `""` | Request body string |
| `responseStatus` | `200` | Simulated upstream response status code |
| `responseStatusText` | `"OK"` | Simulated upstream response status text |
| `responseHeaders` | `{}` | Simulated upstream response headers |
| `responseBody` | `""` | Simulated upstream response body |
| `properties` | `{}` | Proxy-wasm properties to inject |
| `enforceProductionPropertyRules` | `true` | When true, denies access to properties not available in production FastEdge |

### RunnerConfig

Re-exported from the runner. Controls WASM execution behaviour. See [RUNNER.md](RUNNER.md) for the full definition.

```typescript
import type { RunnerConfig } from "@gcoredev/fastedge-test/test";
```

## Functions

### defineTestSuite

```typescript
function defineTestSuite(suite: TestSuite): TestSuite
```

Validates and returns a typed `TestSuite` definition. Throws if neither `wasmPath` nor `wasmBuffer` is provided, or if `tests` is empty.

```typescript
const suite = defineTestSuite({
  wasmPath: "./build/my-filter.wasm",
  tests: [
    {
      name: "adds x-request-id header",
      async run(runner) {
        const result = await runFlow(runner, {
          url: "https://example.com/api",
        });
        assertRequestHeader(result.hookResults.onRequestHeaders, "x-request-id");
      },
    },
  ],
});
```

### runTestSuite

```typescript
function runTestSuite(suite: TestSuite): Promise<SuiteResult>
```

Executes all test cases in the suite sequentially. Each test receives a **fresh runner instance** — tests are fully isolated. A thrown error or failed assertion marks that test as failed; remaining tests still execute.

```typescript
const suite = defineTestSuite({ wasmPath: "./filter.wasm", tests: [...] });
const result = await runTestSuite(suite);

console.log(`${result.passed}/${result.total} passed`);
for (const r of result.results) {
  if (!r.passed) console.error(`FAIL: ${r.name} — ${r.error}`);
}
```

### runAndExit

```typescript
function runAndExit(suite: TestSuite): Promise<never>
```

Runs the suite, prints a summary to stdout, then calls `process.exit(0)` if all tests pass or `process.exit(1)` if any fail. Intended for standalone Node.js test scripts run in CI.

```typescript
// test.mjs
import { defineTestSuite, runAndExit } from "@gcoredev/fastedge-test/test";

const suite = defineTestSuite({ wasmPath: "./filter.wasm", tests: [...] });
await runAndExit(suite);
```

Output format:

```
  ✓ adds x-request-id header (12ms)
  ✗ blocks requests without auth (5ms)
      Expected request header 'authorization' to be absent, but found 'Bearer token'

  1/2 passed in 17ms
```

### runFlow

```typescript
function runFlow(runner: IWasmRunner, options: FlowOptions): Promise<FullFlowResult>
```

Executes a complete request/response flow through the WASM filter. Object-based wrapper around the runner's low-level `callFullFlow` method — callers do not need to construct pseudo-headers manually.

The returned `FullFlowResult` has this shape:

```typescript
interface FullFlowResult {
  hookResults: Record<string, HookResult>; // keyed by camelCase hook name
  finalResponse: {
    status: number;
    headers: Record<string, string>;
    body: string;
  };
}
```

Hook results are accessed by camelCase key:

| Key | Hook |
|-----|------|
| `onRequestHeaders` | `on_request_headers` hook |
| `onRequestBody` | `on_request_body` hook |
| `onResponseHeaders` | `on_response_headers` hook |
| `onResponseBody` | `on_response_body` hook |

```typescript
const result = await runFlow(runner, {
  url: "https://api.example.com/v1/resource",
  method: "POST",
  requestHeaders: { "content-type": "application/json" },
  requestBody: '{"key":"value"}',
  responseStatus: 201,
  responseHeaders: { "x-upstream": "backend-1" },
});

// Access hook results
const reqHook = result.hookResults.onRequestHeaders;
const resHook = result.hookResults.onResponseHeaders;

// Access final response
console.log(result.finalResponse.status); // 201
```

### loadConfigFile

```typescript
function loadConfigFile(configPath: string): Promise<TestConfig>
```

Reads and validates a `fastedge-config.test.json` file. Returns the parsed `TestConfig` or throws with a descriptive error. See [TEST_CONFIG.md](TEST_CONFIG.md) for the full config schema.

```typescript
const config = await loadConfigFile("./fastedge-config.test.json");
```

## Assertion Helpers

All assertion helpers throw an `Error` on failure, making them compatible with any test framework (vitest, jest, node:assert) or plain try/catch.

### Request Headers

```typescript
function assertRequestHeader(result: HookResult, name: string, expected?: string): void
function assertNoRequestHeader(result: HookResult, name: string): void
```

`assertRequestHeader` asserts the named header exists in the hook's output request headers. If `expected` is provided, also asserts the value matches exactly.

`assertNoRequestHeader` asserts the named header is absent.

```typescript
const hookResult = result.hookResults.onRequestHeaders;

assertRequestHeader(hookResult, "x-forwarded-for");                   // exists
assertRequestHeader(hookResult, "x-country-code", "DE");              // exists with value
assertNoRequestHeader(hookResult, "x-internal-secret");               // absent
```

### Response Headers

```typescript
function assertResponseHeader(result: HookResult, name: string, expected?: string): void
function assertNoResponseHeader(result: HookResult, name: string): void
```

Same semantics as the request header variants, but operates on the hook's output response headers.

```typescript
const hookResult = result.hookResults.onResponseHeaders;

assertResponseHeader(hookResult, "cache-control");
assertResponseHeader(hookResult, "content-type", "application/json");
assertNoResponseHeader(hookResult, "server");
```

### Final Response

```typescript
function assertFinalStatus(result: FullFlowResult, expected: number): void
function assertFinalHeader(result: FullFlowResult, name: string, expected?: string): void
```

`assertFinalStatus` asserts the final response status code after the full flow completes.

`assertFinalHeader` asserts a header in `result.finalResponse.headers`. If `expected` is provided, also asserts the value.

```typescript
assertFinalStatus(result, 200);
assertFinalHeader(result, "x-cache", "HIT");
assertFinalHeader(result, "content-encoding");                        // exists, any value
```

### Return Code

```typescript
function assertReturnCode(result: HookResult, expected: number): void
```

Asserts the hook's return code. Common values: `0` = Continue, `1` = Pause/StopIteration.

```typescript
assertReturnCode(result.hookResults.onRequestHeaders, 0); // filter continued
assertReturnCode(result.hookResults.onRequestHeaders, 1); // filter paused
```

### Logs

```typescript
function assertLog(result: HookResult, messageSubstring: string): void
function assertNoLog(result: HookResult, messageSubstring: string): void
function logsContain(result: HookResult, messageSubstring: string): boolean
```

`assertLog` asserts at least one log entry contains `messageSubstring`.

`assertNoLog` asserts no log entry contains `messageSubstring`.

`logsContain` is a non-throwing predicate — useful for conditional checks.

```typescript
const hookResult = result.hookResults.onRequestHeaders;

assertLog(hookResult, "cache miss");
assertNoLog(hookResult, "error");

if (logsContain(hookResult, "debug:")) {
  // conditional logic based on log presence
}
```

### Properties

```typescript
function hasPropertyAccessViolation(result: HookResult): boolean
function assertPropertyAllowed(result: HookResult, propertyPath: string): void
function assertPropertyDenied(result: HookResult, propertyPath: string): void
```

Property access violations appear as log messages containing `"Property access denied"`.

`hasPropertyAccessViolation` returns true if any such message exists.

`assertPropertyAllowed` throws if the named property path was denied.

`assertPropertyDenied` throws if the named property path was not denied.

```typescript
const hookResult = result.hookResults.onRequestHeaders;

assertPropertyAllowed(hookResult, "request.path");
assertPropertyDenied(hookResult, "upstream.address");

if (hasPropertyAccessViolation(hookResult)) {
  console.warn("At least one property access was denied");
}
```

## CI Integration

`runAndExit` is the primary entry point for CI pipelines. It exits with code `0` on full pass and `1` on any failure, compatible with standard CI exit-code conventions.

**package.json script:**

```json
{
  "scripts": {
    "test:wasm": "node --experimental-vm-modules test/suite.mjs"
  }
}
```

**GitHub Actions example:**

```yaml
- name: Run WASM tests
  run: npm run test:wasm
```

**Makefile example:**

```makefile
test:
	node test/suite.mjs
```

For programmatic use (e.g. collecting results before exiting), use `runTestSuite` directly and inspect `SuiteResult.failed`:

```typescript
const result = await runTestSuite(suite);
process.exitCode = result.failed > 0 ? 1 : 0;
```

## Complete Example

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
  assertReturnCode,
  assertLog,
  assertPropertyAllowed,
  assertPropertyDenied,
} from "@gcoredev/fastedge-test/test";

const suite = defineTestSuite({
  wasmPath: "./build/cdn-filter.wasm",
  tests: [
    {
      name: "injects geo headers on request",
      async run(runner) {
        const result = await runFlow(runner, {
          url: "https://cdn.example.com/image.png",
          method: "GET",
          properties: {
            "request.geo.country_code": "DE",
          },
        });

        const req = result.hookResults.onRequestHeaders;
        assertReturnCode(req, 0);
        assertRequestHeader(req, "x-country-code", "DE");
        assertNoRequestHeader(req, "x-internal-token");
      },
    },

    {
      name: "sets cache-control on response",
      async run(runner) {
        const result = await runFlow(runner, {
          url: "https://cdn.example.com/static/app.js",
          responseStatus: 200,
          responseHeaders: { "content-type": "application/javascript" },
        });

        const res = result.hookResults.onResponseHeaders;
        assertResponseHeader(res, "cache-control", "public, max-age=31536000");
        assertFinalStatus(result, 200);
      },
    },

    {
      name: "blocks requests missing required auth header",
      async run(runner) {
        const result = await runFlow(runner, {
          url: "https://cdn.example.com/api/private",
          method: "POST",
          requestHeaders: { "content-type": "application/json" },
        });

        assertFinalStatus(result, 403);
        assertFinalHeader(result, "x-block-reason", "missing-auth");
      },
    },

    {
      name: "logs cache decision",
      async run(runner) {
        const result = await runFlow(runner, {
          url: "https://cdn.example.com/data.json",
        });

        const req = result.hookResults.onRequestHeaders;
        assertLog(req, "cache-check:");
      },
    },

    {
      name: "allows access to request path property",
      async run(runner) {
        const result = await runFlow(runner, {
          url: "https://cdn.example.com/path/to/resource",
        });

        const req = result.hookResults.onRequestHeaders;
        assertPropertyAllowed(req, "request.path");
        assertPropertyDenied(req, "upstream.address");
      },
    },

    {
      name: "passes through with pre-loaded buffer",
      async run(runner) {
        const result = await runFlow(runner, {
          url: "https://cdn.example.com/",
          responseStatus: 304,
        });

        assertFinalStatus(result, 304);
      },
    },
  ],
});

await runAndExit(suite);
```

## See Also

- [RUNNER.md](RUNNER.md) — Low-level `IWasmRunner` interface, `RunnerConfig`, and `callFullFlow`
- [API.md](API.md) — REST API for running tests via HTTP
- [TEST_CONFIG.md](TEST_CONFIG.md) — `fastedge-config.test.json` schema and `loadConfigFile` config options
- [quickstart.md](quickstart.md) — Installation and first test walkthrough
