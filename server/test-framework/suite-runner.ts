import { readFile } from "fs/promises";
import { resolveOrigin } from "../runner/origin.js";
import path from "path";
import { createRunner, createRunnerFromBuffer } from "../runner/standalone.js";
import { createStores, type TestStores } from "../stores/testStores.js";
import { resolveStoresRoot } from "../stores/StoresManager.js";
import { edgeDc } from "../runner/requestContext.js";
import { BUILTIN_SHORTHAND, BUILTIN_URL } from "../runner/ProxyWasmRunner.js";
import { TestConfigSchema } from "../schemas/config.js";
import type { TestConfig } from "../schemas/config.js";
import type { IWasmRunner, HttpResponse } from "../runner/IWasmRunner.js";
import type { FullFlowResult } from "../runner/types.js";
import type { TestSuite, ResourceTestSuite, SuiteResult, TestResult, FlowOptions, HttpRequestOptions } from "./types.js";
import { createResource, configWasmPath, projectRoot } from "../runner/resource.js";

/**
 * Validate and return a typed TestSuite definition.
 * Throws if neither wasmPath nor wasmBuffer is provided, or if tests is empty.
 */
export function defineTestSuite<T extends TestSuite | ResourceTestSuite>(config: T): T {
  if (!("resource" in config) && !config.wasmPath && !config.wasmBuffer) {
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
  // And the origin's files
  if (result.data.appType === "proxy-wasm" && result.data.origin) {
    result.data.origin = resolveOrigin(result.data.origin, path.dirname(path.resolve(configPath)));
  }

  return result.data;
}

/**
 * Execute all test cases in a TestSuite.
 *
 * Each test gets a **fresh runner instance** and its own stores (cache and Edge KV, seeded
 * from `fixtures/stores/`), so tests are fully isolated.
 * Tests run sequentially. A thrown error (or failed assertion) marks the test as failed.
 */
export async function runTestSuite(suite: TestSuite | ResourceTestSuite): Promise<SuiteResult> {
  const suiteStart = Date.now();
  const results: TestResult[] = [];

  for (const test of suite.tests) {
    const testStart = Date.now();
    // Each test gets its own isolated stores, unless the suite gives an instance or turns them off.
    const configured = "resource" in suite ? suite.stores : suite.runnerConfig?.stores;
    let own: TestStores | null = null;
    try {
      if (configured !== false && typeof configured !== "object") {
        // The app's (or the resource's) bucket; inside the try, so a bad resource file fails the test.
        const context = "resource" in suite
          ? ((typeof suite.resource === "string" ? JSON.parse(await readFile(suite.resource, "utf8")) : suite.resource) as { dc?: string; edge?: Parameters<typeof edgeDc>[0] })
          : suite.runnerConfig;
        own = await createStores({ dc: context?.dc ?? edgeDc(context?.edge) });
      }
      const stores = own ?? (typeof configured === "object" ? configured : null);
      let runner: { cleanup(): Promise<void> };
      if ("resource" in suite) {
        runner = await createResource(suite.resource, { stores: stores ?? false });
      } else {
        const runnerConfig = { ...suite.runnerConfig, stores: stores ?? false };
        runner = suite.wasmBuffer
          ? await createRunnerFromBuffer(suite.wasmBuffer, runnerConfig)
          : await createRunner(suite.wasmPath!, runnerConfig);
      }

      try {
        // The suite's own test type matches what was created above.
        await test.run(runner as never, { stores });
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
    } finally {
      await own?.close();
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
    properties = {},
    enforceProductionPropertyRules = true,
    origin,
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

  const args = [url, method, requestHeaders, requestBody, properties, enforceProductionPropertyRules] as const;
  // The origin only when given: the six-argument call stays as it was.
  return origin ? runner.callFullFlow(...args, undefined, origin) : runner.callFullFlow(...args);
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

/** Options of runConfig. */
export interface RunConfigOptions {
  /** Default: the config's `stores` (a fresh, seeded instance unless false); or an instance; or false. */
  stores?: false | TestStores;
  /** The kind of app the caller expects; the result is typed for it. */
  appType?: "proxy-wasm" | "http-wasm";
}

/**
 * Run a config file (a debugger fixture) as the debugger does: a runner from its own wasm
 * (`wasm.path` relative to the app's project root), dotenv (without a `path`: the app root),
 * client, edge and `dc`; its request through its origin. Stores: the config's `stores` (default a
 * fresh instance seeded from the fixture project's `fixtures/stores/`, closed after the run), or
 * `options.stores` (an instance, or false).
 * The runner is cleaned up before this returns.
 *
 * Returns a `FullFlowResult` for a CDN (proxy-wasm) config, an `HttpResponse` for an HTTP one.
 * `options.appType` states which one the caller expects (and types the result): a config or
 * wasm of the other kind throws. A config whose wasm is not the kind it describes throws too.
 */
export function runConfig(configPath: string, options: RunConfigOptions & { appType: "proxy-wasm" }): Promise<FullFlowResult>;
export function runConfig(configPath: string, options: RunConfigOptions & { appType: "http-wasm" }): Promise<HttpResponse>;
export function runConfig(configPath: string, options?: RunConfigOptions): Promise<FullFlowResult | HttpResponse>;
export async function runConfig(
  configPath: string,
  options: RunConfigOptions = {},
): Promise<FullFlowResult | HttpResponse> {
  const config = await loadConfigFile(configPath);
  if (!config.wasm) throw new Error(`Config '${configPath}' has no wasm.path`);
  if (options.appType && options.appType !== config.appType) {
    throw new Error(`Config '${configPath}' is ${config.appType}, expected ${options.appType}`);
  }
  // The fixture's app root, as the debugger finds it: its wasm, default dotenv folder and stores.
  const appRoot = projectRoot(path.dirname(path.resolve(configPath)));
  const wasm = configWasmPath(config.wasm.path, appRoot);

  const wanted = options.stores ?? (config.stores === false ? false : undefined);
  const own = wanted === undefined
    ? await createStores({ dc: config.dc ?? edgeDc(config.edge), fixtures: resolveStoresRoot(appRoot) })
    : null;
  try {
    const runner = await createRunner(wasm, {
      dotenv: config.dotenv && { ...config.dotenv, path: config.dotenv.path ?? appRoot },
      stores: own ?? wanted ?? false,
      dc: config.dc,
      client: config.client,
      edge: config.edge,
      ...(config.appType === "http-wasm" && config.httpPort ? { httpPort: config.httpPort } : {}),
    });
    try {
      if (runner.getType() !== config.appType) {
        throw new Error(`Config '${configPath}' is ${config.appType}, but its wasm is ${runner.getType()}`);
      }
      const { request } = config;
      if (config.appType === "http-wasm") {
        return await runHttpRequest(runner, {
          path: config.request.path,
          method: request.method,
          headers: request.headers,
          body: request.body,
        });
      }
      return await runFlow(runner, {
        url: config.request.url,
        method: request.method,
        requestHeaders: request.headers,
        requestBody: request.body,
        properties: config.properties,
        origin: config.origin,
      });
    } finally {
      await runner.cleanup();
    }
  } finally {
    await own?.close();
  }
}

/**
 * Run a test suite, print a summary to stdout, and exit the process.
 *
 * Exits with code 0 if all tests pass, code 1 if any fail.
 * Intended for standalone Node.js test scripts (CI pipelines, Makefile targets).
 */
export async function runAndExit(suite: TestSuite | ResourceTestSuite): Promise<never> {
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
