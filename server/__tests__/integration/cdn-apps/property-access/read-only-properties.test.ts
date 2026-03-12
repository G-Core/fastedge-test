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
import { assertPropertyDenied } from '../../utils/property-assertions';

describe('Read-Only Properties - Integration Tests', () => {
  describe('invalid-method-write.wasm - request.method', () => {
    let runner: ProxyWasmRunner;
    let wasmBinary: Uint8Array;

    beforeEach(async () => {
      runner = createTestRunner();
      wasmBinary = await loadCdnAppWasm(
        'properties',
        WASM_TEST_BINARIES.cdnApps.properties.invalidMethodWrite
      );
    });

    it('should deny writing to request.method (read-only)', async () => {
      await runner.load(Buffer.from(wasmBinary));

      const result = await runner.callHook(createHookCall('onRequestHeaders', {
        ':method': 'GET',
        ':path': '/test',
        ':authority': 'example.com',
        ':scheme': 'https',
      }));

      expect(hasPropertyAccessViolation(result)).toBe(true);
      assertPropertyDenied(result, 'request.method', 'write');

      const violations = getPropertyAccessViolations(result);
      expect(violations[0]).toContain('read-only');
    });

    it('should NOT modify request.method value', async () => {
      await runner.load(Buffer.from(wasmBinary));

      const result = await runner.callHook(createHookCall('onRequestHeaders', {
        ':method': 'GET',
        ':path': '/test',
        ':authority': 'example.com',
        ':scheme': 'https',
      }));

      expect(logsContain(result, 'Request Method: GET')).toBe(true);
      expect(logsContain(result, 'Request ALTERED METHOD >> GET')).toBe(true);
      expect(logsContain(result, 'Request ALTERED METHOD >> POST')).toBe(false);
    });
  });

  describe('invalid-scheme-write.wasm - request.scheme', () => {
    let runner: ProxyWasmRunner;
    let wasmBinary: Uint8Array;

    beforeEach(async () => {
      runner = createTestRunner();
      wasmBinary = await loadCdnAppWasm(
        'properties',
        WASM_TEST_BINARIES.cdnApps.properties.invalidSchemeWrite
      );
    });

    it('should deny writing to request.scheme (read-only)', async () => {
      await runner.load(Buffer.from(wasmBinary));

      const result = await runner.callHook(createHookCall('onRequestHeaders', {
        ':method': 'GET',
        ':path': '/test',
        ':authority': 'example.com',
        ':scheme': 'https',
      }));

      expect(hasPropertyAccessViolation(result)).toBe(true);
      assertPropertyDenied(result, 'request.scheme', 'write');

      const violations = getPropertyAccessViolations(result);
      expect(violations[0]).toContain('read-only');
    });

    it('should NOT modify request.scheme value', async () => {
      await runner.load(Buffer.from(wasmBinary));

      const result = await runner.callHook(createHookCall('onRequestHeaders', {
        ':method': 'GET',
        ':path': '/test',
        ':authority': 'example.com',
        ':scheme': 'https',
      }));

      expect(logsContain(result, 'Request Scheme: https')).toBe(true);
      expect(logsContain(result, 'Request ALTERED SCHEME >> https')).toBe(true);
      // Verify it's "https" not just "http" by checking for exact match
      expect(logsContain(result, 'ALTERED SCHEME >> http\n')).toBe(false);
    });
  });

  describe('invalid-geolocation-write.wasm - request.country', () => {
    let runner: ProxyWasmRunner;
    let wasmBinary: Uint8Array;

    beforeEach(async () => {
      runner = createTestRunner();
      wasmBinary = await loadCdnAppWasm(
        'properties',
        WASM_TEST_BINARIES.cdnApps.properties.invalidGeolocationWrite
      );
    });

    it('should deny writing to request.country (read-only geolocation)', async () => {
      await runner.load(Buffer.from(wasmBinary));

      const result = await runner.callHook(createHookCall('onRequestHeaders', {
        ':method': 'GET',
        ':path': '/test',
        ':authority': 'example.com',
        ':scheme': 'https',
      }));

      expect(hasPropertyAccessViolation(result)).toBe(true);
      assertPropertyDenied(result, 'request.country', 'write');

      const violations = getPropertyAccessViolations(result);
      expect(violations[0]).toContain('read-only');
    });

    it('should NOT modify request.country value', async () => {
      await runner.load(Buffer.from(wasmBinary));

      const result = await runner.callHook(createHookCall('onRequestHeaders', {
        ':method': 'GET',
        ':path': '/test',
        ':authority': 'example.com',
        ':scheme': 'https',
      }));

      // Country should remain as default value, not XX
      expect(logsContain(result, 'Request ALTERED COUNTRY >> XX')).toBe(false);
    });
  });
});
