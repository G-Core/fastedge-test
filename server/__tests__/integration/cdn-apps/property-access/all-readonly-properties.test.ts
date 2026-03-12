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

describe('All Read-Only Properties - Integration Tests', () => {
  // Test properties - geolocation from fastedge-config.test.json + additional test values
  const testProperties = {
    'request.country': 'LU',
    'request.city': 'Luxembourg',
    'request.region': 'LU',
    'request.geo.lat': '49.6116',
    'request.geo.long': '6.1319',
    'request.continent': 'Europe',
    'request.country.name': 'Luxembourg',
    'request.asn': '64512', // Test ASN value
    'request.extension': 'html', // Test extension value (normally extracted from URL)
  };

  describe('valid-readonly-read.wasm - Reading all read-only properties', () => {
    let runner: ProxyWasmRunner;
    let wasmBinary: Uint8Array;

    beforeEach(async () => {
      runner = createTestRunner();
      wasmBinary = await loadCdnAppWasm(
        'properties',
        WASM_TEST_BINARIES.cdnApps.properties.validReadonlyRead
      );
    });

    it('should successfully read request.extension', async () => {
      await runner.load(Buffer.from(wasmBinary));

      const result = await runner.callHook({
        ...createHookCall('onRequestHeaders', {
          ':method': 'GET',
          ':path': '/test.html',
          ':authority': 'example.com',
          ':scheme': 'https',
        }),
        properties: testProperties,
      });

      // Extension should be readable and show value from test properties
      expect(hasPropertyAccessViolation(result)).toBe(false);
      expect(logsContain(result, 'Request Extension: html')).toBe(true);
    });

    it('should successfully read request.city', async () => {
      await runner.load(Buffer.from(wasmBinary));

      const result = await runner.callHook({
        ...createHookCall('onRequestHeaders', {
          ':method': 'GET',
          ':path': '/test',
          ':authority': 'example.com',
          ':scheme': 'https',
        }),
        properties: testProperties,
      });

      // City should be readable and show value from fastedge-config.test.json
      expect(hasPropertyAccessViolation(result)).toBe(false);
      expect(logsContain(result, 'Request City: Luxembourg')).toBe(true);
    });

    it('should successfully read request.asn', async () => {
      await runner.load(Buffer.from(wasmBinary));

      const result = await runner.callHook({
        ...createHookCall('onRequestHeaders', {
          ':method': 'GET',
          ':path': '/test',
          ':authority': 'example.com',
          ':scheme': 'https',
        }),
        properties: testProperties,
      });

      // ASN should be readable and show value from test properties
      expect(hasPropertyAccessViolation(result)).toBe(false);
      expect(logsContain(result, 'Request ASN: 64512')).toBe(true);
    });

    it('should successfully read request.geo.lat', async () => {
      await runner.load(Buffer.from(wasmBinary));

      const result = await runner.callHook({
        ...createHookCall('onRequestHeaders', {
          ':method': 'GET',
          ':path': '/test',
          ':authority': 'example.com',
          ':scheme': 'https',
        }),
        properties: testProperties,
      });

      // Geo latitude should be readable and show value from fastedge-config.test.json
      expect(hasPropertyAccessViolation(result)).toBe(false);
      expect(logsContain(result, 'Request Geo Lat: 49.6116')).toBe(true);
    });

    it('should successfully read request.geo.long', async () => {
      await runner.load(Buffer.from(wasmBinary));

      const result = await runner.callHook({
        ...createHookCall('onRequestHeaders', {
          ':method': 'GET',
          ':path': '/test',
          ':authority': 'example.com',
          ':scheme': 'https',
        }),
        properties: testProperties,
      });

      // Geo longitude should be readable and show value from fastedge-config.test.json
      expect(hasPropertyAccessViolation(result)).toBe(false);
      expect(logsContain(result, 'Request Geo Long: 6.1319')).toBe(true);
    });

    it('should successfully read request.region', async () => {
      await runner.load(Buffer.from(wasmBinary));

      const result = await runner.callHook({
        ...createHookCall('onRequestHeaders', {
          ':method': 'GET',
          ':path': '/test',
          ':authority': 'example.com',
          ':scheme': 'https',
        }),
        properties: testProperties,
      });

      // Region should be readable and show value from fastedge-config.test.json
      expect(hasPropertyAccessViolation(result)).toBe(false);
      expect(logsContain(result, 'Request Region: LU')).toBe(true);
    });

    it('should successfully read request.continent', async () => {
      await runner.load(Buffer.from(wasmBinary));

      const result = await runner.callHook({
        ...createHookCall('onRequestHeaders', {
          ':method': 'GET',
          ':path': '/test',
          ':authority': 'example.com',
          ':scheme': 'https',
        }),
        properties: testProperties,
      });

      // Continent should be readable and show value from fastedge-config.test.json
      expect(hasPropertyAccessViolation(result)).toBe(false);
      expect(logsContain(result, 'Request Continent: Europe')).toBe(true);
    });

    it('should successfully read request.country.name', async () => {
      await runner.load(Buffer.from(wasmBinary));

      const result = await runner.callHook({
        ...createHookCall('onRequestHeaders', {
          ':method': 'GET',
          ':path': '/test',
          ':authority': 'example.com',
          ':scheme': 'https',
        }),
        properties: testProperties,
      });

      // Country name should be readable and show value from fastedge-config.test.json
      expect(hasPropertyAccessViolation(result)).toBe(false);
      expect(logsContain(result, 'Request Country Name: Luxembourg')).toBe(true);
    });
  });

  describe('invalid-readonly-write.wasm - Writing to read-only properties', () => {
    let runner: ProxyWasmRunner;
    let wasmBinary: Uint8Array;

    beforeEach(async () => {
      runner = createTestRunner();
      wasmBinary = await loadCdnAppWasm(
        'properties',
        WASM_TEST_BINARIES.cdnApps.properties.invalidReadonlyWrite
      );
    });

    it('should deny writing to request.extension', async () => {
      await runner.load(Buffer.from(wasmBinary));

      const result = await runner.callHook({
        ...createHookCall('onRequestHeaders', {
          ':method': 'GET',
          ':path': '/test.html',
          ':authority': 'example.com',
          ':scheme': 'https',
        }),
        properties: testProperties,
      });

      expect(hasPropertyAccessViolation(result)).toBe(true);
      assertPropertyDenied(result, 'request.extension', 'write');

      const violations = getPropertyAccessViolations(result);
      expect(violations[0]).toContain('read-only');
    });

    it('should NOT modify request.extension value', async () => {
      await runner.load(Buffer.from(wasmBinary));

      const result = await runner.callHook({
        ...createHookCall('onRequestHeaders', {
          ':method': 'GET',
          ':path': '/test.html',
          ':authority': 'example.com',
          ':scheme': 'https',
        }),
        properties: testProperties,
      });

      // Extension should remain as original value (html), not changed to ".modified"
      expect(logsContain(result, 'Request Extension: html')).toBe(true);
      expect(logsContain(result, 'Request ALTERED Extension >> html')).toBe(true);
      expect(logsContain(result, 'Request ALTERED Extension >> .modified')).toBe(false);
    });

    it('should deny writing to request.city', async () => {
      await runner.load(Buffer.from(wasmBinary));

      const result = await runner.callHook({
        ...createHookCall('onRequestHeaders', {
          ':method': 'GET',
          ':path': '/test',
          ':authority': 'example.com',
          ':scheme': 'https',
        }),
        properties: testProperties,
      });

      expect(hasPropertyAccessViolation(result)).toBe(true);
      assertPropertyDenied(result, 'request.city', 'write');

      const violations = getPropertyAccessViolations(result);
      expect(violations.some(v => v.includes('read-only'))).toBe(true);
    });

    it('should NOT modify request.city value', async () => {
      await runner.load(Buffer.from(wasmBinary));

      const result = await runner.callHook({
        ...createHookCall('onRequestHeaders', {
          ':method': 'GET',
          ':path': '/test',
          ':authority': 'example.com',
          ':scheme': 'https',
        }),
        properties: testProperties,
      });

      // City should remain as original value, not "Modified City"
      expect(logsContain(result, 'Request City: Luxembourg')).toBe(true);
      expect(logsContain(result, 'Request ALTERED City >> Luxembourg')).toBe(true);
      expect(logsContain(result, 'Request ALTERED City >> Modified City')).toBe(false);
    });

    it('should deny writing to request.asn', async () => {
      await runner.load(Buffer.from(wasmBinary));

      const result = await runner.callHook({
        ...createHookCall('onRequestHeaders', {
          ':method': 'GET',
          ':path': '/test',
          ':authority': 'example.com',
          ':scheme': 'https',
        }),
        properties: testProperties,
      });

      expect(hasPropertyAccessViolation(result)).toBe(true);
      assertPropertyDenied(result, 'request.asn', 'write');

      const violations = getPropertyAccessViolations(result);
      expect(violations.some(v => v.includes('read-only'))).toBe(true);
    });

    it('should NOT modify request.asn value', async () => {
      await runner.load(Buffer.from(wasmBinary));

      const result = await runner.callHook({
        ...createHookCall('onRequestHeaders', {
          ':method': 'GET',
          ':path': '/test',
          ':authority': 'example.com',
          ':scheme': 'https',
        }),
        properties: testProperties,
      });

      // ASN should remain as original value (64512), not changed to "12345"
      expect(logsContain(result, 'Request ASN: 64512')).toBe(true);
      expect(logsContain(result, 'Request ALTERED ASN >> 64512')).toBe(true);
      expect(logsContain(result, 'Request ALTERED ASN >> 12345')).toBe(false);
    });

    it('should deny writing to request.geo.lat', async () => {
      await runner.load(Buffer.from(wasmBinary));

      const result = await runner.callHook({
        ...createHookCall('onRequestHeaders', {
          ':method': 'GET',
          ':path': '/test',
          ':authority': 'example.com',
          ':scheme': 'https',
        }),
        properties: testProperties,
      });

      expect(hasPropertyAccessViolation(result)).toBe(true);
      assertPropertyDenied(result, 'request.geo.lat', 'write');

      const violations = getPropertyAccessViolations(result);
      expect(violations.some(v => v.includes('read-only'))).toBe(true);
    });

    it('should NOT modify request.geo.lat value', async () => {
      await runner.load(Buffer.from(wasmBinary));

      const result = await runner.callHook({
        ...createHookCall('onRequestHeaders', {
          ':method': 'GET',
          ':path': '/test',
          ':authority': 'example.com',
          ':scheme': 'https',
        }),
        properties: testProperties,
      });

      // Latitude should remain as original value from fastedge-config.test.json
      expect(logsContain(result, 'Request Geo Lat: 49.6116')).toBe(true);
      expect(logsContain(result, 'Request ALTERED Geo Lat >> 49.6116')).toBe(true);
      expect(logsContain(result, 'Request ALTERED Geo Lat >> 99.9999')).toBe(false);
    });

    it('should deny writing to request.geo.long', async () => {
      await runner.load(Buffer.from(wasmBinary));

      const result = await runner.callHook({
        ...createHookCall('onRequestHeaders', {
          ':method': 'GET',
          ':path': '/test',
          ':authority': 'example.com',
          ':scheme': 'https',
        }),
        properties: testProperties,
      });

      expect(hasPropertyAccessViolation(result)).toBe(true);
      assertPropertyDenied(result, 'request.geo.long', 'write');

      const violations = getPropertyAccessViolations(result);
      expect(violations.some(v => v.includes('read-only'))).toBe(true);
    });

    it('should NOT modify request.geo.long value', async () => {
      await runner.load(Buffer.from(wasmBinary));

      const result = await runner.callHook({
        ...createHookCall('onRequestHeaders', {
          ':method': 'GET',
          ':path': '/test',
          ':authority': 'example.com',
          ':scheme': 'https',
        }),
        properties: testProperties,
      });

      // Longitude should remain as original value from fastedge-config.test.json
      expect(logsContain(result, 'Request Geo Long: 6.1319')).toBe(true);
      expect(logsContain(result, 'Request ALTERED Geo Long >> 6.1319')).toBe(true);
      expect(logsContain(result, 'Request ALTERED Geo Long >> 99.9999')).toBe(false);
    });

    it('should deny writing to request.region', async () => {
      await runner.load(Buffer.from(wasmBinary));

      const result = await runner.callHook({
        ...createHookCall('onRequestHeaders', {
          ':method': 'GET',
          ':path': '/test',
          ':authority': 'example.com',
          ':scheme': 'https',
        }),
        properties: testProperties,
      });

      expect(hasPropertyAccessViolation(result)).toBe(true);
      assertPropertyDenied(result, 'request.region', 'write');

      const violations = getPropertyAccessViolations(result);
      expect(violations.some(v => v.includes('read-only'))).toBe(true);
    });

    it('should NOT modify request.region value', async () => {
      await runner.load(Buffer.from(wasmBinary));

      const result = await runner.callHook({
        ...createHookCall('onRequestHeaders', {
          ':method': 'GET',
          ':path': '/test',
          ':authority': 'example.com',
          ':scheme': 'https',
        }),
        properties: testProperties,
      });

      // Region should remain as original value from fastedge-config.test.json
      expect(logsContain(result, 'Request Region: LU')).toBe(true);
      expect(logsContain(result, 'Request ALTERED Region >> LU')).toBe(true);
      expect(logsContain(result, 'Request ALTERED Region >> XX')).toBe(false);
    });

    it('should deny writing to request.continent', async () => {
      await runner.load(Buffer.from(wasmBinary));

      const result = await runner.callHook({
        ...createHookCall('onRequestHeaders', {
          ':method': 'GET',
          ':path': '/test',
          ':authority': 'example.com',
          ':scheme': 'https',
        }),
        properties: testProperties,
      });

      expect(hasPropertyAccessViolation(result)).toBe(true);
      assertPropertyDenied(result, 'request.continent', 'write');

      const violations = getPropertyAccessViolations(result);
      expect(violations.some(v => v.includes('read-only'))).toBe(true);
    });

    it('should NOT modify request.continent value', async () => {
      await runner.load(Buffer.from(wasmBinary));

      const result = await runner.callHook({
        ...createHookCall('onRequestHeaders', {
          ':method': 'GET',
          ':path': '/test',
          ':authority': 'example.com',
          ':scheme': 'https',
        }),
        properties: testProperties,
      });

      // Continent should remain as original value from fastedge-config.test.json
      expect(logsContain(result, 'Request Continent: Europe')).toBe(true);
      expect(logsContain(result, 'Request ALTERED Continent >> Europe')).toBe(true);
      expect(logsContain(result, 'Request ALTERED Continent >> Modified Continent')).toBe(false);
    });

    it('should deny writing to request.country.name', async () => {
      await runner.load(Buffer.from(wasmBinary));

      const result = await runner.callHook({
        ...createHookCall('onRequestHeaders', {
          ':method': 'GET',
          ':path': '/test',
          ':authority': 'example.com',
          ':scheme': 'https',
        }),
        properties: testProperties,
      });

      expect(hasPropertyAccessViolation(result)).toBe(true);
      assertPropertyDenied(result, 'request.country.name', 'write');

      const violations = getPropertyAccessViolations(result);
      expect(violations.some(v => v.includes('read-only'))).toBe(true);
    });

    it('should NOT modify request.country.name value', async () => {
      await runner.load(Buffer.from(wasmBinary));

      const result = await runner.callHook({
        ...createHookCall('onRequestHeaders', {
          ':method': 'GET',
          ':path': '/test',
          ':authority': 'example.com',
          ':scheme': 'https',
        }),
        properties: testProperties,
      });

      // Country name should remain as original value from fastedge-config.test.json
      expect(logsContain(result, 'Request Country Name: Luxembourg')).toBe(true);
      expect(logsContain(result, 'Request ALTERED Country Name >> Luxembourg')).toBe(true);
      expect(logsContain(result, 'Request ALTERED Country Name >> Modified Country')).toBe(false);
    });
  });
});
