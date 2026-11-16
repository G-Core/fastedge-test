import { describe, it, expect, beforeEach } from 'vitest';
import type { ProxyWasmRunner } from '../../../../runner/ProxyWasmRunner';
import { loadCdnAppWasm, WASM_TEST_BINARIES } from '../../utils/wasm-loader';
import {
  createTestRunner,
  createHookCall,
  hasPropertyAccessViolation,
} from '../../utils/test-helpers';
import { assertPropertyWriteIgnored } from '../../utils/property-assertions';

describe('Property Access Across Different Hooks', () => {
  let runner: ProxyWasmRunner;

  beforeEach(() => {
    runner = createTestRunner();
  });

  describe('Request properties in request hooks', () => {
    it('should allow writing request.path in onRequestHeaders', async () => {
      const validPathWasm = await loadCdnAppWasm(
        'properties',
        WASM_TEST_BINARIES.cdnApps.properties.validPathWrite
      );
      await runner.load(Buffer.from(validPathWasm));

      const result = await runner.callHook(
        createHookCall('onRequestHeaders', {
          ':method': 'GET',
          ':path': '/test',
          ':authority': 'example.com',
          ':scheme': 'https',
        })
      );

      expect(hasPropertyAccessViolation(result)).toBe(false);
    });

    it('accepts a write to request.method with no effect, as on the edge', async () => {
      const invalidMethodWasm = await loadCdnAppWasm(
        'properties',
        WASM_TEST_BINARIES.cdnApps.properties.invalidMethodWrite
      );
      await runner.load(Buffer.from(invalidMethodWasm));

      const result = await runner.callHook(
        createHookCall('onRequestHeaders', {
          ':method': 'GET',
          ':path': '/test',
          ':authority': 'example.com',
          ':scheme': 'https',
        })
      );

      // request.method cannot be changed; in onRequestHeaders the edge returns Ok with no effect
      assertPropertyWriteIgnored(result, 'request.method');
    });
  });

  describe('Response properties in response hooks', () => {
    it('should allow reading response.status in onResponseHeaders', async () => {
      const validResponseStatusWasm = await loadCdnAppWasm(
        'properties',
        WASM_TEST_BINARIES.cdnApps.properties.validResponseStatusRead
      );
      await runner.load(Buffer.from(validResponseStatusWasm));

      const result = await runner.callHook(
        createHookCall('onResponseHeaders', {
          ':status': '200',
          'content-type': 'text/plain',
        })
      );

      expect(hasPropertyAccessViolation(result)).toBe(false);
    });

    it('accepts a write to response.status with no effect, as on the edge', async () => {
      const invalidResponseStatusWasm = await loadCdnAppWasm(
        'properties',
        WASM_TEST_BINARIES.cdnApps.properties.invalidResponseStatusWrite
      );
      await runner.load(Buffer.from(invalidResponseStatusWasm));

      const result = await runner.callHook(
        createHookCall('onResponseHeaders', {
          ':status': '200',
          'content-type': 'text/plain',
        })
      );

      // response.status cannot be changed; the edge accepts the write with no effect
      assertPropertyWriteIgnored(result, 'response.status');
    });
  });
});
