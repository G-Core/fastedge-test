/**
 * Integration test: proxy_http_call dispatched from every proxy-wasm hook.
 *
 * Test design
 * -----------
 * A local Node.js HTTP server (port assigned by the OS via listen(0)) acts as
 * both the http_call target and the downstream origin, matching the behaviour
 * of the http-responder WASM app: it echoes back `requestUrl`, `method`,
 * `reqHeaders`, and `reqBody` as JSON.
 *
 * The WASM app (all-hooks-http-call.wasm) reads :authority + :scheme from
 * the incoming request and calls a hook-specific path in each of the four
 * hooks:
 *
 *   onRequestHeaders  → /on-request-headers
 *   onRequestBody     → /on-request-body
 *   onResponseHeaders → /on-response-headers
 *   onResponseBody    → /on-response-body
 *
 * Because the server echoes the request URL, each hook's http_call response
 * contains its own path, making responses uniquely verifiable. The downstream
 * fetch (performed by callFullFlow between the request and response hooks) also
 * hits the same server at /downstream — giving 5 total server calls.
 *
 * Each hook's WASM logs are captured in the corresponding hookResult, so the
 * test can assert that:
 *   - the hook dispatched the call (dispatch log present)
 *   - the response was received (token log present)
 *   - the response body contains ONLY this hook's path (unique value proof)
 *   - all hooks returned Continue (returnCode 0)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { FullFlowResult } from '../../../../runner/types';
import { loadCdnAppWasm, WASM_TEST_BINARIES } from '../../utils/wasm-loader';
import { createTestRunner } from '../../utils/test-helpers';

// ---------------------------------------------------------------------------
// Echo server: mimics the http-responder WASM app response format
// ---------------------------------------------------------------------------

function startEchoServer(): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const reqHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        reqHeaders[k] = Array.isArray(v) ? v.join(', ') : (v ?? '');
      }

      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      req.on('end', () => {
        const port = (server.address() as AddressInfo).port;
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            hello: 'http-responder works!',
            method: req.method,
            reqHeaders,
            reqBody: body,
            requestUrl: `http://127.0.0.1:${port}${req.url}`,
          })
        );
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, port });
    });
    server.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('all-hooks-http-call: proxy_http_call dispatched in all four hooks', () => {
  let server: http.Server;
  let port: number;
  let result: FullFlowResult;

  beforeAll(async () => {
    // Start echo server on an OS-assigned port (no conflicts with other tests)
    ({ server, port } = await startEchoServer());

    const runner = createTestRunner();
    const wasmBinary = await loadCdnAppWasm(
      'http-call',
      WASM_TEST_BINARIES.cdnApps.httpCall.allHooksHttpCall,
    );
    await runner.load(Buffer.from(wasmBinary));

    // Single callFullFlow: server is called 5 times total
    //   onRequestHeaders  → http_call → /on-request-headers
    //   onRequestBody     → http_call → /on-request-body
    //   callFullFlow fetch           → /downstream
    //   onResponseHeaders → http_call → /on-response-headers
    //   onResponseBody    → http_call → /on-response-body
    //
    // No pseudo-headers (:authority, :scheme) are passed here because
    // callFullFlow forwards headers verbatim to the downstream fetch(), and
    // Node.js rejects header names that start with ':' (HTTP/2 pseudo-headers
    // are invalid in HTTP/1.1).  The runner auto-injects "host" from the URL,
    // and the WASM reads that as the http_call target (fallback path).
    result = await runner.callFullFlow(
      `http://127.0.0.1:${port}/downstream`,
      'GET',
      {},   // headers: runner auto-injects host=127.0.0.1:${port}
      '',   // request body
      {},   // response headers (filled by downstream)
      '',   // response body   (filled by downstream)
      200,
      'OK',
      {},   // properties
      true, // enforce production property rules
    );
  }, 30000);

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  // Helper: extract log messages for a given hook
  function logsFor(hook: keyof FullFlowResult['hookResults']): string[] {
    return result.hookResults[hook].logs.map((l) => l.message);
  }

  // -------------------------------------------------------------------------
  // All hooks present + all return Continue
  // -------------------------------------------------------------------------

  it('all four hook results are defined', () => {
    expect(result.hookResults.onRequestHeaders).toBeDefined();
    expect(result.hookResults.onRequestBody).toBeDefined();
    expect(result.hookResults.onResponseHeaders).toBeDefined();
    expect(result.hookResults.onResponseBody).toBeDefined();
  });

  it('all hooks return Continue (0) after http_call resolves', () => {
    expect(result.hookResults.onRequestHeaders.returnCode).toBe(0);
    expect(result.hookResults.onRequestBody.returnCode).toBe(0);
    expect(result.hookResults.onResponseHeaders.returnCode).toBe(0);
    expect(result.hookResults.onResponseBody.returnCode).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Downstream fetch (5th server call) succeeds
  // -------------------------------------------------------------------------

  it('downstream fetch returns 200 and echo-server payload', () => {
    expect(result.finalResponse.status).toBe(200);
    const body = JSON.parse(result.finalResponse.body);
    expect(body.hello).toBe('http-responder works!');
    expect(body.requestUrl).toContain('/downstream');
  });

  // -------------------------------------------------------------------------
  // Per-hook: dispatch logged, response received, correct path in body
  // -------------------------------------------------------------------------

  it('onRequestHeaders: dispatches http-call and receives /on-request-headers response', () => {
    const logs = logsFor('onRequestHeaders');

    expect(logs.some((m) => m.includes('[onRequestHeaders] dispatching http-call'))).toBe(true);
    expect(logs.some((m) => m.includes('[http-call] response received for token'))).toBe(true);

    // Response body must contain this hook's path
    const bodyLog = logs.find((m) => m.includes('[http-call] response body:'));
    expect(bodyLog).toBeDefined();
    expect(bodyLog).toContain('/on-request-headers');

    // Must NOT contain another hook's path in the response body
    expect(bodyLog).not.toContain('/on-request-body');
    expect(bodyLog).not.toContain('/on-response-headers');
    expect(bodyLog).not.toContain('/on-response-body');
  });

  it('onRequestBody: dispatches http-call and receives /on-request-body response', () => {
    const logs = logsFor('onRequestBody');

    expect(logs.some((m) => m.includes('[onRequestBody] dispatching http-call'))).toBe(true);
    expect(logs.some((m) => m.includes('[http-call] response received for token'))).toBe(true);

    const bodyLog = logs.find((m) => m.includes('[http-call] response body:'));
    expect(bodyLog).toBeDefined();
    expect(bodyLog).toContain('/on-request-body');

    expect(bodyLog).not.toContain('/on-request-headers');
    expect(bodyLog).not.toContain('/on-response-headers');
    expect(bodyLog).not.toContain('/on-response-body');
  });

  it('onResponseHeaders: dispatches http-call and receives /on-response-headers response', () => {
    const logs = logsFor('onResponseHeaders');

    expect(logs.some((m) => m.includes('[onResponseHeaders] dispatching http-call'))).toBe(true);
    expect(logs.some((m) => m.includes('[http-call] response received for token'))).toBe(true);

    const bodyLog = logs.find((m) => m.includes('[http-call] response body:'));
    expect(bodyLog).toBeDefined();
    expect(bodyLog).toContain('/on-response-headers');

    expect(bodyLog).not.toContain('/on-request-headers');
    expect(bodyLog).not.toContain('/on-request-body');
    expect(bodyLog).not.toContain('/on-response-body');
  });

  it('onResponseBody: dispatches http-call and receives /on-response-body response', () => {
    const logs = logsFor('onResponseBody');

    expect(logs.some((m) => m.includes('[onResponseBody] dispatching http-call'))).toBe(true);
    expect(logs.some((m) => m.includes('[http-call] response received for token'))).toBe(true);

    const bodyLog = logs.find((m) => m.includes('[http-call] response body:'));
    expect(bodyLog).toBeDefined();
    expect(bodyLog).toContain('/on-response-body');

    expect(bodyLog).not.toContain('/on-request-headers');
    expect(bodyLog).not.toContain('/on-request-body');
    expect(bodyLog).not.toContain('/on-response-headers');
  });

  // -------------------------------------------------------------------------
  // All hooks received the echo-server payload format
  // -------------------------------------------------------------------------

  it('every hook response body contains the echo-server signature', () => {
    const hooks = [
      'onRequestHeaders',
      'onRequestBody',
      'onResponseHeaders',
      'onResponseBody',
    ] as const;

    for (const hook of hooks) {
      const logs = logsFor(hook);
      const bodyLog = logs.find((m) => m.includes('[http-call] response body:'));
      expect(bodyLog, `${hook} should have a [http-call] response body log`).toBeDefined();
      expect(bodyLog, `${hook} response should contain echo signature`).toContain('http-responder works!');
    }
  });
});
