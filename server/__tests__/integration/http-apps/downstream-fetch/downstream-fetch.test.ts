/**
 * HTTP WASM Runner - Downstream Fetch & Modify Response Tests
 *
 * Tests for HTTP WASM apps that fetch from a downstream API and modify the response.
 * Runs the same assertions against all language variants (JS, Rust sync, Rust async).
 *
 * App behavior:
 * - Fetches from http://jsonplaceholder.typicode.com/users
 * - Slices response to first 5 users
 * - Returns modified JSON with structure: { users: [...], total: 5, skip: 0, limit: 30 }
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { IWasmRunner, HttpResponse } from '../../../../runner/IWasmRunner';
import {
  createHttpWasmRunner,
  isSuccessResponse,
  hasContentType,
} from '../../utils/http-wasm-helpers';
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

    it('should make downstream fetch and return modified JSON response', async () => {
      const response = await runner.execute({
        path: '/',
        method: 'GET',
        headers: {},
        body: '',
      });

      expect(isSuccessResponse(response)).toBe(true);
      expect(response.status).toBe(200);
      expect(response.statusText).toBe('OK');
    }, 10000);

    it('should return application/json content-type', async () => {
      const response = await runner.execute({
        path: '/',
        method: 'GET',
        headers: {},
        body: '',
      });

      expect(hasContentType(response, 'application/json')).toBe(true);
    }, 10000);

    it('should return JSON with expected structure (users, total, skip, limit)', async () => {
      const response = await runner.execute({
        path: '/',
        method: 'GET',
        headers: {},
        body: '',
      });

      const json = JSON.parse(response.body);

      expect(json).toHaveProperty('users');
      expect(json).toHaveProperty('total');
      expect(json).toHaveProperty('skip');
      expect(json).toHaveProperty('limit');

      expect(Array.isArray(json.users)).toBe(true);
      expect(typeof json.total).toBe('number');
      expect(typeof json.skip).toBe('number');
      expect(typeof json.limit).toBe('number');
    }, 10000);

    it('should return exactly 5 users (sliced from downstream response)', async () => {
      const response = await runner.execute({
        path: '/',
        method: 'GET',
        headers: {},
        body: '',
      });

      const json = JSON.parse(response.body);

      expect(json.users).toHaveLength(5);
      expect(json.total).toBe(5);
    }, 10000);

    it('should return valid user objects with expected properties', async () => {
      const response = await runner.execute({
        path: '/',
        method: 'GET',
        headers: {},
        body: '',
      });

      const json = JSON.parse(response.body);

      const firstUser = json.users[0];
      expect(firstUser).toHaveProperty('id');
      expect(firstUser).toHaveProperty('name');
      expect(firstUser).toHaveProperty('username');
      expect(firstUser).toHaveProperty('email');
    }, 10000);

    it('should set skip to 0 and limit to 30', async () => {
      const response = await runner.execute({
        path: '/',
        method: 'GET',
        headers: {},
        body: '',
      });

      const json = JSON.parse(response.body);

      expect(json.skip).toBe(0);
      expect(json.limit).toBe(30);
    }, 10000);

    it('should work consistently across multiple requests', async () => {
      const responses: HttpResponse[] = [];

      for (let i = 0; i < 3; i++) {
        const response = await runner.execute({
          path: '/',
          method: 'GET',
          headers: {},
          body: '',
        });
        responses.push(response);
      }

      responses.forEach((response, index) => {
        expect(isSuccessResponse(response), `Request ${index + 1} failed`).toBe(true);

        const json = JSON.parse(response.body);
        expect(json.users).toHaveLength(5);
        expect(json.total).toBe(5);
      });
    }, 30000);
  });
}
