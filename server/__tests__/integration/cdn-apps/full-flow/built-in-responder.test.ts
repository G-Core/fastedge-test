/**
 * Built-In Responder Integration Tests
 *
 * Tests the built-in responder feature where targetUrl === "built-in"
 * generates a local response instead of making a real HTTP fetch.
 *
 * Control headers:
 *   x-debugger-status  — HTTP status code (default 200)
 *   x-debugger-content — "body-only" | "status-only" (default: full JSON echo)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import type { ProxyWasmRunner } from '../../../../runner/ProxyWasmRunner';
import { BUILTIN_URL } from '../../../../runner/ProxyWasmRunner';
import { loadCdnAppWasm, WASM_TEST_BINARIES } from '../../utils/wasm-loader';
import { createTestRunner } from '../../utils/test-helpers';
import {
  runFlow,
  assertFinalStatus,
  assertFinalHeader,
  assertReturnCode,
} from '../../../../test-framework';

describe('Built-In Responder', () => {
  let cdnRunner: ProxyWasmRunner;

  beforeAll(async () => {
    cdnRunner = createTestRunner();
    const cdnWasmBinary = await loadCdnAppWasm(
      'headers',
      WASM_TEST_BINARIES.cdnApps.headers.headersChange
    );
    await cdnRunner.load(Buffer.from(cdnWasmBinary));
  }, 30000);

  it('should return full JSON echo by default', async () => {
    const result = await runFlow(cdnRunner, {
      url: 'built-in',
      method: 'POST',
      requestHeaders: {
        'content-type': 'application/json',
        'x-test': 'hello',
      },
      requestBody: '{"ping":"pong"}',
    });

    assertFinalStatus(result, 200);

    const body = JSON.parse(result.finalResponse.body);
    expect(body.method).toBe('POST');
    expect(body.reqHeaders['x-test']).toBe('hello');
    expect(body.reqHeaders['content-type']).toBe('application/json');
    expect(body.reqBody).toBe('{"ping":"pong"}');
    expect(body.requestUrl).toBe(BUILTIN_URL);
  }, 15000);

  it('should strip x-debugger-* headers from the echo response', async () => {
    const result = await runFlow(cdnRunner, {
      url: 'built-in',
      requestHeaders: {
        'x-debugger-status': '201',
        'x-debugger-content': '',
        'x-keep-me': 'visible',
      },
    });

    const body = JSON.parse(result.finalResponse.body);
    expect(body.reqHeaders['x-debugger-status']).toBeUndefined();
    expect(body.reqHeaders['x-debugger-content']).toBeUndefined();
    expect(body.reqHeaders['x-keep-me']).toBe('visible');
  }, 15000);

  it('should use x-debugger-status to set response status code', async () => {
    const result = await runFlow(cdnRunner, {
      url: 'built-in',
      requestHeaders: { 'x-debugger-status': '404' },
    });

    assertFinalStatus(result, 404);
  }, 15000);

  it('should return request body only in body-only mode', async () => {
    const requestBody = '<h1>Hello World</h1>';

    const result = await runFlow(cdnRunner, {
      url: 'built-in',
      method: 'POST',
      requestHeaders: {
        'content-type': 'text/html',
        'x-debugger-content': 'body-only',
      },
      requestBody,
    });

    assertFinalStatus(result, 200);
    expect(result.finalResponse.contentType).toBe('text/html');
    // The body passes through WASM hooks which may modify it,
    // but the input to onResponseHeaders should be the request body
    expect(result.hookResults.onResponseHeaders.input.response.body).toBe(requestBody);
  }, 15000);

  it('should return empty body in status-only mode even when request has a body', async () => {
    const result = await runFlow(cdnRunner, {
      url: 'built-in',
      method: 'POST',
      requestHeaders: {
        'content-type': 'application/json',
        'x-debugger-content': 'status-only',
        'x-debugger-status': '204',
      },
      requestBody: JSON.stringify({ should: 'be discarded' }),
    });

    assertFinalStatus(result, 204);
    expect(result.hookResults.onResponseHeaders.input.response.body).toBe('');
  }, 15000);

  it('should execute all four hooks', async () => {
    const result = await runFlow(cdnRunner, { url: 'built-in' });

    expect(result.hookResults.onRequestHeaders).toBeDefined();
    expect(result.hookResults.onRequestBody).toBeDefined();
    expect(result.hookResults.onResponseHeaders).toBeDefined();
    expect(result.hookResults.onResponseBody).toBeDefined();

    // All hooks should have executed with Continue (0)
    assertReturnCode(result.hookResults.onRequestHeaders, 0);
    assertReturnCode(result.hookResults.onRequestBody, 0);
    assertReturnCode(result.hookResults.onResponseHeaders, 0);
    assertReturnCode(result.hookResults.onResponseBody, 0);
  }, 15000);

  it('should allow WASM to inject response headers (x-custom-response)', async () => {
    const result = await runFlow(cdnRunner, { url: 'built-in' });

    // The headers-change app injects x-custom-response in onResponseHeaders
    assertFinalHeader(result, 'x-custom-response', 'I am injected from onResponseHeaders');
  }, 15000);

  it('should include WASM-injected request headers in the echo', async () => {
    const result = await runFlow(cdnRunner, { url: 'built-in' });

    // The headers-change app injects x-custom-request in onRequestHeaders.
    // After onRequestBody, the built-in responder echoes modified headers.
    const body = JSON.parse(result.finalResponse.body);
    expect(body.reqHeaders['x-custom-request']).toBe('I am injected from onRequestHeaders');
  }, 15000);
});
