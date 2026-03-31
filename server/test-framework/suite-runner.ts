import { readFile } from "fs/promises";
import { createRunner, createRunnerFromBuffer } from "../runner/standalone.js";
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

  // Derive pseudo-headers from URL when it's a valid URL.
  // For non-URL targets (e.g. "built-in"), skip pseudo-header derivation.
  let pseudoDefaults: Record<string, string> = {};
  try {
    const parsed = new URL(url);
    pseudoDefaults = {
      ":method": method,
      ":path": parsed.pathname + parsed.search,
      ":authority": parsed.host,
      ":scheme": parsed.protocol.replace(":", ""),
    };
  } catch {
    // Not a valid URL (e.g. "built-in") — no pseudo-headers to derive
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
