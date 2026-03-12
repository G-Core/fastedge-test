/**
 * Framework-agnostic assertion helpers for WASM runner test suites.
 *
 * All functions throw an Error on failure — compatible with any test framework
 * (vitest, jest, node:assert) or plain try/catch in agent scripts.
 */

import type { HookResult, FullFlowResult, LogEntry } from "../runner/types.js";

// ─── Request / Response header assertions ────────────────────────────────────

/**
 * Assert that a named header exists (and optionally matches a value)
 * in the hook's output request headers.
 */
export function assertRequestHeader(
  result: HookResult,
  name: string,
  expected?: string,
): void {
  const value = result.output.request.headers[name];
  if (value === undefined) {
    throw new Error(
      `Expected request header '${name}' to be set, but it was missing`,
    );
  }
  if (expected !== undefined && value !== expected) {
    throw new Error(
      `Expected request header '${name}' to be '${expected}', got '${value}'`,
    );
  }
}

/**
 * Assert that a named header is absent in the hook's output request headers.
 */
export function assertNoRequestHeader(result: HookResult, name: string): void {
  const value = result.output.request.headers[name];
  if (value !== undefined) {
    throw new Error(
      `Expected request header '${name}' to be absent, but found '${value}'`,
    );
  }
}

/**
 * Assert that a named header exists (and optionally matches a value)
 * in the hook's output response headers.
 */
export function assertResponseHeader(
  result: HookResult,
  name: string,
  expected?: string,
): void {
  const value = result.output.response.headers[name];
  if (value === undefined) {
    throw new Error(
      `Expected response header '${name}' to be set, but it was missing`,
    );
  }
  if (expected !== undefined && value !== expected) {
    throw new Error(
      `Expected response header '${name}' to be '${expected}', got '${value}'`,
    );
  }
}

/**
 * Assert that a named header is absent in the hook's output response headers.
 */
export function assertNoResponseHeader(
  result: HookResult,
  name: string,
): void {
  const value = result.output.response.headers[name];
  if (value !== undefined) {
    throw new Error(
      `Expected response header '${name}' to be absent, but found '${value}'`,
    );
  }
}

// ─── Final response assertions (FullFlowResult) ──────────────────────────────

/**
 * Assert the final HTTP response status code from a full-flow run.
 */
export function assertFinalStatus(
  result: FullFlowResult,
  expected: number,
): void {
  if (result.finalResponse.status !== expected) {
    throw new Error(
      `Expected final response status ${expected}, got ${result.finalResponse.status}`,
    );
  }
}

/**
 * Assert that a named header exists (and optionally matches a value)
 * in the final response headers from a full-flow run.
 */
export function assertFinalHeader(
  result: FullFlowResult,
  name: string,
  expected?: string,
): void {
  const value = result.finalResponse.headers[name];
  if (value === undefined) {
    throw new Error(
      `Expected final response header '${name}' to be set, but it was missing`,
    );
  }
  if (expected !== undefined && value !== expected) {
    throw new Error(
      `Expected final response header '${name}' to be '${expected}', got '${value}'`,
    );
  }
}

// ─── Return code ──────────────────────────────────────────────────────────────

/**
 * Assert the hook return code (e.g. 0 = Ok, 1 = Pause).
 */
export function assertReturnCode(result: HookResult, expected: number): void {
  if (result.returnCode !== expected) {
    throw new Error(
      `Expected hook return code ${expected}, got ${result.returnCode}`,
    );
  }
}

// ─── Log assertions ──────────────────────────────────────────────────────────

/**
 * Assert that at least one log entry contains the given substring.
 */
export function assertLog(result: HookResult, messageSubstring: string): void {
  const found = result.logs.some((log: LogEntry) =>
    log.message.includes(messageSubstring),
  );
  if (!found) {
    throw new Error(
      `Expected a log message containing '${messageSubstring}' but none found`,
    );
  }
}

/**
 * Assert that no log entry contains the given substring.
 */
export function assertNoLog(
  result: HookResult,
  messageSubstring: string,
): void {
  const match = result.logs.find((log: LogEntry) =>
    log.message.includes(messageSubstring),
  );
  if (match) {
    throw new Error(
      `Expected no log containing '${messageSubstring}', but found: '${match.message}'`,
    );
  }
}

/**
 * Returns true if any log entry contains the given substring.
 */
export function logsContain(
  result: HookResult,
  messageSubstring: string,
): boolean {
  return result.logs.some((log: LogEntry) =>
    log.message.includes(messageSubstring),
  );
}

// ─── Property access helpers ─────────────────────────────────────────────────

/**
 * Returns true if the hook result contains a property access denial message.
 */
export function hasPropertyAccessViolation(result: HookResult): boolean {
  return result.logs.some((log: LogEntry) =>
    log.message.includes("Property access denied"),
  );
}

/**
 * Assert that a property read/write was NOT denied.
 */
export function assertPropertyAllowed(
  result: HookResult,
  propertyPath: string,
): void {
  const violation = result.logs.find(
    (log: LogEntry) =>
      log.message.includes("Property access denied") &&
      log.message.includes(propertyPath),
  );
  if (violation) {
    throw new Error(
      `Expected property '${propertyPath}' to be accessible, but access was denied: ${violation.message}`,
    );
  }
}

/**
 * Assert that a property access WAS denied.
 */
export function assertPropertyDenied(
  result: HookResult,
  propertyPath: string,
): void {
  const violation = result.logs.find(
    (log: LogEntry) =>
      log.message.includes("Property access denied") &&
      log.message.includes(propertyPath),
  );
  if (!violation) {
    throw new Error(
      `Expected property '${propertyPath}' access to be denied, but no violation was found`,
    );
  }
}
