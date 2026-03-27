/**
 * HTTP WASM Runner - Basic Execution Tests
 *
 * Integration tests for HTTP WASM binaries using the FastEdge-run CLI runner.
 * Runs the same assertions against all language variants (JS, Rust sync, Rust async).
 *
 * Note: Tests run sequentially to avoid port conflicts and resource contention
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import type { IWasmRunner } from '../../../../runner/IWasmRunner';
import {
  createHttpWasmRunner,
  isSuccessResponse,
  hasContentType,
  isBase64Encoded,
} from '../../utils/http-wasm-helpers';
import { HTTP_APP_VARIANTS, resolveWasmPath, wasmExists } from '../shared/variants';

// --- Parameterized tests: run against all available variants ---
for (const variant of HTTP_APP_VARIANTS) {
  const wasmPath = resolveWasmPath(variant, 'basic');
  const describeFn = wasmExists(variant, 'basic') ? describe.sequential : describe.skip;

  describeFn(`HTTP WASM - Basic Execution [${variant.name}]`, () => {
    let runner: IWasmRunner;

    beforeAll(async () => {
      runner = createHttpWasmRunner();
      await runner.load(wasmPath);
    }, 20000);

    afterAll(async () => {
      await runner.cleanup();
    });

    it('should load HTTP WASM binary successfully', async () => {
      expect(runner.getType()).toBe('http-wasm');
    });

    it('should execute GET request and return response', async () => {
      const response = await runner.execute({
        path: '/',
        method: 'GET',
        headers: {},
        body: '',
      });

      expect(isSuccessResponse(response)).toBe(true);
      expect(response.status).toBe(200);
      expect(response.statusText).toBe('OK');
    });

    it('should return correct content-type header', async () => {
      const response = await runner.execute({
        path: '/',
        method: 'GET',
        headers: {},
        body: '',
      });

      expect(hasContentType(response, 'text/plain')).toBe(true);
      expect(response.headers['content-type']).toContain('text/plain');
    });

    it('should return text body without base64 encoding', async () => {
      const response = await runner.execute({
        path: '/',
        method: 'GET',
        headers: {},
        body: '',
      });

      expect(isBase64Encoded(response)).toBe(false);
      expect(response.body).toContain('You made a request');
    });

    it('should capture logs from WASM application', async () => {
      const response = await runner.execute({
        path: '/',
        method: 'GET',
        headers: {},
        body: '',
      });

      expect(response.logs.length).toBeGreaterThan(0);
      // console.log() from WASM app comes through stdout at level 2
      const hasAppLog = response.logs.some(log => log.level === 2 && log.message.includes('test-logging-string'));
      expect(hasAppLog).toBe(true);
    });

    it('should handle path with query parameters', async () => {
      const response = await runner.execute({
        path: '/test?foo=bar&baz=qux',
        method: 'GET',
        headers: {},
        body: '',
      });

      expect(isSuccessResponse(response)).toBe(true);
      expect(response.status).toBe(200);
    });

    it('should pass custom headers to WASM app', async () => {
      const response = await runner.execute({
        path: '/',
        method: 'GET',
        headers: {
          'user-agent': 'test-agent',
          'x-custom-header': 'test-value',
        },
        body: '',
      });

      expect(isSuccessResponse(response)).toBe(true);
    });

    it('should handle POST request with body', async () => {
      const response = await runner.execute({
        path: '/',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ test: 'data' }),
      });

      expect(isSuccessResponse(response)).toBe(true);
    });
  });
}

// --- Non-variant tests: runner interface behavior (not WASM-specific) ---
describe('Runner Type and Interface', () => {
  let runner: IWasmRunner;

  beforeEach(() => {
    runner = createHttpWasmRunner();
  });

  afterEach(async () => {
    await runner.cleanup();
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  it('should report correct runner type', () => {
    expect(runner.getType()).toBe('http-wasm');
  });

  it('should throw error when executing without loading WASM', async () => {
    await expect(
      runner.execute({
        path: '/',
        method: 'GET',
        headers: {},
        body: '',
      })
    ).rejects.toThrow('HttpWasmRunner not loaded');
  });

  it('should throw error when calling proxy-wasm methods', async () => {
    await expect(
      runner.callHook({
        hook: 'onRequestHeaders',
        request: { headers: {}, body: '' },
        response: { headers: {}, body: '' },
        properties: {},
      })
    ).rejects.toThrow('not supported for HTTP WASM');

    await expect(
      runner.callFullFlow(
        'http://example.com',
        'GET',
        {},
        '',
        {},
        '',
        200,
        'OK',
        {},
        true
      )
    ).rejects.toThrow('not supported for HTTP WASM');
  });
});
