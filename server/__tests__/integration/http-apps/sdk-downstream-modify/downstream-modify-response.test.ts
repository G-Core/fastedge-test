/**
 * HTTP WASM Runner - Downstream Fetch & Modify Response Tests
 *
 * Tests for HTTP WASM app that fetches from downstream API and modifies the response.
 *
 * App behavior:
 * - Fetches from http://jsonplaceholder.typicode.com/users
 * - Slices response to first 5 users
 * - Returns modified JSON with structure: { users: [...], total: 5, skip: 0, limit: 30 }
 *
 * Note: Only tests specific functionality - basic runner tests are in sdk-basic suite
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'path';
import type { IWasmRunner, HttpResponse } from '../../../../runner/IWasmRunner';
import { WASM_TEST_BINARIES } from '../../utils/wasm-loader';
import {
  createHttpWasmRunner,
  isSuccessResponse,
  hasContentType,
} from '../../utils/http-wasm-helpers';

// Fixed: Timeout issues resolved by increasing per-request timeout to 5s (for downstream fetches)
// Now using path-based loading for faster test execution
describe('HTTP WASM Runner - Downstream Fetch & Modify', () => {
  let runner: IWasmRunner;
  let wasmPath: string;

  // Load once before all tests - path-based loading for performance
  beforeAll(async () => {
    // Small delay to allow ports to be fully released from previous test file
    await new Promise(resolve => setTimeout(resolve, 2000));

    runner = createHttpWasmRunner();

    // Get file path from wasm output directory
    wasmPath = join(
      process.cwd(),
      'wasm',
      'http-apps',
      'basic-examples',
      'downstream-fetch.wasm'
    );

    // Load from path (faster and no temp file needed!)
    await runner.load(wasmPath);
  }, 30000); // 30s timeout (2s delay + load time, reduced from 40s)

  // Cleanup once after all tests
  afterAll(async () => {
    await runner.cleanup();
  });

  it('should load downstream-modify-response WASM binary successfully', async () => {
    // Already loaded in beforeAll
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
  }, 10000); // 10s timeout for downstream fetch

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

    // Parse JSON response
    const json = JSON.parse(response.body);

    // Verify structure
    expect(json).toHaveProperty('users');
    expect(json).toHaveProperty('total');
    expect(json).toHaveProperty('skip');
    expect(json).toHaveProperty('limit');

    // Verify types
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

    // Verify users array length
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

    // Verify first user has expected structure (from jsonplaceholder API)
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
    // Execute 3 requests to verify consistency
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

    // All responses should be successful
    responses.forEach((response, index) => {
      expect(isSuccessResponse(response), `Request ${index + 1} failed`).toBe(true);

      const json = JSON.parse(response.body);
      expect(json.users).toHaveLength(5);
      expect(json.total).toBe(5);
    });
  }, 30000); // 30s timeout for multiple requests
});
