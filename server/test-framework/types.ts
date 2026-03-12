import type { IWasmRunner, RunnerConfig } from "../runner/IWasmRunner.js";

export type { RunnerConfig };

/**
 * A single test case in a TestSuite.
 * Receives a fully loaded runner; call any runner methods inside `run`.
 * Throw (or use assertion helpers) to fail the test.
 */
export interface TestCase {
  name: string;
  run: (runner: IWasmRunner) => Promise<void>;
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
 * Options for runFlow() — object-based alternative to the 10-arg callFullFlow().
 * Pseudo-headers (:method, :path, :authority, :scheme) are derived from url/method
 * automatically and can be overridden via requestHeaders.
 */
export interface FlowOptions {
  url: string;
  method?: string;
  requestHeaders?: Record<string, string>;
  requestBody?: string;
  responseStatus?: number;
  responseStatusText?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  properties?: Record<string, unknown>;
  /** Default: true — matches production FastEdge behaviour */
  enforceProductionPropertyRules?: boolean;
}
