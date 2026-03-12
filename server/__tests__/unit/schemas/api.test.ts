import { describe, it, expect } from 'vitest';
import {
  ApiLoadBodySchema,
  ApiSendBodySchema,
  ApiCallBodySchema,
  ApiConfigBodySchema,
} from '../../../schemas/api';

describe('ApiLoadBodySchema', () => {
  describe('XOR validation (wasmBase64 / wasmPath)', () => {
    it('should accept wasmPath only', () => {
      expect(ApiLoadBodySchema.safeParse({ wasmPath: '/wasm/app.wasm' }).success).toBe(true);
    });

    it('should accept wasmBase64 only', () => {
      expect(ApiLoadBodySchema.safeParse({ wasmBase64: 'AGFzbQE=' }).success).toBe(true);
    });

    it('should reject when neither is provided', () => {
      const result = ApiLoadBodySchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map(i => i.message);
        expect(messages).toContain('Either wasmBase64 or wasmPath must be provided');
      }
    });

    it('should reject when both are provided', () => {
      const result = ApiLoadBodySchema.safeParse({
        wasmBase64: 'AGFzbQE=',
        wasmPath: '/wasm/app.wasm',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map(i => i.message);
        expect(messages).toContain('Provide either wasmBase64 or wasmPath, not both');
      }
    });
  });

  describe('defaults', () => {
    it('should default dotenvEnabled to true', () => {
      const result = ApiLoadBodySchema.safeParse({ wasmPath: '/wasm/app.wasm' });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.dotenvEnabled).toBe(true);
    });

    it('should accept explicit dotenvEnabled false', () => {
      const result = ApiLoadBodySchema.safeParse({ wasmPath: '/wasm/app.wasm', dotenvEnabled: false });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.dotenvEnabled).toBe(false);
    });
  });
});

describe('ApiSendBodySchema', () => {
  describe('url validation', () => {
    it('should accept a valid URL', () => {
      expect(ApiSendBodySchema.safeParse({ url: 'https://example.com/path' }).success).toBe(true);
    });

    it('should reject a non-URL string', () => {
      expect(ApiSendBodySchema.safeParse({ url: 'not-a-url' }).success).toBe(false);
    });

    it('should reject missing url', () => {
      expect(ApiSendBodySchema.safeParse({}).success).toBe(false);
    });
  });

  describe('defaults', () => {
    it('should default properties to {}', () => {
      const result = ApiSendBodySchema.safeParse({ url: 'https://example.com' });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.properties).toEqual({});
    });
  });
});

describe('ApiCallBodySchema', () => {
  describe('hook enum', () => {
    const validHooks = ['onRequestHeaders', 'onRequestBody', 'onResponseHeaders', 'onResponseBody'];

    for (const hook of validHooks) {
      it(`should accept hook "${hook}"`, () => {
        expect(ApiCallBodySchema.safeParse({ hook }).success).toBe(true);
      });
    }

    it('should reject an invalid hook name', () => {
      expect(ApiCallBodySchema.safeParse({ hook: 'onUnknownHook' }).success).toBe(false);
    });

    it('should reject missing hook', () => {
      expect(ApiCallBodySchema.safeParse({}).success).toBe(false);
    });
  });

  describe('optional request/response', () => {
    it('should accept hook with no request or response', () => {
      expect(ApiCallBodySchema.safeParse({ hook: 'onRequestHeaders' }).success).toBe(true);
    });

    it('should accept hook with request and response', () => {
      const result = ApiCallBodySchema.safeParse({
        hook: 'onRequestHeaders',
        request: { headers: { 'content-type': 'application/json' }, body: '' },
        response: { headers: {}, body: '' },
      });
      expect(result.success).toBe(true);
    });

    it('should reject non-string request header values', () => {
      const result = ApiCallBodySchema.safeParse({
        hook: 'onRequestHeaders',
        request: { headers: { 'x-count': 42 }, body: '' },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('defaults', () => {
    it('should default properties to {}', () => {
      const result = ApiCallBodySchema.safeParse({ hook: 'onRequestHeaders' });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.properties).toEqual({});
    });
  });
});

describe('ApiConfigBodySchema', () => {
  it('should require config', () => {
    expect(ApiConfigBodySchema.safeParse({}).success).toBe(false);
  });

  it('should require config.request.url', () => {
    expect(ApiConfigBodySchema.safeParse({ config: { request: {} } }).success).toBe(false);
  });

  it('should accept a valid config', () => {
    const result = ApiConfigBodySchema.safeParse({
      config: { request: { url: 'https://example.com' } },
    });
    expect(result.success).toBe(true);
  });

});
