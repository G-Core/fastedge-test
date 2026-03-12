import { describe, it, expect, beforeEach } from 'vitest';
import type { ProxyWasmRunner } from '../../../../runner/ProxyWasmRunner';
import { loadCdnAppWasm, WASM_TEST_BINARIES } from '../../utils/wasm-loader';
import {
  createTestRunner,
  createHookCall,
  hasPropertyAccessViolation,
  logsContain,
} from '../../utils/test-helpers';
import { assertPropertyReadable, assertPropertyWritable } from '../../utils/property-assertions';

describe('Read-Write Properties - Integration Tests', () => {
  describe('valid-path-write.wasm - request.path', () => {
    let runner: ProxyWasmRunner;
    let wasmBinary: Uint8Array;

    beforeEach(async () => {
      runner = createTestRunner();
      wasmBinary = await loadCdnAppWasm(
        'properties',
        WASM_TEST_BINARIES.cdnApps.properties.validPathWrite
      );
    });

    it('should allow writing to request.path in onRequestHeaders', async () => {
      await runner.load(Buffer.from(wasmBinary));

      const result = await runner.callHook(createHookCall('onRequestHeaders', {
        ':method': 'GET',
        ':path': '/test',
        ':authority': 'example.com',
        ':scheme': 'https',
      }));

      assertPropertyWritable(result, 'request.path', '/new-path');
      expect(logsContain(result, 'Request Path: /test')).toBe(true);
    });
  });

  describe('valid-url-write.wasm - request.url', () => {
    let runner: ProxyWasmRunner;
    let wasmBinary: Uint8Array;

    beforeEach(async () => {
      runner = createTestRunner();
      wasmBinary = await loadCdnAppWasm(
        'properties',
        WASM_TEST_BINARIES.cdnApps.properties.validUrlWrite
      );
    });

    it('should allow writing to request.url in onRequestHeaders', async () => {
      await runner.load(Buffer.from(wasmBinary));

      const result = await runner.callHook(createHookCall('onRequestHeaders', {
        ':method': 'GET',
        ':path': '/test',
        ':authority': 'example.com',
        ':scheme': 'https',
      }));

      expect(hasPropertyAccessViolation(result)).toBe(false);
      assertPropertyWritable(result, 'request.url', 'https://example.com/new-url');
    });
  });

  describe('valid-host-write.wasm - request.host', () => {
    let runner: ProxyWasmRunner;
    let wasmBinary: Uint8Array;

    beforeEach(async () => {
      runner = createTestRunner();
      wasmBinary = await loadCdnAppWasm(
        'properties',
        WASM_TEST_BINARIES.cdnApps.properties.validHostWrite
      );
    });

    it('should allow writing to request.host in onRequestHeaders', async () => {
      await runner.load(Buffer.from(wasmBinary));

      const result = await runner.callHook(createHookCall('onRequestHeaders', {
        ':method': 'GET',
        ':path': '/test',
        ':authority': 'example.com',
        ':scheme': 'https',
      }));

      expect(hasPropertyAccessViolation(result)).toBe(false);
      assertPropertyWritable(result, 'request.host', 'newhost.example.com');
    });
  });

  describe('valid-query-write.wasm - request.query', () => {
    let runner: ProxyWasmRunner;
    let wasmBinary: Uint8Array;

    beforeEach(async () => {
      runner = createTestRunner();
      wasmBinary = await loadCdnAppWasm(
        'properties',
        WASM_TEST_BINARIES.cdnApps.properties.validQueryWrite
      );
    });

    it('should allow writing to request.query in onRequestHeaders', async () => {
      await runner.load(Buffer.from(wasmBinary));

      const result = await runner.callHook(createHookCall('onRequestHeaders', {
        ':method': 'GET',
        ':path': '/test?foo=bar',
        ':authority': 'example.com',
        ':scheme': 'https',
      }));

      expect(hasPropertyAccessViolation(result)).toBe(false);
      assertPropertyWritable(result, 'request.query', 'newparam=value');
    });
  });
});
