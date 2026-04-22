/**
 * Framework-agnostic assertion helpers for WASM runner test suites.
 *
 * All functions throw an Error on failure — compatible with any test framework
 * (vitest, jest, node:assert) or plain try/catch in agent scripts.
 */

import type { HookResult, FullFlowResult, LogEntry } from "../runner/types.js";
import type { HttpResponse } from "../runner/IWasmRunner.js";

// ─── Header lookup helpers ───────────────────────────────────────────────────

type AnyHeaders = Record<string, string | string[] | undefined>;

// Case-insensitive header value lookup. Returns the raw value (string | string[])
// or undefined if the header is absent.
function findHeader(
  headers: AnyHeaders,
  name: string,
): string | string[] | undefined {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return v;
  }
  return undefined;
}

// Does `actual` satisfy `expected`?
// - expected: string → .includes() semantics when actual is multi-valued, exact match when single.
// - expected: string[] → strict equality (same order, same length).
function headerMatches(
  actual: string | string[],
  expected: string | string[],
): boolean {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return false;
    if (actual.length !== expected.length) return false;
    return actual.every((v, i) => v === expected[i]);
  }
  if (Array.isArray(actual)) return actual.includes(expected);
  return actual === expected;
}

function formatHeaderValue(v: string | string[]): string {
  return Array.isArray(v) ? JSON.stringify(v) : `'${v}'`;
}

function formatExpected(v: string | string[]): string {
  return Array.isArray(v) ? JSON.stringify(v) : `'${v}'`;
}

// ─── Request / Response header assertions ────────────────────────────────────

/**
 * Assert that a named header exists (and optionally matches a value)
 * in the hook's output request headers.
 *
 * When `expected` is a string and the header is multi-valued, passes if
 * any value matches (`.includes()` semantics). When `expected` is a string[],
 * requires an exact array match.
 */
export function assertRequestHeader(
  result: HookResult,
  name: string,
  expected?: string | string[],
): void {
  const value = findHeader(result.output.request.headers, name);
  if (value === undefined) {
    throw new Error(
      `Expected request header '${name}' to be set, but it was missing`,
    );
  }
  if (expected !== undefined && !headerMatches(value, expected)) {
    throw new Error(
      `Expected request header '${name}' to be ${formatExpected(expected)}, got ${formatHeaderValue(value)}`,
    );
  }
}

/**
 * Assert that a named header is absent in the hook's output request headers.
 */
export function assertNoRequestHeader(result: HookResult, name: string): void {
  const value = findHeader(result.output.request.headers, name);
  if (value !== undefined) {
    throw new Error(
      `Expected request header '${name}' to be absent, but found ${formatHeaderValue(value)}`,
    );
  }
}

/**
 * Assert that a named header exists (and optionally matches a value)
 * in the hook's output response headers.
 *
 * When `expected` is a string and the header is multi-valued (e.g. set-cookie),
 * passes if any value matches (`.includes()` semantics). When `expected` is a
 * string[], requires an exact array match.
 */
