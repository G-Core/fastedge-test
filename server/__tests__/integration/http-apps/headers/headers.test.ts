/**
 * HTTP WASM Runner - Headers Echo Tests
 *
 * Tests that request headers are echoed back in the response.
 * Runs the same assertions against all language variants (JS, Rust basic, Rust wasi).
 *
 * App behavior:
 *   - Copies all request headers into response headers
 *   - Adds my-custom-header from MY_CUSTOM_ENV_VAR env var
 *   - Returns body: "Returned all headers with a custom header added"
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { IWasmRunner } from '../../../../runner/IWasmRunner';
import { createHttpWasmRunner } from '../../utils/http-wasm-helpers';
import { runHttpRequest } from '../../../../test-framework/suite-runner';
import { assertHttpStatus, assertHttpHeader, assertHttpBody } from '../../../../test-framework/assertions';
import { HTTP_APP_VARIANTS, resolveWasmPath, wasmExists } from '../shared/variants';

for (const variant of HTTP_APP_VARIANTS) {
  const wasmPath = resolveWasmPath(variant, 'headers');
  const describeFn = wasmExists(variant, 'headers') ? describe : describe.skip;

  describeFn(`HTTP WASM - Headers [${variant.name}]`, () => {
    let runner: IWasmRunner;

    beforeAll(async () => {
      await new Promise(resolve => setTimeout(resolve, 2000));

      runner = createHttpWasmRunner();
      await runner.load(wasmPath);
    }, 30000);

    afterAll(async () => {
      await runner.cleanup();
    });

    it('should load headers WASM binary successfully', () => {
      expect(runner.getType()).toBe('http-wasm');
    });

    it('should echo request headers back in the response', async () => {
      const response = await runHttpRequest(runner, {
        path: '/',
        method: 'GET',
        headers: {
          'x-test-one': 'value-one',
          'x-test-two': 'value-two',
          'accept': 'text/html',
        },
        body: '',
      });

      assertHttpStatus(response, 200);
      assertHttpBody(response, 'Returned all headers with a custom header added');

      assertHttpHeader(response, 'x-test-one', 'value-one');
      assertHttpHeader(response, 'x-test-two', 'value-two');
      assertHttpHeader(response, 'accept', 'text/html');
    }, 10000);

    it('should include my-custom-header from env var', async () => {
      const response = await runHttpRequest(runner, {
        path: '/',
        method: 'GET',
        headers: {},
        body: '',
      });

      assertHttpStatus(response, 200);
      // my-custom-header should exist (value depends on env, may be empty string)
      assertHttpHeader(response, 'my-custom-header');
    }, 10000);
  });
}
