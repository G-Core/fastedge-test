/**
 * HTTP WASM Runner - Downstream Fetch & Modify Response Tests
 *
 * Tests for HTTP WASM apps that fetch from a downstream API and modify the response.
 * Runs the same assertions against all language variants (JS, Rust basic, Rust wasi).
 *
 * App behavior:
 * - Fetches from http://jsonplaceholder.typicode.com/users
 * - Slices response to first 5 users
 * - Returns modified JSON with structure: { users: [...], total: 5, skip: 0, limit: 30 }
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { IWasmRunner } from '../../../../runner/IWasmRunner';
import { runHttpRequest } from '../../../../test-framework/suite-runner';
import {
  assertHttpStatus,
  assertHttpContentType,
  assertHttpJson,
} from '../../../../test-framework/assertions';
import { createHttpWasmRunner } from '../../utils/http-wasm-helpers';
import { HTTP_APP_VARIANTS, resolveWasmPath, wasmExists } from '../shared/variants';

for (const variant of HTTP_APP_VARIANTS) {
  const wasmPath = resolveWasmPath(variant, 'downstream-fetch');
  const describeFn = wasmExists(variant, 'downstream-fetch') ? describe : describe.skip;

  describeFn(`HTTP WASM - Downstream Fetch [${variant.name}]`, () => {
    let runner: IWasmRunner;

    beforeAll(async () => {
      // Small delay to allow ports to be fully released from previous test file
      await new Promise(resolve => setTimeout(resolve, 2000));

      runner = createHttpWasmRunner();
      await runner.load(wasmPath);
    }, 30000);

    afterAll(async () => {
      await runner.cleanup();
    });

    it('should load downstream-fetch WASM binary successfully', async () => {
      expect(runner.getType()).toBe('http-wasm');
    });

    it('should fetch downstream, return JSON with 5 users and correct structure', async () => {
      const response = await runHttpRequest(runner, {
        path: '/',
        method: 'GET',
      });

      // Response basics
      assertHttpStatus(response, 200);
      assertHttpContentType(response, 'application/json');

      // JSON structure
      const json = assertHttpJson<{
        users: Array<{ id: number; name: string; username: string; email: string }>;
        total: number;
        skip: number;
        limit: number;
      }>(response);
      expect(Array.isArray(json.users)).toBe(true);
      expect(json.users).toHaveLength(5);
      expect(json.total).toBe(5);
      expect(json.skip).toBe(0);
      expect(json.limit).toBe(30);

      // User object shape
      const firstUser = json.users[0];
      expect(firstUser).toHaveProperty('id');
      expect(firstUser).toHaveProperty('name');
      expect(firstUser).toHaveProperty('username');
      expect(firstUser).toHaveProperty('email');
    }, 10000);

    it('should work consistently across multiple requests', async () => {
      for (let i = 0; i < 3; i++) {
        const response = await runHttpRequest(runner, {
          path: '/',
          method: 'GET',
        });

        assertHttpStatus(response, 200);

        const json = assertHttpJson<{ users: unknown[]; total: number }>(response);
        expect(json.users).toHaveLength(5);
        expect(json.total).toBe(5);
      }
    }, 30000);
  });
}
