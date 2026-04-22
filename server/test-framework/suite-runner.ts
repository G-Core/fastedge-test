import { readFile } from "fs/promises";
import path from "path";
import { createRunner, createRunnerFromBuffer } from "../runner/standalone.js";
import { BUILTIN_SHORTHAND, BUILTIN_URL } from "../runner/ProxyWasmRunner.js";
import { TestConfigSchema } from "../schemas/config.js";
import type { TestConfig } from "../schemas/config.js";
import type { IWasmRunner, HttpResponse } from "../runner/IWasmRunner.js";
import type { FullFlowResult } from "../runner/types.js";
import type { TestSuite, SuiteResult, TestResult, FlowOptions, HttpRequestOptions } from "./types.js";

/**
 * Validate and return a typed TestSuite definition.
 * Throws if neither wasmPath nor wasmBuffer is provided, or if tests is empty.
 */
export function defineTestSuite(config: TestSuite): TestSuite {
  if (!config.wasmPath && !config.wasmBuffer) {
    throw new Error("TestSuite requires either wasmPath or wasmBuffer");
  }
  if (!config.tests || config.tests.length === 0) {
    throw new Error("TestSuite requires at least one test case");
  }
  return config;
}

/**
 * Load and validate a fastedge-config.test.json file.
 * Returns the validated TestConfig, or throws with a descriptive error.
 */
export async function loadConfigFile(configPath: string): Promise<TestConfig> {
  const raw = await readFile(configPath, "utf-8");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Failed to parse config file '${configPath}': ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const result = TestConfigSchema.safeParse(json);
  if (!result.success) {
    throw new Error(
      `Invalid test config '${configPath}':\n${JSON.stringify(result.error.flatten(), null, 2)}`,
    );
  }

  // Resolve relative dotenv.path against the config file's directory
  if (result.data.dotenv?.path && !path.isAbsolute(result.data.dotenv.path)) {
    const configDir = path.dirname(path.resolve(configPath));
    result.data.dotenv.path = path.resolve(configDir, result.data.dotenv.path);
  }

  return result.data;
}

/**
 * Execute all test cases in a TestSuite.
 *
 * Each test gets a **fresh runner instance** so tests are fully isolated.
 * Tests run sequentially. A thrown error (or failed assertion) marks the test as failed.
 */
export async function runTestSuite(suite: TestSuite): Promise<SuiteResult> {
  const suiteStart = Date.now();
  const results: TestResult[] = [];

  for (const test of suite.tests) {
    const testStart = Date.now();
    try {
      const runner = suite.wasmBuffer
        ? await createRunnerFromBuffer(suite.wasmBuffer, suite.runnerConfig)
        : await createRunner(suite.wasmPath!, suite.runnerConfig);

      try {
        await test.run(runner);
        results.push({
          name: test.name,
          passed: true,
          durationMs: Date.now() - testStart,
        });
      } finally {
        await runner.cleanup();
      }
    } catch (err) {
      results.push({
        name: test.name,
        passed: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - testStart,
      });
    }
  }

  const passed = results.filter((r) => r.passed).length;
  return {
    passed,
    failed: results.length - passed,
    total: results.length,
    durationMs: Date.now() - suiteStart,
    results,
  };
}

/**
 * Object-based wrapper around runner.callFullFlow().
 *
 * Automatically derives HTTP/2 pseudo-headers (:method, :path, :authority, :scheme)
 * from the url and method so callers don't need to set them manually.
 * Any pseudo-headers supplied in requestHeaders override the derived defaults.
 *
 * All fields except url are optional with sensible defaults.
 */
export async function runFlow(
  runner: IWasmRunner,
  options: FlowOptions,
): Promise<FullFlowResult> {
  const {
    url,
    method = "GET",
    requestBody = "",
    responseStatus = 200,
    responseStatusText = "OK",
    responseHeaders = {},
    responseBody = "",
    properties = {},
    enforceProductionPropertyRules = true,
  } = options;

  // Normalise "built-in" shorthand so pseudo-header derivation works.
  const resolvedUrl = url === BUILTIN_SHORTHAND ? BUILTIN_URL : url;
  let pseudoDefaults: Record<string, string> = {};
  try {
    const parsed = new URL(resolvedUrl);
    pseudoDefaults = {
      ":method": method,
      ":path": parsed.pathname + parsed.search,
      ":authority": parsed.host,
      ":scheme": parsed.protocol.replace(":", ""),
    };
  } catch {
    throw new Error(
      `Invalid URL: "${url}". Use a full URL (e.g. "https://example.com/path") or "built-in" for the local responder.`,
    );
  }

  const requestHeaders = { ...pseudoDefaults, ...(options.requestHeaders ?? {}) };

  return runner.callFullFlow(
    url,
    method,
    requestHeaders,
    requestBody,
    responseHeaders,
    responseBody,
    responseStatus,
    responseStatusText,
    properties,
    enforceProductionPropertyRules,
  );
}

/**
 * Object-based wrapper around runner.execute() for HTTP WASM apps.
 *
 * All fields except path are optional with sensible defaults:
 * - method defaults to "GET"
 * - headers defaults to {}
 * - body defaults to ""
 *
 * Redirects are surfaced verbatim — a 302 from the WASM is returned to the
 * caller with its `Location` header preserved, matching FastEdge edge
 * behaviour.
 *
 * `runHttpRequest` targets the WASM app under test only (`options.path` is a
 * path on the local `fastedge-run` server, not a full URL). Following a
 * redirect therefore depends on the shape of `response.headers.location`:
 *
 * - Relative (e.g. `/auth/complete`) — pass it directly as `path` in a second
 *   `runHttpRequest` call.
 * - Absolute with the app's own host — parse with `new URL(...)`, then
 *   re-issue against `url.pathname + url.search`.
 * - Absolute with an external host — cannot be followed through the runner;
 *   that redirect is the end of the test, assert on status + Location and
 *   stop there.
 */
export async function runHttpRequest(
  runner: IWasmRunner,
  options: HttpRequestOptions,
): Promise<HttpResponse> {
  const {
    path,
    method = "GET",
    headers = {},
    body = "",
  } = options;

  return runner.execute({ path, method, headers, body });
}

/**
 * Run a test suite, print a summary to stdout, and exit the process.
 *
 * Exits with code 0 if all tests pass, code 1 if any fail.
 * Intended for standalone Node.js test scripts (CI pipelines, Makefile targets).
 */
export async function runAndExit(suite: TestSuite): Promise<never> {
  const results = await runTestSuite(suite);

  console.log("");
  for (const r of results.results) {
    const mark = r.passed ? "✓" : "✗";
    console.log(`  ${mark} ${r.name} (${r.durationMs}ms)`);
    if (!r.passed && r.error) {
      for (const line of r.error.split("\n")) {
        console.log(`      ${line}`);
      }
    }
  }
  console.log(`\n  ${results.passed}/${results.total} passed in ${results.durationMs}ms`);

  process.exit(results.failed > 0 ? 1 : 0);
}
