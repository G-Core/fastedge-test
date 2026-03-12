import { ProxyWasmRunner } from '../../../runner/ProxyWasmRunner';
import type { FastEdgeConfig } from '../../../fastedge-host';
import type { HookCall, HookResult, LogEntry } from '../../../runner/types';

/**
 * Creates a ProxyWasmRunner instance configured for integration testing
 *
 * Production property access rules are ALWAYS enforced for production parity.
 *
 * @param fastEdgeConfig - Optional FastEdge configuration for secrets/dictionary
 * @returns A configured ProxyWasmRunner instance
 */
export function createTestRunner(
  fastEdgeConfig?: FastEdgeConfig
): ProxyWasmRunner {
  return new ProxyWasmRunner(
    fastEdgeConfig,
    false // Disable dotenv loading in tests
  );
}

/**
 * Creates a ProxyWasmRunner with dotenv enabled.
 * Use this for tests that need env vars or secrets loaded from dotenv files.
 *
 * Pass the fixture directory via load():
 *   await runner.load(wasmBuffer, { dotenvPath: '/abs/path/to/fixtures' })
 *
 * @returns A configured ProxyWasmRunner instance with dotenv enabled
 */
export function createTestRunnerWithDotenv(): ProxyWasmRunner {
  return new ProxyWasmRunner(
    undefined,
    true // Enable dotenv loading
  );
}

/**
 * Checks if a hook result contains a property access violation in logs
 *
 * @param result - The hook result to check
 * @returns True if a property access violation was detected
 */
export function hasPropertyAccessViolation(result: HookResult): boolean {
  return result.logs.some((log: LogEntry) =>
    log.message.includes('Property access denied')
  );
}

/**
 * Finds property access violation messages in hook result logs
 *
 * @param result - The hook result to search
 * @returns Array of violation log messages
 */
export function getPropertyAccessViolations(result: HookResult): string[] {
  return result.logs
    .filter((log: LogEntry) => log.message.includes('Property access denied'))
    .map((log: LogEntry) => log.message);
}

/**
 * Checks if logs contain a specific message substring
 *
 * @param result - The hook result to check
 * @param messageSubstring - The substring to search for
 * @returns True if any log contains the substring
 */
export function logsContain(result: HookResult, messageSubstring: string): boolean {
  return result.logs.some((log: LogEntry) => log.message.includes(messageSubstring));
}

/**
 * Creates a minimal HookCall for testing
 *
 * @param hook - The hook name (e.g., 'onRequestHeaders')
 * @param headers - Optional request headers map
 * @param body - Optional request body string
 * @returns A HookCall object
 */
export function createHookCall(
  hook: 'onRequestHeaders' | 'onRequestBody' | 'onResponseHeaders' | 'onResponseBody',
  headers?: Record<string, string>,
  body?: string
): HookCall {
  const defaultHeaders = {
    ':method': 'GET',
    ':path': '/test',
    ':authority': 'example.com',
    ':scheme': 'https',
  };

  const finalHeaders = headers || defaultHeaders;

  // Extract pseudo-headers for request metadata
  const method = finalHeaders[':method'] || 'GET';
  const path = finalHeaders[':path'] || '/';
  const scheme = finalHeaders[':scheme'] || 'https';

  return {
    hook,
    request: {
      headers: finalHeaders,
      body: body || '',
      method,
      path,
      scheme,
    },
    response: {
      headers: {},
      body: '',
    },
    properties: {},
    logLevel: 0, // Trace level - capture all logs for test verification (stdout suppressed in test mode)
  };
}

/**
 * Assertion helper: Checks that a property was successfully read/written
 */
export function assertPropertyAccess(
  result: HookResult,
  propertyPath: string,
  operation: 'read' | 'write'
): void {
  if (hasPropertyAccessViolation(result)) {
    const violations = getPropertyAccessViolations(result);
    throw new Error(
      `Expected ${operation} of '${propertyPath}' to succeed, but found violations:\n${violations.join('\n')}`
    );
  }
}

/**
 * Assertion helper: Checks that a property access was denied
 */
export function assertPropertyAccessDenied(
  result: HookResult,
  propertyPath: string,
  operation: 'read' | 'write'
): void {
  if (!hasPropertyAccessViolation(result)) {
    throw new Error(
      `Expected ${operation} of '${propertyPath}' to be denied, but no violations were found`
    );
  }

  const violations = getPropertyAccessViolations(result);
  const relevantViolation = violations.find(v => v.includes(propertyPath));

  if (!relevantViolation) {
    throw new Error(
      `Expected violation for '${propertyPath}', but found violations for other properties:\n${violations.join('\n')}`
    );
  }
}
