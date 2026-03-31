/**
 * CDN WASM Runner - proxy_http_call Tests
 *
 * Tests that proxy_http_call dispatch works correctly.
 * Runs the same assertions against all language variants (AS, Rust).
 *
 * Spins up a local HTTP server as the dispatch target.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFile } from 'fs/promises';
import { createTestRunner, createHookCall, logsContain } from '../../utils/test-helpers';
import {
  CDN_APP_VARIANTS,
  resolveCdnWasmPath,
  cdnWasmExists,
} from '../shared/variants';

const CATEGORY = 'http-call';
const WASM_FILE = 'http-call.wasm';

describe('http_call - proxy_http_call support', () => {
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
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

  for (const variant of CDN_APP_VARIANTS) {
    const wasmPath = resolveCdnWasmPath(variant, CATEGORY, WASM_FILE);
    const describeFn = cdnWasmExists(variant, CATEGORY, WASM_FILE)
      ? describe
      : describe.skip;

    describeFn(`[${variant.name}]`, () => {
      it('should dispatch http_call, receive response, and return Continue', async () => {
        const runner = createTestRunner();
        const wasmBinary = new Uint8Array(await readFile(wasmPath));
        await runner.load(Buffer.from(wasmBinary));

        const result = await runner.callHook(createHookCall('onRequestHeaders', {
          ':method': 'GET',
          ':path': '/test',
          ':authority': `127.0.0.1:${port}`,
          ':scheme': 'http',
        }));

        expect(result.returnCode).toBe(0);
        expect(logsContain(result, 'Received http call response with token id: 0')).toBe(true);
        expect(logsContain(result, 'User-Agent: Some(')).toBe(true);
        expect(logsContain(result, 'Response body: Some(')).toBe(true);
        expect(logsContain(result, 'HTTP call response was received successfully, resuming request.')).toBe(true);

        await runner.cleanup();
      });
    });
  }
});
