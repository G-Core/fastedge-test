/**
 * HTTP WASM Runner - Basic Execution Tests
 *
 * Integration tests for HTTP WASM component model binaries
 * using the FastEdge-run CLI runner.
 *
 * Note: Tests run sequentially to avoid port conflicts and resource contention
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import type { IWasmRunner, HttpResponse } from '../../../../runner/IWasmRunner';
import { WASM_TEST_BINARIES } from '../../utils/wasm-loader';
import {
  createHttpWasmRunner,
  isSuccessResponse,
  logsContain,
  hasContentType,
  isBase64Encoded,
} from '../../utils/http-wasm-helpers';

describe.sequential('HTTP WASM Runner - Basic Execution', () => {
  describe.sequential('sdk-basic.wasm - Simple Request/Response', () => {
    let runner: IWasmRunner;
    let wasmPath: string;

    // Load once before all tests - path-based loading for performance!
    beforeAll(async () => {
      runner = createHttpWasmRunner();

      // Get file path from wasm output directory
      wasmPath = join(
        process.cwd(),
        'wasm',
        'http-apps',
        'basic-examples',
        'basic.wasm'
      );

      // Load from path (70-95% faster than buffer mode!)
      await runner.load(wasmPath);
    }, 20000); // 20s timeout for initial load (reduced from 30s)

    // Cleanup once after all tests
    afterAll(async () => {
      await runner.cleanup();
    });

    it('should load HTTP WASM binary successfully', async () => {
      // Already loaded in beforeAll
      expect(runner.getType()).toBe('http-wasm');
    });

    it('should execute GET request and return response', async () => {
      // Reuse already-loaded runner

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

  describe('Runner Type and Interface', () => {
    let runner: IWasmRunner;

    beforeEach(() => {
      runner = createHttpWasmRunner();
    });

    afterEach(async () => {
      await runner.cleanup();
      // Give the system time to fully release the port
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

  // Cleanup is already tested by:
  // 1. afterAll/afterEach hooks that run successfully throughout the suite
  // 2. The fact that sequential port allocation works without conflicts
  // 3. All tests completing without resource leaks
  // No need for separate cleanup tests - they cause resource contention when running in parallel with CDN tests
});
