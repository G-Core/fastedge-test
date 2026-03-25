import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runFlow, assertFinalStatus, assertFinalHeader, assertReturnCode } from '../../../../test-framework';
import { loadCdnAppWasm, WASM_TEST_BINARIES } from '../../utils/wasm-loader';
import { createTestRunner } from '../../utils/test-helpers';
import type { ProxyWasmRunner } from '../../../../runner/ProxyWasmRunner';

describe('CDN Redirect: send_http_response short-circuit', () => {
  let runner: ProxyWasmRunner;

  beforeAll(async () => {
    runner = createTestRunner();
    const wasmBinary = await loadCdnAppWasm(
      'redirect',
      WASM_TEST_BINARIES.cdnApps.redirect.redirect
    );
    await runner.load(Buffer.from(wasmBinary));
  }, 30000);

  afterAll(async () => {
    await runner.cleanup();
  });

  it('should return 302 with Location header when x-redirect-url is set', async () => {
    const result = await runFlow(runner, {
      url: 'http://unused.test/',
      requestHeaders: { 'x-redirect-url': 'https://example.com/landing' },
    });

    assertFinalStatus(result, 302);
    assertFinalHeader(result, 'location', 'https://example.com/landing');
  });

  it('should short-circuit before origin fetch — no downstream hooks execute', async () => {
    const result = await runFlow(runner, {
      url: 'http://unused.test/',
      requestHeaders: { 'x-redirect-url': 'https://example.com/landing' },
    });

    // These hooks only run after the origin fetch, so undefined = fetch never happened
    expect(result.hookResults.onRequestBody).toBeUndefined();
    expect(result.hookResults.onResponseHeaders).toBeUndefined();
    expect(result.hookResults.onResponseBody).toBeUndefined();

    // Only onRequestHeaders ran — the response came from the local response path
    expect(Object.keys(result.hookResults)).toEqual(['onRequestHeaders']);
  });

  it('should return StopIteration (1) from onRequestHeaders', async () => {
    const result = await runFlow(runner, {
      url: 'http://unused.test/',
      requestHeaders: { 'x-redirect-url': 'https://example.com/landing' },
    });

    assertReturnCode(result.hookResults.onRequestHeaders, 1);
  });

  it('should proceed normally when x-redirect-url is not set', async () => {
    const result = await runFlow(runner, {
      url: 'http://unused.test/',
      requestHeaders: {},
    });

    // Continue (0) — no redirect triggered
    expect(result.hookResults.onRequestHeaders.returnCode).toBe(0);
  });

  it('should return empty body for redirect response', async () => {
    const result = await runFlow(runner, {
      url: 'http://unused.test/',
      requestHeaders: { 'x-redirect-url': 'https://example.com/landing' },
    });

    assertFinalStatus(result, 302);
    expect(result.finalResponse.body).toBe('');
  });
});
