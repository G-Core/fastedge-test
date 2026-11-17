import type { IWasmRunner, RunnerConfig } from "../runner/IWasmRunner.js";
import type { Origin } from "../schemas/config.js";
import type { TestStores } from "../stores/testStores.js";
import type { Resource } from "../runner/resource.js";
import type { ResourceConfigInput } from "../schemas/config.js";

export type { RunnerConfig };

/**
 * A single test case in a TestSuite.
 * Receives a fully loaded runner; call any runner methods inside `run`.
 * Throw (or use assertion helpers) to fail the test.
 *
 * `context.stores`: this test's own cache and Edge KV (fresh per test, seeded from
 * `fixtures/stores/`), or the instance given in `runnerConfig.stores`; null with `stores: false`.
 */
export interface TestCase {
  name: string;
  run: (runner: IWasmRunner, context: { stores: TestStores | null }) => Promise<void>;
}

type TestSuiteBase = {
  /** Optional runner configuration */
  runnerConfig?: RunnerConfig;
  /** Test cases to execute */
  tests: TestCase[];
};

/**
 * Configuration passed to defineTestSuite().
 *
 * Exactly one of wasmPath or wasmBuffer must be provided.
 * TypeScript enforces this at compile time via a discriminated union —
 * omitting both, or supplying both, is a type error.
 */
export type TestSuite =
  | (TestSuiteBase & { wasmPath: string; wasmBuffer?: never })
  | (TestSuiteBase & { wasmBuffer: Buffer; wasmPath?: never });

/** A test case of a ResourceTestSuite: receives a fresh, loaded resource. */
export interface ResourceTestCase {
  name: string;
  run: (resource: Resource, context: { stores: TestStores | null }) => Promise<void>;
}

/**
 * A suite over a resource (several apps, one per hook): a config file (paths relative to it) or
 * object. Each test gets a fresh resource on its own stores.
 */
export interface ResourceTestSuite {
  resource: string | ResourceConfigInput;
  /** Default: this test's own stores; false = off; or an instance shared by every test. */
  stores?: false | TestStores;
  tests: ResourceTestCase[];
}

/** Result for a single test case */
export interface TestResult {
  name: string;
  passed: boolean;
  /** Error message when passed is false */
  error?: string;
  durationMs: number;
}

/** Aggregate result for a full test suite */
export interface SuiteResult {
  passed: number;
  failed: number;
  total: number;
  durationMs: number;
  results: TestResult[];
}

/**
 * Options for runHttpRequest() — execute a request through an HTTP WASM app.
 * Only path is required; method defaults to "GET", headers to {}, body to "".
 */
export interface HttpRequestOptions {
  path: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

/**
 * Options for runFlow() — object-based wrapper around callFullFlow().
 * Pseudo-headers (:method, :path, :authority, :scheme) are derived from url/method
 * automatically and can be overridden via requestHeaders.
 */
export interface FlowOptions {
  url: string;
  method?: string;
  requestHeaders?: Record<string, string>;
  requestBody?: string;
  properties?: Record<string, unknown>;
  /** Default: true — matches production FastEdge behaviour */
  enforceProductionPropertyRules?: boolean;
  /**
   * Where the response comes from instead of `url` (a config's `origin`; loadConfigFile makes
   * its paths absolute). `url` is then only what the client asked for.
   */
  origin?: Origin;
}
