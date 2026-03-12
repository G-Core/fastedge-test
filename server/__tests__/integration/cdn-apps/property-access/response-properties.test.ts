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
      expect(logsContain(result, 'Response Status: 200')).toBe(true);
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

      expect(logsContain(result, 'Response Status: 200')).toBe(true);
      expect(logsContain(result, 'Response ALTERED STATUS >> 200')).toBe(true);
      expect(logsContain(result, 'Response ALTERED STATUS >> 500')).toBe(false);
    });
  });
});
