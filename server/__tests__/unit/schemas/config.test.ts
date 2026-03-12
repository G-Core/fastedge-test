import { describe, it, expect } from 'vitest';
import {
  TestConfigSchema,
  RequestConfigSchema,
  WasmConfigSchema,
  ResponseConfigSchema,
} from '../../../schemas/config';

const minimalValidRequest = { url: 'https://example.com' };

describe('WasmConfigSchema', () => {
  it('should require path', () => {
    expect(WasmConfigSchema.safeParse({}).success).toBe(false);
  });

  it('should accept path only', () => {
    expect(WasmConfigSchema.safeParse({ path: '/wasm/app.wasm' }).success).toBe(true);
  });

  it('should accept optional description', () => {
    const result = WasmConfigSchema.safeParse({ path: '/wasm/app.wasm', description: 'My app' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.description).toBe('My app');
  });
});

describe('RequestConfigSchema', () => {
  it('should require url', () => {
    expect(RequestConfigSchema.safeParse({}).success).toBe(false);
  });

  it('should default method to GET', () => {
    const result = RequestConfigSchema.safeParse({ url: 'https://example.com' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.method).toBe('GET');
  });

  it('should default headers to {}', () => {
    const result = RequestConfigSchema.safeParse({ url: 'https://example.com' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.headers).toEqual({});
  });

  it('should default body to empty string', () => {
    const result = RequestConfigSchema.safeParse({ url: 'https://example.com' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.body).toBe('');
  });

  it('should accept a custom method', () => {
    const result = RequestConfigSchema.safeParse({ url: 'https://example.com', method: 'POST' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.method).toBe('POST');
  });

  it('should reject non-string header values', () => {
    const result = RequestConfigSchema.safeParse({
      url: 'https://example.com',
      headers: { 'x-count': 42 },
    });
    expect(result.success).toBe(false);
  });
});

describe('ResponseConfigSchema', () => {
  it('should be valid with empty object', () => {
    expect(ResponseConfigSchema.safeParse({}).success).toBe(true);
  });

  it('should default headers to {}', () => {
    const result = ResponseConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.headers).toEqual({});
  });

  it('should default body to empty string', () => {
    const result = ResponseConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.body).toBe('');
  });
});

describe('TestConfigSchema', () => {
  describe('required fields', () => {
    it('should require request', () => {
      expect(TestConfigSchema.safeParse({}).success).toBe(false);
    });

    it('should require request.url', () => {
      expect(TestConfigSchema.safeParse({ request: {} }).success).toBe(false);
    });

    it('should accept minimal valid config', () => {
      expect(TestConfigSchema.safeParse({ request: minimalValidRequest }).success).toBe(true);
    });
  });

  describe('defaults', () => {
    it('should default dotenvEnabled to true', () => {
      const result = TestConfigSchema.safeParse({ request: minimalValidRequest });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.dotenvEnabled).toBe(true);
    });

    it('should default properties to {}', () => {
      const result = TestConfigSchema.safeParse({ request: minimalValidRequest });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.properties).toEqual({});
    });
  });

  describe('optional fields', () => {
    it('should accept $schema string', () => {
      const result = TestConfigSchema.safeParse({
        request: minimalValidRequest,
        $schema: './schemas/test-config.schema.json',
      });
      expect(result.success).toBe(true);
    });

    it('should accept wasm config', () => {
      const result = TestConfigSchema.safeParse({
        request: minimalValidRequest,
        wasm: { path: '/wasm/app.wasm' },
      });
      expect(result.success).toBe(true);
    });

    it('should accept properties with mixed value types', () => {
      const result = TestConfigSchema.safeParse({
        request: minimalValidRequest,
        properties: { country: 'US', age: 30, active: true },
      });
      expect(result.success).toBe(true);
    });
  });
});
