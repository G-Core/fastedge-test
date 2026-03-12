import { describe, it, expect, beforeEach } from 'vitest';
import type { ProxyWasmRunner } from '../../../../runner/ProxyWasmRunner';
import { loadCdnAppWasm, WASM_TEST_BINARIES } from '../../utils/wasm-loader';
import {
  createTestRunner,
  createHookCall,
  hasPropertyAccessViolation,
  logsContain,
} from '../../utils/test-helpers';
import { assertLogContains } from '../../utils/property-assertions';

describe('nginx Properties - Integration Tests', () => {
  describe('valid-nginx-log-write.wasm - nginx.log_field1', () => {
    let runner: ProxyWasmRunner;
    let wasmBinary: Uint8Array;

    beforeEach(async () => {
      runner = createTestRunner();
      wasmBinary = await loadCdnAppWasm(
        'properties',
        WASM_TEST_BINARIES.cdnApps.properties.validNginxLogWrite
      );
    });

    it('should allow writing to nginx.log_field1 (write-only)', async () => {
      await runner.load(Buffer.from(wasmBinary));

      const result = await runner.callHook(createHookCall('onRequestHeaders', {
        ':method': 'GET',
        ':path': '/test',
        ':authority': 'example.com',
        ':scheme': 'https',
      }));

      // Write-only property should not generate access violations
      expect(hasPropertyAccessViolation(result)).toBe(false);

      // Should log success message
      assertLogContains(result, 'Successfully wrote to nginx.log_field1');
    });

    it('should complete without errors when writing to write-only property', async () => {
      await runner.load(Buffer.from(wasmBinary));

      const result = await runner.callHook(createHookCall('onRequestHeaders', {
        ':method': 'GET',
        ':path': '/test',
        ':authority': 'example.com',
        ':scheme': 'https',
      }));

      // No access violations
      expect(hasPropertyAccessViolation(result)).toBe(false);

      // Hook executed successfully
      expect(result.returnCode).toBe(0); // FilterHeadersStatusValues.Continue
    });
  });
});
