import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppStore } from '../index';
import type { TestConfig } from '../types';

describe('ConfigSlice', () => {
  beforeEach(() => {
    // Clear localStorage to start fresh
    window.localStorage.clear();

    // Reset store state before each test
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.resetRequest(); // Reset all slices for clean state
      result.current.resetConfig();
      result.current.clearResults();
      result.current.markClean(); // Clean after reset since reset marks dirty
    });
  });

  describe('initial state', () => {
    it('should have correct default values', () => {
      // Get a fresh store without beforeEach interference
      window.localStorage.clear();
      const { result } = renderHook(() => useAppStore());

      // Reset to defaults
      act(() => {
        result.current.resetConfig();
      });

      expect(result.current.properties).toEqual({});
      expect(result.current.dotenvEnabled).toBe(true);
      expect(result.current.logLevel).toBe(2);
      expect(result.current.autoSave).toBe(true);
      expect(result.current.lastSaved).toBe(null); // null after reset
      expect(result.current.isDirty).toBe(true); // Reset marks dirty
    });
  });

  describe('setProperties', () => {
    it('should replace properties', () => {
      const { result } = renderHook(() => useAppStore());
      const properties = { key1: 'value1', key2: 'value2' };

      act(() => {
        result.current.setProperties(properties);
      });

      expect(result.current.properties).toEqual(properties);
    });

    it('should mark dirty when properties are set', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.markClean();
        result.current.setProperties({ test: 'value' });
      });

      expect(result.current.isDirty).toBe(true);
    });

    it('should clear previous properties when setting new ones', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setProperties({ old: 'value' });
        result.current.setProperties({ new: 'value' });
      });

      expect(result.current.properties).toEqual({ new: 'value' });
      expect(result.current.properties['old']).toBeUndefined();
    });

    it('should handle empty properties object', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setProperties({ key: 'value' });
        result.current.setProperties({});
      });

      expect(result.current.properties).toEqual({});
    });
  });

  describe('updateProperty', () => {
    it('should add a new property', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.updateProperty('newKey', 'newValue');
      });

      expect(result.current.properties['newKey']).toBe('newValue');
    });

    it('should update existing property', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.updateProperty('key', 'value1');
        result.current.updateProperty('key', 'value2');
      });

      expect(result.current.properties['key']).toBe('value2');
    });

    it('should mark dirty when property is updated', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.markClean();
        result.current.updateProperty('key', 'value');
      });

      expect(result.current.isDirty).toBe(true);
    });

    it('should preserve other properties when updating', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setProperties({ key1: 'value1', key2: 'value2' });
        result.current.updateProperty('key3', 'value3');
      });

      expect(result.current.properties).toEqual({
        key1: 'value1',
        key2: 'value2',
        key3: 'value3',
      });
    });
  });

  describe('removeProperty', () => {
    it('should remove a property', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setProperties({ remove: 'value', keep: 'value' });
        result.current.removeProperty('remove');
      });

      expect(result.current.properties['remove']).toBeUndefined();
      expect(result.current.properties['keep']).toBe('value');
    });

    it('should mark dirty when property is removed', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setProperties({ key: 'value' });
        result.current.markClean();
        result.current.removeProperty('key');
      });

      expect(result.current.isDirty).toBe(true);
    });

    it('should handle removing non-existent property', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setProperties({ exists: 'value' });
        result.current.removeProperty('nonexistent');
      });

      expect(result.current.properties).toEqual({ exists: 'value' });
    });
  });

  describe('mergeProperties', () => {
    it('should merge new properties with existing ones', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setProperties({ key1: 'value1', key2: 'value2' });
        result.current.mergeProperties({ key3: 'value3', key4: 'value4' });
      });

      expect(result.current.properties).toEqual({
        key1: 'value1',
        key2: 'value2',
        key3: 'value3',
        key4: 'value4',
      });
    });

    it('should override existing properties when merging', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setProperties({ key1: 'old', key2: 'value2' });
        result.current.mergeProperties({ key1: 'new', key3: 'value3' });
      });

      expect(result.current.properties).toEqual({
        key1: 'new',
        key2: 'value2',
        key3: 'value3',
      });
    });

    it('should mark dirty when properties are merged', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.markClean();
        result.current.mergeProperties({ key: 'value' });
      });

      expect(result.current.isDirty).toBe(true);
    });

    it('should handle merging empty object', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setProperties({ key: 'value' });
        result.current.mergeProperties({});
      });

      expect(result.current.properties).toEqual({ key: 'value' });
    });
  });

  describe('setDotenvEnabled', () => {
    it('should enable dotenv', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setDotenvEnabled(false);
        result.current.setDotenvEnabled(true);
      });

      expect(result.current.dotenvEnabled).toBe(true);
    });

    it('should disable dotenv', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setDotenvEnabled(false);
      });

      expect(result.current.dotenvEnabled).toBe(false);
    });

    it('should mark dirty when dotenv is changed', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.markClean();
        result.current.setDotenvEnabled(false);
      });

      expect(result.current.isDirty).toBe(true);
    });
  });

  describe('setLogLevel', () => {
    it('should update log level', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setLogLevel(5);
      });

      expect(result.current.logLevel).toBe(5);
    });

    it('should mark dirty when log level is changed', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.markClean();
        result.current.setLogLevel(1);
      });

      expect(result.current.isDirty).toBe(true);
    });

    it('should handle various log levels', () => {
      const { result } = renderHook(() => useAppStore());
      const levels = [0, 1, 2, 3, 4, 5];

      levels.forEach(level => {
        act(() => {
          result.current.setLogLevel(level);
        });
        expect(result.current.logLevel).toBe(level);
      });
    });
  });

  describe('setAutoSave', () => {
    it('should enable auto-save', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setAutoSave(false);
        result.current.setAutoSave(true);
      });

      expect(result.current.autoSave).toBe(true);
    });

    it('should disable auto-save', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setAutoSave(false);
      });

      expect(result.current.autoSave).toBe(false);
    });

    it('should NOT mark dirty when auto-save is changed', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.markClean();
        result.current.setAutoSave(false);
      });

      // Auto-save is a UI preference, not persisted config data
      expect(result.current.isDirty).toBe(false);
    });
  });

  describe('markDirty and markClean', () => {
    it('should mark state as dirty', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.markClean();
        result.current.markDirty();
      });

      expect(result.current.isDirty).toBe(true);
    });

    it('should mark state as clean and set lastSaved timestamp', () => {
      const { result } = renderHook(() => useAppStore());
      const beforeTime = Date.now();

      act(() => {
        result.current.markDirty();
        result.current.markClean();
      });

      expect(result.current.isDirty).toBe(false);
      expect(result.current.lastSaved).not.toBe(null);
      expect(result.current.lastSaved).toBeGreaterThanOrEqual(beforeTime);
    });

    it('should update lastSaved each time markClean is called', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.markClean();
      });

      const firstSave = result.current.lastSaved;

      // Wait a bit to ensure timestamp changes
      vi.useFakeTimers();
      vi.advanceTimersByTime(100);

      act(() => {
        result.current.markClean();
      });

      const secondSave = result.current.lastSaved;

      expect(secondSave).toBeGreaterThan(firstSave!);
      vi.useRealTimers();
    });
  });

  describe('loadFromConfig', () => {
    it('should load config from TestConfig object', () => {
      const { result } = renderHook(() => useAppStore());
      const config: TestConfig = {
        request: {
          method: 'GET',
          url: 'https://example.com',
          headers: { 'Content-Type': 'application/json' },
          body: 'test body',
        },
        response: {
          headers: { 'Cache-Control': 'no-cache' },
          body: 'test response',
        },
        properties: { key1: 'value1', key2: 'value2' },
        logLevel: 5,
        dotenvEnabled: false,
      };

      act(() => {
        result.current.loadFromConfig(config);
      });

      expect(result.current.properties).toEqual(config.properties);
      expect(result.current.logLevel).toBe(5);
      expect(result.current.dotenvEnabled).toBe(false);
      expect(result.current.isDirty).toBe(false);
      expect(result.current.lastSaved).not.toBe(null);
    });

    it('should default dotenvEnabled to true if not provided', () => {
      const { result } = renderHook(() => useAppStore());
      const config: TestConfig = {
        request: {
          method: 'GET',
          url: 'https://example.com',
          headers: {},
          body: '',
        },
        properties: {},
        logLevel: 3,
      };

      act(() => {
        result.current.loadFromConfig(config);
      });

      expect(result.current.dotenvEnabled).toBe(true);
    });

    it('should mark clean after loading config', () => {
      const { result } = renderHook(() => useAppStore());
      const config: TestConfig = {
        request: {
          method: 'GET',
          url: 'https://example.com',
          headers: {},
          body: '',
        },
        properties: { key: 'value' },
        logLevel: 3,
      };

      act(() => {
        result.current.markDirty();
        result.current.loadFromConfig(config);
      });

      expect(result.current.isDirty).toBe(false);
    });

    it('should create a copy of properties, not reference', () => {
      const { result } = renderHook(() => useAppStore());
      const properties = { key: 'value' };
      const config: TestConfig = {
        request: {
          method: 'GET',
          url: 'https://example.com',
          headers: {},
          body: '',
        },
        properties,
        logLevel: 3,
      };

      act(() => {
        result.current.loadFromConfig(config);
      });

      // Modifying original should not affect store
      properties.key = 'modified';
      expect(result.current.properties.key).toBe('value');
    });
  });

  describe('exportConfig', () => {
    it('should export complete TestConfig object', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setMethod('PUT');
        result.current.setUrl('https://test.com');
        result.current.setRequestHeaders({ 'X-Custom': 'header' });
        result.current.setRequestBody('request body');
        result.current.setResponseHeaders({ 'X-Response': 'header' });
        result.current.setResponseBody('response body');
        result.current.setProperties({ prop1: 'value1' });
        result.current.setLogLevel(5);
        result.current.setDotenvEnabled(false);
      });

      const config = result.current.exportConfig();

      expect(config).toEqual({
        request: {
          method: 'PUT',
          url: 'https://test.com',
          headers: { 'X-Custom': 'header' },
          body: 'request body',
        },
        response: {
          headers: { 'X-Response': 'header' },
          body: 'response body',
        },
        properties: { prop1: 'value1' },
        logLevel: 5,
        dotenvEnabled: false,
      });
    });

    it('should export copies of objects, not references', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setProperties({ key: 'value' });
      });

      const config = result.current.exportConfig();

      // Modifying exported config should not affect store
      config.properties.key = 'modified';
      expect(result.current.properties.key).toBe('value');
    });

    it('should export default values when state is default', () => {
      const { result } = renderHook(() => useAppStore());

      const config = result.current.exportConfig();

      expect(config.request.method).toBe('POST');
      expect(config.properties).toEqual({});
      expect(config.logLevel).toBe(2);
      expect(config.dotenvEnabled).toBe(true);
    });
  });

  describe('resetConfig', () => {
    it('should reset all config state to defaults', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setProperties({ key: 'value' });
        result.current.setDotenvEnabled(false);
        result.current.setLogLevel(5);
        result.current.setAutoSave(false);
        result.current.markClean();
        result.current.resetConfig();
      });

      expect(result.current.properties).toEqual({});
      expect(result.current.dotenvEnabled).toBe(true);
      expect(result.current.logLevel).toBe(2);
      expect(result.current.autoSave).toBe(true);
      expect(result.current.lastSaved).toBe(null);
      // isDirty should be true after reset since reset modifies state
      expect(result.current.isDirty).toBe(true);
    });

    it('should mark dirty when reset', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.markClean();
        result.current.resetConfig();
      });

      expect(result.current.isDirty).toBe(true);
    });
  });

  describe('Immer mutations', () => {
    it('should properly mutate properties with Immer', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.updateProperty('key1', 'value1');
      });

      const firstProperties = result.current.properties;

      act(() => {
        result.current.updateProperty('key2', 'value2');
      });

      // Verify immutability - state should be different object
      expect(result.current.properties).not.toBe(firstProperties);
      expect(result.current.properties).toEqual({
        key1: 'value1',
        key2: 'value2',
      });
    });

    it('should handle multiple mutations in sequence', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setProperties({ initial: 'value' });
        result.current.updateProperty('added', 'new');
        result.current.removeProperty('initial');
        result.current.mergeProperties({ merged: 'value' });
      });

      expect(result.current.properties).toEqual({
        added: 'new',
        merged: 'value',
      });
    });
  });

  describe('integration with request state', () => {
    it('should export request state in config', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setMethod('DELETE');
        result.current.setUrl('https://api.example.com');
      });

      const config = result.current.exportConfig();

      expect(config.request.method).toBe('DELETE');
      expect(config.request.url).toBe('https://api.example.com');
    });

    it('should not affect request state when loading config', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setMethod('PATCH');
      });

      const config: TestConfig = {
        request: {
          method: 'GET',
          url: 'https://example.com',
          headers: {},
          body: '',
        },
        properties: {},
        logLevel: 3,
      };

      act(() => {
        result.current.loadFromConfig(config);
      });

      // Request method should remain unchanged
      // (loadFromConfig only updates config slice properties)
      expect(result.current.method).toBe('PATCH');
    });
  });
});
