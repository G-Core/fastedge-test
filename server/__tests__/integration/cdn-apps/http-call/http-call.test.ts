import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { loadCdnAppWasm, WASM_TEST_BINARIES } from '../../utils/wasm-loader';
import { createTestRunner, createHookCall, logsContain } from '../../utils/test-helpers';

describe('http_call - proxy_http_call support', () => {
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    // Start a lightweight local HTTP server as the http_call target
    server = http.createServer((_req, res) => {
      res.writeHead(200, {
        'content-type': 'application/json',
        'user-agent': 'fastedge-test-server/1.0',
      });
      res.end(JSON.stringify({ hello: 'from test server' }));
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('should dispatch http_call, receive response, and return Continue', async () => {
    const runner = createTestRunner();
    const wasmBinary = await loadCdnAppWasm(
      'http-call',
      WASM_TEST_BINARIES.cdnApps.httpCall.httpCall,
    );
    await runner.load(Buffer.from(wasmBinary));

    // Point :authority at the local test server so the WASM dispatches there
    const result = await runner.callHook(createHookCall('onRequestHeaders', {
      ':method': 'GET',
      ':path': '/test',
      ':authority': `127.0.0.1:${port}`,
      ':scheme': 'http',
    }));

    // After the PAUSE loop resolves, returnCode should be Continue (0), not PAUSE (1)
    expect(result.returnCode).not.toBe(1);
    expect(result.returnCode).toBe(0);

    // WASM logs "Received http call response with token id: 0, ..."
    expect(logsContain(result, 'Received http call response with token id: 0')).toBe(true);

    // WASM logs "User-Agent: Some(...)" from the response header
    expect(logsContain(result, 'User-Agent: Some(')).toBe(true);

    // WASM logs the response body
    expect(logsContain(result, 'Response body: Some(')).toBe(true);

    // WASM logs the final state transition
    expect(logsContain(result, 'HTTP call response was received successfully, resuming request.')).toBe(true);
  });
});