export function assertResponseHeader(
  result: HookResult,
  name: string,
  expected?: string | string[],
): void {
  const value = findHeader(result.output.response.headers, name);
  if (value === undefined) {
    throw new Error(
      `Expected response header '${name}' to be set, but it was missing`,
    );
  }
  if (expected !== undefined && !headerMatches(value, expected)) {
    throw new Error(
      `Expected response header '${name}' to be ${formatExpected(expected)}, got ${formatHeaderValue(value)}`,
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
  const value = findHeader(result.output.response.headers, name);
  if (value !== undefined) {
    throw new Error(
      `Expected response header '${name}' to be absent, but found ${formatHeaderValue(value)}`,
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
 *
 * Multi-value semantics match {@link assertResponseHeader}.
 */
export function assertFinalHeader(
  result: FullFlowResult,
  name: string,
  expected?: string | string[],
): void {
  const value = findHeader(result.finalResponse.headers, name);
  if (value === undefined) {
    throw new Error(
      `Expected final response header '${name}' to be set, but it was missing`,
    );
  }
  if (expected !== undefined && !headerMatches(value, expected)) {
    throw new Error(
      `Expected final response header '${name}' to be ${formatExpected(expected)}, got ${formatHeaderValue(value)}`,
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

// ─── HTTP response assertions ───────────────────────────────────────────────

/**
 * Assert the HTTP response status code.
 */
export function assertHttpStatus(response: HttpResponse, expected: number): void {
  if (response.status !== expected) {
    throw new Error(
      `Expected HTTP status ${expected}, got ${response.status}`,
    );
  }
}

/**
 * Assert that a named header exists (and optionally matches a value)
 * in the HTTP response.
 *
 * Multi-value semantics: when `expected` is a string and the header is
 * multi-valued (e.g. set-cookie is `string[]` per RFC 6265), passes if any
 * value matches. When `expected` is a string[], requires exact array match.
 */
export function assertHttpHeader(
  response: HttpResponse,
  name: string,
  expected?: string | string[],
): void {
  const value = findHeader(response.headers, name);
  if (value === undefined) {
    throw new Error(
      `Expected HTTP response header '${name}' to be set, but it was missing`,
    );
  }
  if (expected !== undefined && !headerMatches(value, expected)) {
    throw new Error(
      `Expected HTTP response header '${name}' to be ${formatExpected(expected)}, got ${formatHeaderValue(value)}`,
    );
  }
}

/**
 * Assert that a named header is absent in the HTTP response.
 */
export function assertHttpNoHeader(response: HttpResponse, name: string): void {
  const value = findHeader(response.headers, name);
  if (value !== undefined) {
    throw new Error(
      `Expected HTTP response header '${name}' to be absent, but found ${formatHeaderValue(value)}`,
    );
  }
}

/**
 * Assert the HTTP response body matches exactly.
 */
export function assertHttpBody(response: HttpResponse, expected: string): void {
  if (response.body !== expected) {
    throw new Error(
      `Expected HTTP body to be '${expected}', got '${response.body}'`,
    );
  }
}

/**
 * Assert the HTTP response body contains a substring.
 */
export function assertHttpBodyContains(response: HttpResponse, substring: string): void {
  if (!response.body.includes(substring)) {
    throw new Error(
      `Expected HTTP body to contain '${substring}', but it was not found`,
    );
  }
}

/**
 * Parse the HTTP response body as JSON and return it.
 * Throws with a descriptive error if the body is not valid JSON.
 */
export function assertHttpJson<T = unknown>(response: HttpResponse): T {
  try {
    return JSON.parse(response.body) as T;
  } catch {
    throw new Error(
      `Expected HTTP body to be valid JSON, but parsing failed. Body: '${response.body.slice(0, 200)}'`,
    );
  }
}

/**
 * Assert the HTTP response content-type contains the expected type string.
 */
export function assertHttpContentType(response: HttpResponse, expected: string): void {
  const ct = response.contentType ?? "";
  if (!ct.toLowerCase().includes(expected.toLowerCase())) {
    throw new Error(
      `Expected HTTP content-type to contain '${expected}', got '${ct}'`,
    );
  }
}

/**
 * Assert that at least one log entry contains the given substring (HTTP variant).
 */
export function assertHttpLog(response: HttpResponse, messageSubstring: string): void {
  const found = response.logs.some((log) => log.message.includes(messageSubstring));
  if (!found) {
    throw new Error(
      `Expected an HTTP log message containing '${messageSubstring}' but none found`,
    );
  }
}

/**
 * Assert that no log entry contains the given substring (HTTP variant).
 */
export function assertHttpNoLog(response: HttpResponse, messageSubstring: string): void {
  const match = response.logs.find((log) => log.message.includes(messageSubstring));
  if (match) {
    throw new Error(
      `Expected no HTTP log containing '${messageSubstring}', but found: '${match.message}'`,
    );
  }
}
