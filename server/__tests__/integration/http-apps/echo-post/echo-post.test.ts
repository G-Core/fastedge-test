/**
 * HTTP WASM Runner - Echo POST Tests
 *
 * Tests that POST request bodies are received and can be modified.
 * Runs the same assertions against all language variants (JS, Rust basic, Rust wasi).
 *
 * App behavior:
 *   - Accepts POST requests with JSON body
 *   - Parses the JSON, adds { "processed": true }
 *   - Returns the modified JSON
 *   - Returns 405 for non-POST methods
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { IWasmRunner } from '../../../../runner/IWasmRunner';
import { createHttpWasmRunner } from '../../utils/http-wasm-helpers';
import { runHttpRequest } from '../../../../test-framework/suite-runner';
import {
  assertHttpStatus,
  assertHttpContentType,
  assertHttpJson,
} from '../../../../test-framework/assertions';
import { HTTP_APP_VARIANTS, resolveWasmPath, wasmExists } from '../shared/variants';

for (const variant of HTTP_APP_VARIANTS) {
  const wasmPath = resolveWasmPath(variant, 'echo-post');
  const describeFn = wasmExists(variant, 'echo-post') ? describe : describe.skip;

  describeFn(`HTTP WASM - Echo POST [${variant.name}]`, () => {
    let runner: IWasmRunner;

    beforeAll(async () => {
      await new Promise(resolve => setTimeout(resolve, 2000));

      runner = createHttpWasmRunner();
      await runner.load(wasmPath);
    }, 30000);

    afterAll(async () => {
      await runner.cleanup();
    });

    it('should load echo-post WASM binary successfully', () => {
      expect(runner.getType()).toBe('http-wasm');
    });

    it('should accept POST with JSON body and return it with processed flag', async () => {
      const input = { name: 'test', value: 42 };

      const response = await runHttpRequest(runner, {
        path: '/',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });

      assertHttpStatus(response, 200);
      assertHttpContentType(response, 'application/json');

      const json = assertHttpJson<{ name: string; value: number; processed: boolean }>(response);
      expect(json.name).toBe('test');
      expect(json.value).toBe(42);
      expect(json.processed).toBe(true);
    }, 10000);

    it('should preserve nested JSON structures', async () => {
      const input = {
        user: { id: 1, tags: ['admin', 'active'] },
        meta: { created: '2026-01-01' },
      };

      const response = await runHttpRequest(runner, {
        path: '/',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });

      assertHttpStatus(response, 200);

      const json = assertHttpJson<{
        user: { id: number; tags: string[] };
        meta: { created: string };
        processed: boolean;
      }>(response);
      expect(json.user.id).toBe(1);
      expect(json.user.tags).toEqual(['admin', 'active']);
      expect(json.meta.created).toBe('2026-01-01');
      expect(json.processed).toBe(true);
    }, 10000);

    it('should return 405 for GET requests', async () => {
      const response = await runHttpRequest(runner, {
        path: '/',
        method: 'GET',
        headers: {},
        body: '',
      });

      assertHttpStatus(response, 405);
    }, 10000);
  });
}
