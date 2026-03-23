# Quickstart — @gcoredev/fastedge-test

A local test runner and debugger for FastEdge WASM modules.

## Install

```bash
npm install --save-dev @gcoredev/fastedge-test
```

```bash
pnpm add -D @gcoredev/fastedge-test
```

Requires Node.js >= 22.12.

## Option 1: Interactive Debugger

Launch the interactive debugger UI to inspect your WASM module's request/response behavior in a browser.

```bash
npx fastedge-debug
```

The server starts on port `5179` by default. Open `http://localhost:5179` in your browser to use the debugger interface.

Use the `PORT` environment variable to override the default port:

```bash
PORT=8080 npx fastedge-debug
```

See [DEBUGGER.md](DEBUGGER.md) for full usage details.

## Option 2: Programmatic Test Suite

Use `defineTestSuite` and `runAndExit` to write test scripts that run in CI or as standalone Node.js programs.

```typescript
import { defineTestSuite, runAndExit, runFlow } from "@gcoredev/fastedge-test/test";

const suite = defineTestSuite({
  wasmPath: "./dist/my-module.wasm",
  tests: [
    {
      name: "redirects /old-path to /new-path",
      async run(runner) {
        const result = await runFlow(runner, {
          url: "https://example.com/old-path",
          method: "GET",
        });

        const location = result.finalResponse.headers["location"];
        if (location !== "/new-path") {
          throw new Error(`Expected location "/new-path", got "${location}"`);
        }
      },
    },
    {
      name: "adds X-Custom-Header to response",
      async run(runner) {
        const result = await runFlow(runner, {
          url: "https://example.com/",
          method: "GET",
          responseStatus: 200,
          responseBody: "hello",
        });

        const header = result.finalResponse.headers["x-custom-header"];
        if (!header) {
          throw new Error("Expected x-custom-header to be present");
        }
      },
    },
  ],
});

await runAndExit(suite);
```

`runAndExit` prints a test summary and exits with code `0` (all pass) or `1` (any fail), making it suitable for CI pipelines.

See [TEST_FRAMEWORK.md](TEST_FRAMEWORK.md) for the full API reference including `runTestSuite`, `loadConfigFile`, and all `FlowOptions` fields.

## Option 3: Low-Level Runner

Use `createRunner` directly when you need full control over the runner lifecycle, or when integrating with an existing test framework such as Vitest or Jest.

```typescript
import { createRunner } from "@gcoredev/fastedge-test";

const runner = await createRunner("./dist/my-module.wasm");

try {
  const result = await runner.callFullFlow(
    "https://example.com/",   // url
    "GET",                    // method
    {                         // request headers
      ":method": "GET",
      ":path": "/",
      ":authority": "example.com",
      ":scheme": "https",
    },
    "",                       // request body
    {},                       // response headers
    "",                       // response body
    200,                      // response status
    "OK",                     // response status text
    {},                       // properties
    true,                     // enforceProductionPropertyRules
  );

  console.log(result.finalResponse);
} finally {
  await runner.cleanup();
}
```

You can also load from an in-memory buffer using `createRunnerFromBuffer`:

```typescript
import { createRunnerFromBuffer } from "@gcoredev/fastedge-test";
import { readFile } from "fs/promises";

const buffer = await readFile("./dist/my-module.wasm");
const runner = await createRunnerFromBuffer(buffer);
```

See [RUNNER.md](RUNNER.md) for the full `IWasmRunner` interface, `RunnerConfig` options, and `FullFlowResult` shape.

## Configuration

Place a `fastedge-config.test.json` file in your project root to define default request parameters, response stubs, and WASM properties for the interactive debugger.

```json
{
  "$schema": "./node_modules/@gcoredev/fastedge-test/schemas/fastedge-config.test.schema.json",
  "wasm": {
    "path": "./dist/my-module.wasm"
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

The `$schema` field enables editor autocompletion and inline validation.

See [TEST_CONFIG.md](TEST_CONFIG.md) for all configuration fields and their defaults.

## Next Steps

- [RUNNER.md](RUNNER.md) — `createRunner`, `createRunnerFromBuffer`, `IWasmRunner` interface, `RunnerConfig`
- [TEST_FRAMEWORK.md](TEST_FRAMEWORK.md) — `defineTestSuite`, `runAndExit`, `runFlow`, `runTestSuite`, `loadConfigFile`
- [TEST_CONFIG.md](TEST_CONFIG.md) — `fastedge-config.test.json` schema reference
- [DEBUGGER.md](DEBUGGER.md) — Interactive debugger usage and configuration
- [API.md](API.md) — REST API reference for programmatic server integration
