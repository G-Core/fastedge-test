/**
 * HTTP WASM Runner - Variables and Secrets Tests
 *
 * Tests that env vars and secrets loaded from dotenv files are accessible
 * at runtime via getEnv() and getSecret() in the FastEdge JS SDK.
 *
 * App: variables-and-secrets.wasm
 *   - Reads USERNAME via getEnv("USERNAME")
 *   - Reads PASSWORD via getSecret("PASSWORD")
 *   - Returns: "Username: <USERNAME>, Password: <PASSWORD>"
 *
 * Dotenv loading: fastedge-run --dotenv <fixtures-dir>
 *   - FASTEDGE_VAR_ENV_USERNAME  → env var USERNAME
 *   - FASTEDGE_VAR_SECRET_PASSWORD → secret PASSWORD
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'path';
import type { IWasmRunner } from '../../../../runner/IWasmRunner';
import {
  createHttpWasmRunnerWithDotenv,
  isSuccessResponse,
} from '../../utils/http-wasm-helpers';

const FIXTURES_DIR = join(process.cwd(), 'server/__tests__/integration/http-apps/sdk-variables-and-secrets/fixtures');
const WASM_PATH = join(process.cwd(), 'wasm/http-apps/basic-examples/variables-and-secrets.wasm');

describe('HTTP WASM Runner - Variables and Secrets', () => {
  let runner: IWasmRunner;

  beforeAll(async () => {
    // Small delay to allow ports to be fully released from previous test file
    await new Promise(resolve => setTimeout(resolve, 2000));

    runner = createHttpWasmRunnerWithDotenv();
    await runner.load(WASM_PATH, { dotenv: { path: FIXTURES_DIR } });
  }, 30000);

  afterAll(async () => {
    await runner.cleanup();
  });

  it('should load variables-and-secrets WASM binary successfully', () => {
    expect(runner.getType()).toBe('http-wasm');
  });

  it('should return 200 response', async () => {
    const response = await runner.execute({
      path: '/',
      method: 'GET',
      headers: {},
      body: '',
    });

    expect(isSuccessResponse(response)).toBe(true);
    expect(response.status).toBe(200);
  });

  it('should read USERNAME env var from dotenv file', async () => {
    const response = await runner.execute({
      path: '/',
      method: 'GET',
      headers: {},
      body: '',
    });

    expect(response.body).toContain('Username: test-user');
  });

  it('should read PASSWORD secret from dotenv file', async () => {
    const response = await runner.execute({
      path: '/',
      method: 'GET',
      headers: {},
      body: '',
    });

    expect(response.body).toContain('Password: test-secret');
  });

  it('should return both values in the expected format', async () => {
    const response = await runner.execute({
      path: '/',
      method: 'GET',
      headers: {},
      body: '',
    });

    expect(response.body).toBe('Username: test-user, Password: test-secret');
  });

  it('should return values consistently across multiple requests', async () => {
    for (let i = 0; i < 3; i++) {
      const response = await runner.execute({
        path: '/',
        method: 'GET',
        headers: {},
        body: '',
      });

      expect(response.body).toBe('Username: test-user, Password: test-secret');
    }
  });
});
