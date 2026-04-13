import { describe, it, expect, beforeEach } from 'vitest';
import type { ProxyWasmRunner } from '../../../../runner/ProxyWasmRunner';
import { loadCdnAppWasm, WASM_TEST_BINARIES } from '../../utils/wasm-loader';
import {
  createTestRunner,
  createHookCall,
  hasPropertyAccessViolation,
  getPropertyAccessViolations,
  logsContain,
} from '../../utils/test-helpers';
import { assertPropertyReadable, assertPropertyDenied } from '../../utils/property-assertions';

describe('Response Properties - Integration Tests', () => {
  describe('valid-response-status-read.wasm - response.status read', () => {
    let runner: ProxyWasmRunner;
    let wasmBinary: Uint8Array;

    beforeEach(async () => {
      runner = createTestRunner();
      wasmBinary = await loadCdnAppWasm(
        'properties',
        WASM_TEST_BINARIES.cdnApps.properties.validResponseStatusRead
      );
    });

    it('should allow reading response.status in onResponseHeaders', async () => {
      await runner.load(Buffer.from(wasmBinary));

      const result = await runner.callHook(createHookCall('onResponseHeaders', {
        ':status': '200',
        'content-type': 'text/plain',
      }));

      expect(hasPropertyAccessViolation(result)).toBe(false);
      assertPropertyReadable(result, 'response.status');
      // Note: the test WASM binary decodes response.status as UTF-8 text, but
      // the real proxy-wasm host encodes it as 2-byte big-endian u16. The log
      // output will not be human-readable "200". The access control assertion
      // above is what matters here.
    });
  });

  describe('invalid-response-status-write.wasm - response.status write', () => {
    let runner: ProxyWasmRunner;
    let wasmBinary: Uint8Array;

    beforeEach(async () => {
      runner = createTestRunner();
      wasmBinary = await loadCdnAppWasm(
        'properties',
        WASM_TEST_BINARIES.cdnApps.properties.invalidResponseStatusWrite
      );
    });

    it('should deny writing to response.status (read-only)', async () => {
      await runner.load(Buffer.from(wasmBinary));

      const result = await runner.callHook(createHookCall('onResponseHeaders', {
        ':status': '200',
        'content-type': 'text/plain',
      }));

      expect(hasPropertyAccessViolation(result)).toBe(true);
      assertPropertyDenied(result, 'response.status', 'write');

      const violations = getPropertyAccessViolations(result);
      expect(violations[0]).toContain('read-only');
    });

    it('should NOT modify response.status value', async () => {
      await runner.load(Buffer.from(wasmBinary));

      const result = await runner.callHook(createHookCall('onResponseHeaders', {
        ':status': '200',
        'content-type': 'text/plain',
      }));

      // The test WASM binary tries to set_property("response.status", "500")
      // then re-reads it. The write should be denied, so the re-read should
      // return the original value (not 500). Since the value is now correctly
      // encoded as 2-byte big-endian u16, the UTF-8 decoded log won't match
      // "200" or "500" literally, but the write denial is what matters.
      expect(hasPropertyAccessViolation(result)).toBe(true);
      assertPropertyDenied(result, 'response.status', 'write');
      expect(logsContain(result, 'Response ALTERED STATUS >> 500')).toBe(false);
    });
  });
});
