/**
 * Test helpers for HTTP WASM integration tests
 */

import { HttpWasmRunner } from '../../../runner/HttpWasmRunner';
import { PortManager } from '../../../runner/PortManager';
import type { IWasmRunner, HttpResponse } from '../../../runner/IWasmRunner';

/**
 * Shared PortManager instance for all HTTP WASM tests
 * This prevents port conflicts when running tests sequentially
 */
const sharedPortManager = new PortManager();

/**
 * Creates an HTTP WASM runner instance configured for integration testing
 *
 * @returns A configured HttpWasmRunner instance
 */
export function createHttpWasmRunner(): IWasmRunner {
  return new HttpWasmRunner(sharedPortManager, false); // Use shared port manager, disable dotenv
}

/**
 * Creates an HTTP WASM runner with dotenv enabled.
 * Use this for tests that need env vars or secrets loaded from dotenv files.
 *
 * Pass the fixture directory via load():
 *   await runner.load(wasmPath, { dotenv: { path: '/abs/path/to/fixtures' } })
 *
 * @returns A configured HttpWasmRunner instance with dotenv enabled
 */
export function createHttpWasmRunnerWithDotenv(): IWasmRunner {
  return new HttpWasmRunner(sharedPortManager, true);
}

/**
 * Checks if an HTTP response was successful (2xx status code)
 *
 * @param response - The HTTP response to check
 * @returns True if the response has a 2xx status code
 */
export function isSuccessResponse(response: HttpResponse): boolean {
  return response.status >= 200 && response.status < 300;
}

/**
 * Checks if logs contain a specific message substring
 *
 * @param response - The HTTP response with logs
 * @param messageSubstring - The substring to search for
 * @returns True if any log contains the substring
 */
export function logsContain(response: HttpResponse, messageSubstring: string): boolean {
  return response.logs.some((log) => log.message.includes(messageSubstring));
}

/**
 * Extracts log messages at a specific level
 *
 * @param response - The HTTP response with logs
 * @param level - The log level (0=trace, 1=debug, 2=info, 3=warn, 4=error)
 * @returns Array of log messages at the specified level
 */
export function getLogsAtLevel(response: HttpResponse, level: number): string[] {
  return response.logs
    .filter((log) => log.level === level)
    .map((log) => log.message);
}

/**
 * Checks if response body is base64 encoded
 *
 * @param response - The HTTP response to check
 * @returns True if the body is base64 encoded
 */
export function isBase64Encoded(response: HttpResponse): boolean {
  return response.isBase64 === true;
}

/**
 * Checks if response content type matches expected type
 *
 * @param response - The HTTP response to check
 * @param expectedType - The expected content type (can be partial match)
 * @returns True if content type matches
 */
export function hasContentType(response: HttpResponse, expectedType: string): boolean {
  return response.contentType?.toLowerCase().includes(expectedType.toLowerCase()) ?? false;
}

/**
 * Spawns an HTTP WASM app as a downstream service for integration testing
 *
 * This helper loads and starts an HTTP WASM app using HttpWasmRunner,
 * making it available as a downstream target for CDN app testing.
 *
 * The port is allocated by PortManager from the 8100-8199 range.
 * Since tests use a shared PortManager, the first runner gets 8100,
 * second gets 8101, etc.
 *
 * @param wasmBinary - The compiled WASM binary to run
 * @param expectedPort - The expected port (default 8100 for first runner)
 * @returns Object with runner instance and the expected port it's running on
 *
 * @example
 * ```typescript
 * // Spawn http-responder (will get port 8100 if it's the first runner)
 * const downstream = await spawnDownstreamHttpApp(httpResponderWasm);
 *
 * // Use in CDN app full-flow test
 * await cdnRunner.callFullFlow(`http://localhost:${downstream.port}/test`, ...);
 *
 * // Cleanup
 * await downstream.runner.cleanup();
 * ```
 */
export async function spawnDownstreamHttpApp(
  wasmBinary: Uint8Array,
  expectedPort: number = 8100
): Promise<{ runner: IWasmRunner; port: number }> {
  const runner = createHttpWasmRunner();

  // Load the WASM binary (HttpWasmRunner will allocate a port from PortManager)
  await runner.load(Buffer.from(wasmBinary));

  // Return the expected port (PortManager allocates sequentially from 8100)
  // In a test suite with clean state, first allocation is always 8100
  return {
    runner,
    port: expectedPort,
  };
}
