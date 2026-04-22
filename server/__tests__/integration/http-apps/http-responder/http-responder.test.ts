/**
 * HTTP WASM Runner - http-responder Redirect Tests
 *
 * Regression tests asserting that 3xx responses from an HTTP WASM app are
 * surfaced to the caller verbatim — status code and Location header preserved
 * — rather than transparently followed by the runner. See
 * HttpWasmRunner.execute() (fetch is called with `redirect: "manual"`).
 *
 * App behaviour: when the request carries `x-redirect-url: <url>`,
 * http-responder returns 302 + `Location: <url>`. Otherwise it falls through
 * to its existing 200 JSON echo (exercised by other tests).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { IWasmRunner } from '../../../../runner/IWasmRunner';
import { createHttpWasmRunner } from '../../utils/http-wasm-helpers';
import { runHttpRequest } from '../../../../test-framework/suite-runner';
import { assertHttpStatus, assertHttpHeader } from '../../../../test-framework/assertions';
import { HTTP_APP_VARIANTS, resolveWasmPath, wasmExists } from '../shared/variants';

for (const variant of HTTP_APP_VARIANTS) {
  const wasmPath = resolveWasmPath(variant, 'http-responder');
  const describeFn = wasmExists(variant, 'http-responder') ? describe : describe.skip;

  describeFn(`HTTP WASM - http-responder redirect [${variant.name}]`, () => {
    let runner: IWasmRunner;

    beforeAll(async () => {
      await new Promise(resolve => setTimeout(resolve, 2000));

      runner = createHttpWasmRunner();
      await runner.load(wasmPath);
    }, 30000);

    afterAll(async () => {
      await runner.cleanup();
    });

    it('should surface a 302 with Location when x-redirect-url is set', async () => {
      const response = await runHttpRequest(runner, {
        path: '/',
        method: 'GET',
        headers: { 'x-redirect-url': 'https://example.com/landing' },
        body: '',
      });

      assertHttpStatus(response, 302);
      assertHttpHeader(response, 'location', 'https://example.com/landing');
    }, 10000);

    it('should preserve an external redirect target without attempting to follow it', async () => {
      // Uses an unroutable host — if the runner followed redirects it would
      // either return the fetch error or a 200/404 from a different target.
      const response = await runHttpRequest(runner, {
        path: '/',
        method: 'GET',
        headers: { 'x-redirect-url': 'http://redirect-target.invalid/path' },
        body: '',
      });

      assertHttpStatus(response, 302);
      assertHttpHeader(response, 'location', 'http://redirect-target.invalid/path');
    }, 10000);

    it('should preserve multiple Set-Cookie headers as string[] (RFC 6265 §3)', async () => {
      // Trigger the x-set-cookies branch in the WASM app. It emits two distinct
      // Set-Cookie headers. Per RFC 6265 §3, each must stay separate — the
      // runner surfaces them as a string[] via IncomingHttpHeaders, not a
      // comma-joined or last-wins string.
      const response = await runHttpRequest(runner, {
        path: '/',
        method: 'GET',
        headers: { 'x-set-cookies': '1' },
        body: '',
      });

      assertHttpStatus(response, 200);

      const setCookie = response.headers['set-cookie'];
      expect(Array.isArray(setCookie)).toBe(true);
      expect(setCookie).toEqual([
        'sid=abc; Path=/; HttpOnly',
        'theme=dark; Path=/',
      ]);

      // assertHttpHeader uses .includes() semantics for multi-valued headers
      // when the expected value is a single string.
      assertHttpHeader(response, 'set-cookie', 'sid=abc; Path=/; HttpOnly');
      assertHttpHeader(response, 'set-cookie', 'theme=dark; Path=/');

      // Exact array match form also works.
      assertHttpHeader(response, 'set-cookie', [
        'sid=abc; Path=/; HttpOnly',
        'theme=dark; Path=/',
      ]);
    }, 10000);
  });
}
