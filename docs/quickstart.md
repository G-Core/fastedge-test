# Quickstart — @gcoredev/fastedge-test

Tools for running, debugging, and testing FastEdge WASM applications locally.

## Install

```bash
npm install --save-dev @gcoredev/fastedge-test
```

```bash
pnpm add -D @gcoredev/fastedge-test
```

Requires Node.js `>=22.12`.

## Option 1: Interactive Debugger

Launch the interactive debugger UI to load and test WASM files through a browser interface:

```bash
npx fastedge-debug
```

The server starts on port `5179` by default. Open `http://localhost:5179` in your browser to use the debugger. Set the `PORT` environment variable to use a different port.

The debugger accepts WASM files via drag-and-drop or file picker, lets you configure request/response parameters and properties, and displays execution results in real time.

## Option 2: Programmatic Test Suite

Import `defineTestSuite`, `runAndExit`, and `runFlow` from `@gcoredev/fastedge-test/test` to write standalone test scripts suitable for CI pipelines.

```typescript
import { defineTestSuite, runAndExit, runFlow } from "@gcoredev/fastedge-test/test";

const suite = defineTestSuite({
  wasmPath: "./dist/my-app.wasm",
  tests: [
    {
      name: "returns 200 for root path",
      async run(runner) {
        const result = await runFlow(runner, {
          url: "https://example.com/",
          method: "GET",
        });

        const status = result.finalResponse?.status;
        if (status !== 200) {
          throw new Error(`Expected 200, got ${status}`);
        }
      },
    },
    {
      name: "sets custom header",
      async run(runner) {
        const result = await runFlow(runner, {
          url: "https://example.com/",
          method: "GET",
          properties: { "my-property": "value" },
        });

        const headers = result.finalResponse?.headers ?? {};
        if (!headers["x-custom-header"]) {
          throw new Error("Expected x-custom-header to be set");
        }
      },
    },
  ],
});

await runAndExit(suite);
```

Run the script directly:

```bash
node --experimental-vm-modules my-tests.mjs
```

`runAndExit` prints a summary to stdout and exits with code `0` if all tests pass, or `1` if any fail. Each test receives a fresh runner instance, so tests are fully isolated.

### `defineTestSuite` parameters

| Field | Type | Required | Description |
|---|---|---|---|
| `wasmPath` | `string` | One of `wasmPath` or `wasmBuffer` | Path to the `.wasm` file |
| `wasmBuffer` | `Buffer` | One of `wasmPath` or `wasmBuffer` | In-memory WASM buffer |
| `tests` | `TestCase[]` | Yes | Array of test cases, each with `name` and `run(runner)` |
| `runnerConfig` | `RunnerConfig` | No | Optional runner configuration (e.g. dotenv settings) |

### `runFlow` options

| Field | Type | Default | Description |
|---|---|---|---|
| `url` | `string` | Required | Full URL (used to derive HTTP/2 pseudo-headers) |
| `method` | `string` | `"GET"` | HTTP method |
| `requestHeaders` | `Record<string, string>` | `{}` | Request headers (override derived pseudo-headers) |
| `requestBody` | `string` | `""` | Request body |
| `responseStatus` | `number` | `200` | Simulated upstream response status |
| `responseStatusText` | `string` | `"OK"` | Simulated upstream response status text |
| `responseHeaders` | `Record<string, string>` | `{}` | Simulated upstream response headers |
| `responseBody` | `string` | `""` | Simulated upstream response body |
| `properties` | `Record<string, unknown>` | `{}` | FastEdge properties |
| `enforceProductionPropertyRules` | `boolean` | `true` | Enforce production-equivalent property validation |

## Option 3: Low-Level Runner

Use `createRunner` from `@gcoredev/fastedge-test` for direct, low-level access to the WASM runner without the test suite wrapper. This is useful when integrating with an existing test framework (Vitest, Jest, etc.) or when you need fine-grained control.

```typescript
import { createRunner } from "@gcoredev/fastedge-test";

const runner = await createRunner("./dist/my-app.wasm");

try {
  const result = await runner.callFullFlow(
    "https://example.com/",   // url
    "GET",                    // method
    {                         // requestHeaders
      ":method": "GET",
      ":path": "/",
      ":authority": "example.com",
      ":scheme": "https",
    },
    "",                       // requestBody
    {},                       // responseHeaders
    "",                       // responseBody
    200,                      // responseStatus
    "OK",                     // responseStatusText
    {},                       // properties
    true,                     // enforceProductionPropertyRules
  );

  console.log(result.finalResponse?.status);
} finally {
  await runner.cleanup();
}
```

Always call `runner.cleanup()` when finished. The WASM type (proxy-wasm or http-wasm) is detected automatically from the binary. Pass a `RunnerConfig` as the second argument to `createRunner` to configure dotenv loading or override the detected runner type.

To create a runner from an in-memory buffer instead of a file path:

```typescript
import { createRunnerFromBuffer } from "@gcoredev/fastedge-test";
import { readFile } from "fs/promises";

const buffer = await readFile("./dist/my-app.wasm");
const runner = await createRunnerFromBuffer(buffer);
```

## Configuration

Place a `fastedge-config.test.json` file in your project root to configure the default request, response, and properties used by the interactive debugger.

```json
{
  "$schema": "node_modules/@gcoredev/fastedge-test/schemas/fastedge-config.test.schema.json",
  "wasm": {
    "path": "./dist/my-app.wasm"
  },
  "request": {
    "method": "GET",
    "url": "https://example.com/",
    "headers": {
      "accept": "text/html"
    },
    "body": ""
  },
  "response": {
    "headers": {
      "content-type": "text/html"
    },
    "body": "<html><body>Hello</body></html>"
  },
  "properties": {
    "my-property": "value"
  }
}
```

The `$schema` pointer enables validation and autocompletion in editors that support JSON Schema. The `request` and `properties` fields are required; all other fields are optional.

| Field | Required | Description |
|---|---|---|
| `wasm.path` | No | Path to the `.wasm` file, resolved relative to the config file |
| `request.method` | Yes | HTTP method |
| `request.url` | Yes | Request URL |
| `request.headers` | Yes | Request headers (string key/value pairs) |
| `request.body` | Yes | Request body |
| `response.headers` | No | Simulated upstream response headers |
| `response.body` | No | Simulated upstream response body |
| `properties` | Yes | FastEdge properties map |
| `dotenv.enabled` | No | Load environment variables from a `.env` file |
| `dotenv.path` | No | Path to the `.env` file (defaults to project root) |

## Next Steps

- [Runner API](./API.md) — full reference for `IWasmRunner`, `callFullFlow`, hook execution, and result types
- [Test Framework](./TEST_FRAMEWORK.md) — complete reference for `defineTestSuite`, `runTestSuite`, `runFlow`, and suite result types
- [Configuration](./TEST_CONFIG.md) — full `fastedge-config.test.json` schema reference
- [Debugger](./DEBUGGER.md) — interactive debugger features, WebSocket events, and server API

## See Also

- [API Reference](./API.md)
- [Test Framework Reference](./TEST_FRAMEWORK.md)
- [Configuration Reference](./TEST_CONFIG.md)
