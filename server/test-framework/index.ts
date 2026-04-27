/**
 * @gcoredev/fastedge-test — Test Framework
 *
 * Entry point for the `./test` sub-path export.
 * Import via: import { defineTestSuite, runTestSuite } from '@gcoredev/fastedge-test/test'
 */

export { defineTestSuite, runTestSuite, runAndExit, runFlow, runHttpRequest, loadConfigFile } from "./suite-runner.js";

export { mockOrigins } from "./mock-origins.js";
export type { MockOriginsHandle, MockOriginsOptions } from "./mock-origins.js";

export {
  // CDN hook assertions
  assertRequestHeader,
  assertNoRequestHeader,
  assertResponseHeader,
  assertNoResponseHeader,
  // CDN final response assertions
  assertFinalStatus,
  assertFinalHeader,
  // CDN return code
  assertReturnCode,
  // CDN log assertions
  assertLog,
  assertNoLog,
  logsContain,
  // CDN property access
  hasPropertyAccessViolation,
  assertPropertyAllowed,
  assertPropertyDenied,
  // HTTP response assertions
  assertHttpStatus,
  assertHttpHeader,
  assertHttpNoHeader,
  assertHttpBody,
  assertHttpBodyContains,
  assertHttpJson,
  assertHttpContentType,
  assertHttpLog,
  assertHttpNoLog,
} from "./assertions.js";

export type {
  TestSuite,
  TestCase,
  TestResult,
  SuiteResult,
  FlowOptions,
  HttpRequestOptions,
  RunnerConfig,
} from "./types.js";
