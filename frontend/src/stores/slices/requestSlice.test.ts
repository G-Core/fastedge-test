import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppStore } from '../index';

describe('RequestSlice', () => {
  let cleanupStore: () => void;

  beforeEach(() => {
    // Clear localStorage to start fresh
    window.localStorage.clear();

    // Get a fresh store instance
    const { result, unmount } = renderHook(() => useAppStore());
    cleanupStore = unmount;

    // Reset to defaults and mark clean
    act(() => {
      result.current.resetRequest();
      result.current.resetConfig();
    });
  });

  afterEach(() => {
    if (cleanupStore) {
      cleanupStore();
    }
  });

  describe('initial state', () => {
    it('should have correct default values', () => {
      const { result } = renderHook(() => useAppStore());

      expect(result.current.method).toBe('POST');
      expect(result.current.url).toBe('https://cdn-origin-4732724.fastedge.cdn.gc.onl/');
      expect(result.current.requestHeaders).toEqual({});
      expect(result.current.requestBody).toBe('{"message": "Hello"}');
      expect(result.current.responseHeaders).toEqual({ 'content-type': 'application/json' });
      expect(result.current.responseBody).toBe('{"response": "OK"}');
    });
  });

  describe('setMethod', () => {
    it('should update method', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setMethod('GET');
      });

      expect(result.current.method).toBe('GET');
    });

    it('should mark dirty when method is updated', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.markClean();
        result.current.setMethod('PUT');
      });

      expect(result.current.isDirty).toBe(true);
    });

    it('should handle various HTTP methods', () => {
      const { result } = renderHook(() => useAppStore());
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'];

      methods.forEach(method => {
        act(() => {
          result.current.setMethod(method);
        });
        expect(result.current.method).toBe(method);
      });
    });
  });

  describe('setUrl', () => {
    it('should update URL', () => {
      const { result } = renderHook(() => useAppStore());
      const newUrl = 'https://example.com/api/test';

      act(() => {
        result.current.setUrl(newUrl);
      });

      expect(result.current.url).toBe(newUrl);
    });

    it('should mark dirty when URL is updated', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.markClean();
        result.current.setUrl('https://test.com');
      });

      expect(result.current.isDirty).toBe(true);
    });

    it('should handle empty URL', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setUrl('');
      });

      expect(result.current.url).toBe('');
    });
  });

  describe('setRequestHeaders', () => {
    it('should replace request headers', () => {
      const { result } = renderHook(() => useAppStore());
      const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer token' };

      act(() => {
        result.current.setRequestHeaders(headers);
      });

      expect(result.current.requestHeaders).toEqual(headers);
    });

    it('should mark dirty when request headers are set', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.markClean();
        result.current.setRequestHeaders({ 'X-Custom': 'value' });
      });

      expect(result.current.isDirty).toBe(true);
    });

    it('should handle empty headers object', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setRequestHeaders({ 'X-Test': 'value' });
        result.current.setRequestHeaders({});
      });

      expect(result.current.requestHeaders).toEqual({});
    });
  });

  describe('setRequestBody', () => {
    it('should update request body', () => {
      const { result } = renderHook(() => useAppStore());
      const body = '{"test": "data"}';

      act(() => {
        result.current.setRequestBody(body);
      });

      expect(result.current.requestBody).toBe(body);
    });

    it('should mark dirty when request body is updated', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.markClean();
        result.current.setRequestBody('new body');
      });

      expect(result.current.isDirty).toBe(true);
    });

    it('should handle empty body', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setRequestBody('');
      });

      expect(result.current.requestBody).toBe('');
    });
  });

  describe('setResponseHeaders', () => {
    it('should replace response headers', () => {
      const { result } = renderHook(() => useAppStore());
      const headers = { 'Cache-Control': 'no-cache', 'X-Custom': 'value' };

      act(() => {
        result.current.setResponseHeaders(headers);
      });

      expect(result.current.responseHeaders).toEqual(headers);
    });

    it('should mark dirty when response headers are set', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.markClean();
        result.current.setResponseHeaders({ 'X-Response': 'header' });
      });

      expect(result.current.isDirty).toBe(true);
    });
  });

  describe('setResponseBody', () => {
    it('should update response body', () => {
      const { result } = renderHook(() => useAppStore());
      const body = '{"result": "success"}';

      act(() => {
        result.current.setResponseBody(body);
      });

      expect(result.current.responseBody).toBe(body);
    });

    it('should mark dirty when response body is updated', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.markClean();
        result.current.setResponseBody('updated response');
      });

      expect(result.current.isDirty).toBe(true);
    });
  });

  describe('updateRequestHeader', () => {
    it('should add a new request header', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.updateRequestHeader('Authorization', 'Bearer token');
      });

      expect(result.current.requestHeaders['Authorization']).toBe('Bearer token');
    });

    it('should update existing request header', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.updateRequestHeader('Content-Type', 'application/json');
        result.current.updateRequestHeader('Content-Type', 'text/plain');
      });

      expect(result.current.requestHeaders['Content-Type']).toBe('text/plain');
    });

    it('should mark dirty when header is updated', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.markClean();
        result.current.updateRequestHeader('X-Test', 'value');
      });

      expect(result.current.isDirty).toBe(true);
    });

    it('should preserve other headers when updating', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setRequestHeaders({ 'X-First': 'first', 'X-Second': 'second' });
        result.current.updateRequestHeader('X-Third', 'third');
      });

      expect(result.current.requestHeaders).toEqual({
        'X-First': 'first',
        'X-Second': 'second',
        'X-Third': 'third',
      });
    });
  });

  describe('removeRequestHeader', () => {
    it('should remove a request header', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setRequestHeaders({ 'X-Remove': 'value', 'X-Keep': 'value' });
        result.current.removeRequestHeader('X-Remove');
      });

      expect(result.current.requestHeaders['X-Remove']).toBeUndefined();
      expect(result.current.requestHeaders['X-Keep']).toBe('value');
    });

    it('should mark dirty when header is removed', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setRequestHeaders({ 'X-Test': 'value' });
        result.current.markClean();
        result.current.removeRequestHeader('X-Test');
      });

      expect(result.current.isDirty).toBe(true);
    });

    it('should handle removing non-existent header', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setRequestHeaders({ 'X-Exists': 'value' });
        result.current.removeRequestHeader('X-NonExistent');
      });

      expect(result.current.requestHeaders).toEqual({ 'X-Exists': 'value' });
    });
  });

  describe('updateResponseHeader', () => {
    it('should add a new response header', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.updateResponseHeader('Cache-Control', 'no-cache');
      });

      expect(result.current.responseHeaders['Cache-Control']).toBe('no-cache');
    });

    it('should update existing response header', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.updateResponseHeader('Content-Type', 'application/json');
        result.current.updateResponseHeader('Content-Type', 'text/html');
      });

      expect(result.current.responseHeaders['Content-Type']).toBe('text/html');
    });

    it('should mark dirty when header is updated', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.markClean();
        result.current.updateResponseHeader('X-Response', 'header');
      });

      expect(result.current.isDirty).toBe(true);
    });
  });

  describe('removeResponseHeader', () => {
    it('should remove a response header', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setResponseHeaders({ 'X-Remove': 'value', 'X-Keep': 'value' });
        result.current.removeResponseHeader('X-Remove');
      });

      expect(result.current.responseHeaders['X-Remove']).toBeUndefined();
      expect(result.current.responseHeaders['X-Keep']).toBe('value');
    });

    it('should mark dirty when header is removed', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setResponseHeaders({ 'X-Test': 'value' });
        result.current.markClean();
        result.current.removeResponseHeader('X-Test');
      });

      expect(result.current.isDirty).toBe(true);
    });
  });

  describe('resetRequest', () => {
    it('should reset all request state to defaults', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setMethod('GET');
        result.current.setUrl('https://example.com');
        result.current.setRequestHeaders({ 'X-Custom': 'value' });
        result.current.setRequestBody('custom body');
        result.current.setResponseHeaders({ 'X-Response': 'value' });
        result.current.setResponseBody('custom response');
        result.current.resetRequest();
      });

      expect(result.current.method).toBe('POST');
      expect(result.current.url).toBe('https://cdn-origin-4732724.fastedge.cdn.gc.onl/');
      expect(result.current.requestHeaders).toEqual({});
      expect(result.current.requestBody).toBe('{"message": "Hello"}');
      expect(result.current.responseHeaders).toEqual({ 'content-type': 'application/json' });
      expect(result.current.responseBody).toBe('{"response": "OK"}');
    });

    it('should mark dirty when reset', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.markClean();
        result.current.resetRequest();
      });

      expect(result.current.isDirty).toBe(true);
    });
  });

  describe('Immer mutations', () => {
    it('should properly mutate state with Immer', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.updateRequestHeader('X-First', 'first');
      });

      const firstHeaders = result.current.requestHeaders;

      act(() => {
        result.current.updateRequestHeader('X-Second', 'second');
      });

      // Verify immutability - state should be different object
      expect(result.current.requestHeaders).not.toBe(firstHeaders);
      expect(result.current.requestHeaders).toEqual({
        'X-First': 'first',
        'X-Second': 'second',
      });
    });

    it('should handle multiple mutations in sequence', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setRequestHeaders({ 'Initial': 'value' });
        result.current.updateRequestHeader('Added', 'new');
        result.current.removeRequestHeader('Initial');
      });

      expect(result.current.requestHeaders).toEqual({ 'Added': 'new' });
    });
  });
});
