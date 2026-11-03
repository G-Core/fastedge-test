# Quickstart — @gcoredev/fastedge-test

A local test runner and debugger for FastEdge WASM modules.

## Install

```bash
npm install --save-dev @gcoredev/fastedge-test
```

```bash
pnpm add -D @gcoredev/fastedge-test
```

The supported Node.js version is declared in the `engines.node` field of the package's `package.json`.

## Option 1: Interactive Debugger

Launch the interactive debugger UI to inspect your WASM module's request/response behavior in a browser.

```bash
npx fastedge-debug
```

The server binds to `127.0.0.1` and starts on port `5179` by default. If that port is in use, it tries the next ports in sequence (up to 50 ports in total). On startup it prints the URL to open to stderr, including a per-session access token in the URL fragment:

```text
Open: http://127.0.0.1:5179/#token=<session-token>
```

Open that URL in your browser. A URL without the token fragment cannot authenticate to the server's API. The token is regenerated each time the server starts.

Use the `PORT` environment variable to override the default starting port:

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

Each test runs against a fresh runner instance, and a thrown error marks the test as failed. `defineTestSuite` throws if neither `wasmPath` nor `wasmBuffer` is provided, or if `tests` is empty.

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
    {},                       // properties
    true,                     // enforceProductionPropertyRules
  );

  console.log(result.finalResponse);
} finally {
  await runner.cleanup();
}
```

`createRunner(wasmPath: string, config?: RunnerConfig): Promise<IWasmRunner>` detects the WASM type (proxy-wasm or http-wasm) automatically. Set `runnerType` in `RunnerConfig` to override detection.

You can also load from an in-memory buffer using `createRunnerFromBuffer`:

```typescript
import { createRunnerFromBuffer } from "@gcoredev/fastedge-test";
import { readFile } from "fs/promises";

const buffer = await readFile("./dist/my-module.wasm");
const runner = await createRunnerFromBuffer(buffer);

try {
  const result = await runner.callFullFlow("https://example.com/", "GET", {}, "", {}, true);
  console.log(result.finalResponse);
} finally {
  await runner.cleanup();
}
```

See [RUNNER.md](RUNNER.md) for the full `IWasmRunner` interface, `RunnerConfig` options, and `FullFlowResult` shape.

## Configuration

Place a `fastedge-config.test.json` file in `.fastedge-debug/` at your project root to define the default request and WASM properties for the interactive debugger.

```json
{
  "$schema": "../node_modules/@gcoredev/fastedge-test/schemas/fastedge-config.test.schema.json",
  "appType": "proxy-wasm",
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
  "properties": {
    "my-property": "value"
  }
}
```

The `$schema` field enables editor autocompletion and inline validation.

For HTTP WASM apps, set `"appType": "http-wasm"` and use `request.path` instead of `request.url`.

See [TEST_CONFIG.md](TEST_CONFIG.md) for all configuration fields and their defaults.

## Next Steps

- [RUNNER.md](RUNNER.md) — `createRunner`, `createRunnerFromBuffer`, `IWasmRunner` interface, `RunnerConfig`
- [TEST_FRAMEWORK.md](TEST_FRAMEWORK.md) — `defineTestSuite`, `runAndExit`, `runFlow`, `runTestSuite`, `loadConfigFile`
- [TEST_CONFIG.md](TEST_CONFIG.md) — `fastedge-config.test.json` schema reference
- [DEBUGGER.md](DEBUGGER.md) — Interactive debugger usage and configuration
- [API.md](API.md) — REST API reference for programmatic server integration
