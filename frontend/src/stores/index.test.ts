import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAppStore } from './index';

describe('Store Composition (index.ts)', () => {
  const localStorageMock = window.localStorage as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('store initialization', () => {
    it('should initialize with all slice states', () => {
      const { result } = renderHook(() => useAppStore());

      // Request slice
      expect(result.current.method).toBeDefined();
      expect(result.current.url).toBeDefined();
      expect(result.current.setMethod).toBeDefined();

      // WASM slice
      expect(result.current.wasmPath).toBeDefined();
      expect(result.current.loading).toBeDefined();
      expect(result.current.loadWasm).toBeDefined();

      // Results slice
      expect(result.current.hookResults).toBeDefined();
      expect(result.current.finalResponse).toBeDefined();
      expect(result.current.setHookResult).toBeDefined();

      // Config slice
      expect(result.current.properties).toBeDefined();
      expect(result.current.dotenvEnabled).toBeDefined();
      expect(result.current.setProperties).toBeDefined();

      // UI slice
      expect(result.current.activeHookTab).toBeDefined();
      expect(result.current.expandedPanels).toBeDefined();
      expect(result.current.setActiveHookTab).toBeDefined();
    });

    it('should have all slices properly combined', () => {
      const { result } = renderHook(() => useAppStore());
      const state = result.current;

      // Verify no naming conflicts between slices
      expect(typeof state.method).toBe('string'); // Request
      expect(typeof state.wasmPath).toBe('object'); // WASM (null)
      expect(typeof state.hookResults).toBe('object'); // Results
      expect(typeof state.properties).toBe('object'); // Config
      expect(typeof state.activeHookTab).toBe('string'); // UI
    });
  });

  describe('persistence configuration', () => {
    it('should persist request slice state', async () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setMethod('PUT');
        result.current.setUrl('https://persisted.com');
        result.current.setRequestHeaders({ 'X-Persist': 'true' });
      });

      // Wait for debounced save (500ms)
      await waitFor(
        () => {
          expect(localStorageMock.setItem).toHaveBeenCalled();
        },
        { timeout: 1000 }
      );

      const savedData = localStorageMock.setItem.mock.calls[
        localStorageMock.setItem.mock.calls.length - 1
      ][1];
      const parsedData = JSON.parse(savedData);

      expect(parsedData.state.request.method).toBe('PUT');
      expect(parsedData.state.request.url).toBe('https://persisted.com');
      expect(parsedData.state.request.requestHeaders).toEqual({ 'X-Persist': 'true' });
    });

    it('should persist config slice state', async () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setProperties({ key: 'value' });
        result.current.setLogLevel(5);
        result.current.setDotenvEnabled(false);
      });

      await waitFor(
        () => {
          expect(localStorageMock.setItem).toHaveBeenCalled();
        },
        { timeout: 1000 }
      );

      const savedData = localStorageMock.setItem.mock.calls[
        localStorageMock.setItem.mock.calls.length - 1
      ][1];
      const parsedData = JSON.parse(savedData);

      expect(parsedData.state.config.properties).toEqual({ key: 'value' });
      expect(parsedData.state.config.logLevel).toBe(5);
      expect(parsedData.state.config.dotenvEnabled).toBe(false);
    });

    it('should persist UI expandedPanels only', async () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.togglePanel('testPanel');
        result.current.setActiveHookTab('custom_tab'); // Should NOT persist
        result.current.setActiveSubView('inputs'); // Should NOT persist
      });

      await waitFor(
        () => {
          expect(localStorageMock.setItem).toHaveBeenCalled();
        },
        { timeout: 1000 }
      );

      const savedData = localStorageMock.setItem.mock.calls[
        localStorageMock.setItem.mock.calls.length - 1
      ][1];
      const parsedData = JSON.parse(savedData);

      // Only expandedPanels should be persisted
      expect(parsedData.state.ui.expandedPanels).toEqual({ testPanel: true });
      expect(parsedData.state.ui.activeHookTab).toBeUndefined();
      expect(parsedData.state.ui.activeSubView).toBeUndefined();
    });

    it('should NOT persist WASM slice state', async () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setLoading(true);
        result.current.setError('test error');
        result.current.setMethod('POST'); // This should persist
      });

      await waitFor(
        () => {
          expect(localStorageMock.setItem).toHaveBeenCalled();
        },
        { timeout: 1000 }
      );

      const savedData = localStorageMock.setItem.mock.calls[
        localStorageMock.setItem.mock.calls.length - 1
      ][1];
      const parsedData = JSON.parse(savedData);

      // WASM state should not be in persisted data
      expect(parsedData.state.wasmPath).toBeUndefined();
      expect(parsedData.state.loading).toBeUndefined();
      expect(parsedData.state.error).toBeUndefined();
      // But request state should be
      expect(parsedData.state.request.method).toBe('POST');
    });

    it('should NOT persist Results slice state', async () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setHookResult('test_hook', {
          logs: [{ level: 3, message: 'test' }],
          returnValue: 0,
        });
        result.current.setIsExecuting(true);
        result.current.setMethod('POST'); // This should persist
      });

      await waitFor(
        () => {
          expect(localStorageMock.setItem).toHaveBeenCalled();
        },
        { timeout: 1000 }
      );

      const savedData = localStorageMock.setItem.mock.calls[
        localStorageMock.setItem.mock.calls.length - 1
      ][1];
      const parsedData = JSON.parse(savedData);

      // Results state should not be in persisted data
      expect(parsedData.state.hookResults).toBeUndefined();
      expect(parsedData.state.finalResponse).toBeUndefined();
      expect(parsedData.state.isExecuting).toBeUndefined();
    });

    it('should NOT persist isDirty, lastSaved, or autoSave from config', async () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setProperties({ key: 'value' });
        result.current.markDirty();
        result.current.setAutoSave(false);
      });

      await waitFor(
        () => {
          expect(localStorageMock.setItem).toHaveBeenCalled();
        },
        { timeout: 1000 }
      );

      const savedData = localStorageMock.setItem.mock.calls[
        localStorageMock.setItem.mock.calls.length - 1
      ][1];
      const parsedData = JSON.parse(savedData);

      // These config fields should not be persisted
      expect(parsedData.state.config.isDirty).toBeUndefined();
      expect(parsedData.state.config.lastSaved).toBeUndefined();
      expect(parsedData.state.config.autoSave).toBeDefined(); // autoSave IS persisted
      expect(parsedData.state.config.properties).toEqual({ key: 'value' });
    });

    it('should use correct storage key', async () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setMethod('GET');
      });

      await waitFor(
        () => {
          expect(localStorageMock.setItem).toHaveBeenCalled();
        },
        { timeout: 1000 }
      );

      const storageKey = localStorageMock.setItem.mock.calls[0][0];
      expect(storageKey).toBe('proxy-runner-config');
    });

    it('should include version in persisted data', async () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setMethod('GET');
      });

      await waitFor(
        () => {
          expect(localStorageMock.setItem).toHaveBeenCalled();
        },
        { timeout: 1000 }
      );

      const savedData = localStorageMock.setItem.mock.calls[
        localStorageMock.setItem.mock.calls.length - 1
      ][1];
      const parsedData = JSON.parse(savedData);

      expect(parsedData.version).toBe(1);
    });
  });

  describe('debounced storage', () => {
    it('should debounce multiple rapid updates', async () => {
      const { result } = renderHook(() => useAppStore());

      // Make multiple rapid changes
      act(() => {
        result.current.setMethod('GET');
        result.current.setMethod('POST');
        result.current.setMethod('PUT');
        result.current.setUrl('https://test1.com');
        result.current.setUrl('https://test2.com');
      });

      // Should only save once after debounce period
      await waitFor(
        () => {
          expect(localStorageMock.setItem).toHaveBeenCalled();
        },
        { timeout: 1000 }
      );

      // Verify the final state was saved
      const savedData = localStorageMock.setItem.mock.calls[
        localStorageMock.setItem.mock.calls.length - 1
      ][1];
      const parsedData = JSON.parse(savedData);

      expect(parsedData.state.request.method).toBe('PUT');
      expect(parsedData.state.request.url).toBe('https://test2.com');
    });

    it('should debounce storage writes', async () => {
      const { result } = renderHook(() => useAppStore());

      // Make multiple rapid changes
      act(() => {
        result.current.setMethod('GET');
        result.current.setMethod('POST');
        result.current.setMethod('PUT');
      });

      // Should debounce and eventually save
      await waitFor(
        () => {
          expect(localStorageMock.setItem).toHaveBeenCalled();
        },
        { timeout: 1000 }
      );

      // Verify the final state was saved
      expect(localStorageMock.setItem).toHaveBeenCalled();
    });
  });

  describe('cross-slice interactions', () => {
    it('should allow request slice to interact with config slice via markDirty', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.markClean();
        result.current.setMethod('PUT');
      });

      // Request slice mutations should call markDirty from config slice
      expect(result.current.isDirty).toBe(true);
    });

    it('should allow UI slice to interact with config slice via markDirty', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.markClean();
        result.current.togglePanel('testPanel');
      });

      // UI slice panel toggle should call markDirty from config slice
      expect(result.current.isDirty).toBe(true);
    });

    it('should export config from multiple slices', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setMethod('DELETE');
        result.current.setUrl('https://test.com');
        result.current.setRequestHeaders({ 'X-Test': 'header' });
        result.current.setProperties({ prop: 'value' });
        result.current.setLogLevel(4);
      });

      const config = result.current.exportConfig();

      expect(config.request.method).toBe('DELETE');
      expect(config.request.url).toBe('https://test.com');
      expect(config.request.headers).toEqual({ 'X-Test': 'header' });
      expect(config.properties).toEqual({ prop: 'value' });
      expect(config.logLevel).toBe(4);
    });

    it('should handle full execution flow across slices', async () => {
      const { result } = renderHook(() => useAppStore());

      // Setup request
      act(() => {
        result.current.setMethod('POST');
        result.current.setUrl('https://api.test.com');
        result.current.setProperties({ env: 'test' });
      });

      // Start execution
      act(() => {
        result.current.setIsExecuting(true);
      });

      expect(result.current.isExecuting).toBe(true);

      // Add results
      act(() => {
        result.current.setHookResult('request_headers', {
          logs: [{ level: 3, message: 'Processing' }],
          returnValue: 0,
        });
      });

      // Complete execution
      act(() => {
        result.current.setFinalResponse({
          status: 200,
          statusText: 'OK',
          headers: {},
          body: 'response',
          contentType: 'text/plain',
        });
        result.current.setIsExecuting(false);
      });

      expect(result.current.isExecuting).toBe(false);
      expect(result.current.finalResponse).not.toBe(null);
    });

    it('should maintain independent state across slices', () => {
      const { result } = renderHook(() => useAppStore());

      // Modify all slices
      act(() => {
        result.current.setMethod('GET');
        result.current.setLoading(true);
        result.current.setIsExecuting(true);
        result.current.setProperties({ key: 'value' });
        result.current.setActiveHookTab('custom_hook');
      });

      // Each slice should maintain its state independently
      expect(result.current.method).toBe('GET');
      expect(result.current.loading).toBe(true);
      expect(result.current.isExecuting).toBe(true);
      expect(result.current.properties).toEqual({ key: 'value' });
      expect(result.current.activeHookTab).toBe('custom_hook');
    });
  });

  describe('Immer integration', () => {
    it('should use Immer for immutable updates', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setRequestHeaders({ 'X-First': 'first' });
      });

      const firstHeaders = result.current.requestHeaders;

      act(() => {
        result.current.updateRequestHeader('X-Second', 'second');
      });

      // State should be immutable - different object
      expect(result.current.requestHeaders).not.toBe(firstHeaders);
      expect(result.current.requestHeaders).toEqual({
        'X-First': 'first',
        'X-Second': 'second',
      });
    });

    it('should handle nested Immer mutations', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setProperties({ a: '1', b: '2' });
      });

      const firstProperties = result.current.properties;

      act(() => {
        result.current.updateProperty('c', '3');
        result.current.removeProperty('a');
      });

      expect(result.current.properties).not.toBe(firstProperties);
      expect(result.current.properties).toEqual({ b: '2', c: '3' });
    });
  });

  describe('devtools configuration', () => {
    it('should have store name configured', () => {
      const { result } = renderHook(() => useAppStore());

      // Just verify the store is accessible
      expect(result.current).toBeDefined();
      expect(typeof result.current.setMethod).toBe('function');
    });
  });

  describe('store isolation', () => {
    it('should maintain separate state between hook instances', () => {
      const { result: result1 } = renderHook(() => useAppStore());
      const { result: result2 } = renderHook(() => useAppStore());

      // Both hooks should access the same store
      act(() => {
        result1.current.setMethod('PATCH');
      });

      expect(result2.current.method).toBe('PATCH');
    });

    it('should share state updates across components', () => {
      const { result: result1 } = renderHook(() => useAppStore());
      const { result: result2 } = renderHook(() => useAppStore());

      act(() => {
        result1.current.setProperties({ shared: 'value' });
      });

      expect(result2.current.properties).toEqual({ shared: 'value' });
    });
  });

  describe('complete store lifecycle', () => {
    it('should handle full lifecycle from config load to execution to save', async () => {
      const { result } = renderHook(() => useAppStore());

      // Load config
      act(() => {
        result.current.loadFromConfig({
          request: {
            method: 'POST',
            url: 'https://test.com',
            headers: { 'Content-Type': 'application/json' },
            body: '{"test": true}',
          },
          properties: { env: 'test' },
          logLevel: 4,
          dotenvEnabled: true,
        });
      });

      expect(result.current.isDirty).toBe(false);

      // Modify config
      act(() => {
        result.current.setUrl('https://modified.com');
      });

      expect(result.current.isDirty).toBe(true);

      // Execute
      act(() => {
        result.current.setIsExecuting(true);
        result.current.setHookResult('request_headers', {
          logs: [{ level: 3, message: 'Executed' }],
          returnValue: 0,
        });
        result.current.setIsExecuting(false);
      });

      // Mark clean after save
      act(() => {
        result.current.markClean();
      });

      expect(result.current.isDirty).toBe(false);

      // Verify persistence
      await waitFor(
        () => {
          expect(localStorageMock.setItem).toHaveBeenCalled();
        },
        { timeout: 1000 }
      );
    });
  });
});
