/**
 * @gcoredev/fastedge-test — Test Framework
 *
 * Entry point for the `./test` sub-path export.
 * Import via: import { defineTestSuite, runTestSuite } from '@gcoredev/fastedge-test/test'
 */

export { defineTestSuite, runTestSuite, runAndExit, runFlow, loadConfigFile } from "./suite-runner.js";

export {
  // Header assertions
  assertRequestHeader,
  assertNoRequestHeader,
  assertResponseHeader,
  assertNoResponseHeader,
  // Final response assertions
  assertFinalStatus,
  assertFinalHeader,
  // Return code
  assertReturnCode,
  // Log assertions
  assertLog,
  assertNoLog,
  logsContain,
  // Property access
  hasPropertyAccessViolation,
  assertPropertyAllowed,
  assertPropertyDenied,
} from "./assertions.js";

export type {
  TestSuite,
  TestCase,
  TestResult,
  SuiteResult,
  FlowOptions,
  RunnerConfig,
} from "./types.js";
