/**
 * Property-specific assertion helpers for integration tests
 */

import { expect } from 'vitest';
import type { HookResult, LogEntry } from '../../../runner/types';

/**
 * Assert that a property was successfully read
 */
export function assertPropertyReadable(
  result: HookResult,
  propertyPath: string,
  expectedValue?: string
) {
  // Should not contain denial message
  const denialMsg = result.logs.find((log: LogEntry) =>
    log.message.includes('Property access denied') && log.message.includes(propertyPath)
  );
  expect(denialMsg, `Property ${propertyPath} should be readable but was denied`).toBeUndefined();

  // If expected value provided, verify it was logged
  if (expectedValue !== undefined) {
    const valueLog = result.logs.find((log: LogEntry) => log.message.includes(expectedValue));
    expect(valueLog, `Property ${propertyPath} should contain value "${expectedValue}"`).toBeDefined();
  }
}

/**
 * Assert that a property was successfully written to
 */
export function assertPropertyWritable(
  result: HookResult,
  propertyPath: string,
  expectedValue: string
) {
  // Should not contain denial message for write
  const denialMsg = result.logs.find((log: LogEntry) =>
    log.message.includes('Property access denied') && log.message.includes(propertyPath)
  );
  expect(denialMsg, `Property ${propertyPath} should be writable but was denied`).toBeUndefined();

  // Verify the new value was logged
  const valueLog = result.logs.find((log: LogEntry) => log.message.includes(expectedValue));
  expect(valueLog, `Property ${propertyPath} should contain new value "${expectedValue}"`).toBeDefined();
}

/**
 * Assert that a property access was denied (read or write)
 */
export function assertPropertyDenied(
  result: HookResult,
  propertyPath: string,
  operation: 'read' | 'write'
) {
  const denialMsg = result.logs.find((log: LogEntry) =>
    log.message.includes('Property access denied') && log.message.includes(propertyPath)
  );
  expect(
    denialMsg,
    `Property ${propertyPath} ${operation} should be denied but was allowed`
  ).toBeDefined();
}

/**
 * Assert that a property value matches expected value in logs
 */
export function assertPropertyValueMatches(
  result: HookResult,
  propertyPath: string,
  expectedValue: string
) {
  const valueLog = result.logs.find((log: LogEntry) => log.message.includes(expectedValue));
  expect(
    valueLog,
    `Property ${propertyPath} should have value "${expectedValue}"`
  ).toBeDefined();
}

/**
 * Assert that logs contain a specific message
 */
export function assertLogContains(result: HookResult, message: string) {
  const matchingLog = result.logs.find((log: LogEntry) => log.message.includes(message));
  expect(matchingLog, `Logs should contain message: "${message}"`).toBeDefined();
}

/**
 * Assert that logs do not contain a specific message
 */
export function assertLogDoesNotContain(result: HookResult, message: string) {
  const matchingLog = result.logs.find((log: LogEntry) => log.message.includes(message));
  expect(matchingLog, `Logs should not contain message: "${message}"`).toBeUndefined();
}

/**
 * Assert that a property write was accepted with no effect, as on the edge: the host returns Ok
 * (the app does not fail) and logs that the write changed nothing.
 */
export function assertPropertyWriteIgnored(result: HookResult, propertyPath: string) {
  const ignored = result.logs.find(
    (log: LogEntry) => log.message.includes(`set_property '${propertyPath}'`) && log.message.includes('has no effect'),
  );
  expect(ignored, `Write to ${propertyPath} should be accepted with no effect`).toBeDefined();
  expect(
    result.logs.some((log: LogEntry) => log.message.includes('Property access denied') && log.message.includes(propertyPath)),
  ).toBe(false);
}
