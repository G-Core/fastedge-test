import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppStore } from '../index';
import type { HookResult, FinalResponse } from '../../types';

describe('ResultsSlice', () => {
  beforeEach(() => {
    // Reset store state before each test
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.clearResults();
    });
  });

  describe('initial state', () => {
    it('should have correct default values', () => {
      const { result } = renderHook(() => useAppStore());

      expect(result.current.hookResults).toEqual({});
      expect(result.current.finalResponse).toBe(null);
      expect(result.current.isExecuting).toBe(false);
    });
  });

  describe('setHookResult', () => {
    it('should set a single hook result', () => {
      const { result } = renderHook(() => useAppStore());
      const hookResult: HookResult = {
        logs: [{ level: 3, message: 'Test log' }],
        returnValue: 0,
      };

      act(() => {
        result.current.setHookResult('request_headers', hookResult);
      });

      expect(result.current.hookResults['request_headers']).toEqual(hookResult);
    });

    it('should update existing hook result', () => {
      const { result } = renderHook(() => useAppStore());
      const firstResult: HookResult = {
        logs: [{ level: 3, message: 'First' }],
        returnValue: 0,
      };
      const secondResult: HookResult = {
        logs: [{ level: 3, message: 'Second' }],
        returnValue: 1,
      };

      act(() => {
        result.current.setHookResult('request_headers', firstResult);
        result.current.setHookResult('request_headers', secondResult);
      });

      expect(result.current.hookResults['request_headers']).toEqual(secondResult);
    });

    it('should preserve other hook results when updating one', () => {
      const { result } = renderHook(() => useAppStore());
      const result1: HookResult = {
        logs: [{ level: 3, message: 'First hook' }],
        returnValue: 0,
      };
      const result2: HookResult = {
        logs: [{ level: 3, message: 'Second hook' }],
        returnValue: 0,
      };

      act(() => {
        result.current.setHookResult('request_headers', result1);
        result.current.setHookResult('response_headers', result2);
      });

      expect(result.current.hookResults['request_headers']).toEqual(result1);
      expect(result.current.hookResults['response_headers']).toEqual(result2);
    });

    it('should handle hook results with error', () => {
      const { result } = renderHook(() => useAppStore());
      const hookResult: HookResult = {
        logs: [{ level: 1, message: 'Error occurred' }],
        error: 'Hook execution failed',
      };

      act(() => {
        result.current.setHookResult('request_body', hookResult);
      });

      expect(result.current.hookResults['request_body'].error).toBe('Hook execution failed');
    });

    it('should handle hook results with input/output data', () => {
      const { result } = renderHook(() => useAppStore());
      const hookResult: HookResult = {
        logs: [{ level: 3, message: 'Processing' }],
        returnValue: 0,
        input: {
          request: {
            headers: { 'Content-Type': 'application/json' },
            body: '{"test": "input"}',
          },
          response: {
            headers: {},
            body: '',
          },
        },
        output: {
          request: {
            headers: { 'Content-Type': 'application/json', 'X-Added': 'true' },
            body: '{"test": "modified"}',
          },
          response: {
            headers: {},
            body: '',
          },
        },
      };

      act(() => {
        result.current.setHookResult('request_headers', hookResult);
      });

      expect(result.current.hookResults['request_headers'].input).toEqual(hookResult.input);
      expect(result.current.hookResults['request_headers'].output).toEqual(hookResult.output);
    });

    it('should handle hook results with properties', () => {
      const { result } = renderHook(() => useAppStore());
      const hookResult: HookResult = {
        logs: [{ level: 3, message: 'Properties set' }],
        returnValue: 0,
        properties: {
          calculated: 'value',
          timestamp: 1234567890,
        },
      };

      act(() => {
        result.current.setHookResult('request_headers', hookResult);
      });

      expect(result.current.hookResults['request_headers'].properties).toEqual({
        calculated: 'value',
        timestamp: 1234567890,
      });
    });
  });

  describe('setHookResults', () => {
    it('should replace all hook results', () => {
      const { result } = renderHook(() => useAppStore());
      const results: Record<string, HookResult> = {
        request_headers: {
          logs: [{ level: 3, message: 'Request headers' }],
          returnValue: 0,
        },
        request_body: {
          logs: [{ level: 3, message: 'Request body' }],
          returnValue: 0,
        },
      };

      act(() => {
        result.current.setHookResults(results);
      });

      expect(result.current.hookResults).toEqual(results);
    });

    it('should clear previous hook results when setting new ones', () => {
      const { result } = renderHook(() => useAppStore());
      const firstResults: Record<string, HookResult> = {
        request_headers: {
          logs: [{ level: 3, message: 'First' }],
          returnValue: 0,
        },
      };
      const secondResults: Record<string, HookResult> = {
        response_headers: {
          logs: [{ level: 3, message: 'Second' }],
          returnValue: 0,
        },
      };

      act(() => {
        result.current.setHookResults(firstResults);
        result.current.setHookResults(secondResults);
      });

      expect(result.current.hookResults).toEqual(secondResults);
      expect(result.current.hookResults['request_headers']).toBeUndefined();
    });

    it('should handle empty results object', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setHookResult('request_headers', {
          logs: [{ level: 3, message: 'Test' }],
          returnValue: 0,
        });
        result.current.setHookResults({});
      });

      expect(result.current.hookResults).toEqual({});
    });

    it('should handle multiple hooks at once', () => {
      const { result } = renderHook(() => useAppStore());
      const results: Record<string, HookResult> = {
        request_headers: {
          logs: [{ level: 3, message: 'Request headers' }],
          returnValue: 0,
        },
        request_body: {
          logs: [{ level: 3, message: 'Request body' }],
          returnValue: 0,
        },
        response_headers: {
          logs: [{ level: 3, message: 'Response headers' }],
          returnValue: 0,
        },
        response_body: {
          logs: [{ level: 3, message: 'Response body' }],
          returnValue: 0,
        },
      };

      act(() => {
        result.current.setHookResults(results);
      });

      expect(Object.keys(result.current.hookResults)).toHaveLength(4);
      expect(result.current.hookResults).toEqual(results);
    });
  });

  describe('setFinalResponse', () => {
    it('should set final response', () => {
      const { result } = renderHook(() => useAppStore());
      const finalResponse: FinalResponse = {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'application/json' },
        body: '{"result": "success"}',
        contentType: 'application/json',
      };

      act(() => {
        result.current.setFinalResponse(finalResponse);
      });

      expect(result.current.finalResponse).toEqual(finalResponse);
    });

    it('should update existing final response', () => {
      const { result } = renderHook(() => useAppStore());
      const firstResponse: FinalResponse = {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: 'first',
        contentType: 'text/plain',
      };
      const secondResponse: FinalResponse = {
        status: 404,
        statusText: 'Not Found',
        headers: {},
        body: 'second',
        contentType: 'text/plain',
      };

      act(() => {
        result.current.setFinalResponse(firstResponse);
        result.current.setFinalResponse(secondResponse);
      });

      expect(result.current.finalResponse).toEqual(secondResponse);
    });

    it('should clear final response by setting null', () => {
      const { result } = renderHook(() => useAppStore());
      const finalResponse: FinalResponse = {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: 'test',
        contentType: 'text/plain',
      };

      act(() => {
        result.current.setFinalResponse(finalResponse);
        result.current.setFinalResponse(null);
      });

      expect(result.current.finalResponse).toBe(null);
    });

    it('should handle base64 responses', () => {
      const { result } = renderHook(() => useAppStore());
      const finalResponse: FinalResponse = {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'image/png' },
        body: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        contentType: 'image/png',
        isBase64: true,
      };

      act(() => {
        result.current.setFinalResponse(finalResponse);
      });

      expect(result.current.finalResponse?.isBase64).toBe(true);
    });

    it('should handle various status codes', () => {
      const { result } = renderHook(() => useAppStore());
      const statuses = [200, 201, 204, 400, 401, 403, 404, 500, 503];

      statuses.forEach(status => {
        const response: FinalResponse = {
          status,
          statusText: 'Status Text',
          headers: {},
          body: '',
          contentType: 'text/plain',
        };

        act(() => {
          result.current.setFinalResponse(response);
        });

        expect(result.current.finalResponse?.status).toBe(status);
      });
    });
  });

  describe('setIsExecuting', () => {
    it('should set isExecuting to true', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setIsExecuting(true);
      });

      expect(result.current.isExecuting).toBe(true);
    });

    it('should set isExecuting to false', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setIsExecuting(true);
        result.current.setIsExecuting(false);
      });

      expect(result.current.isExecuting).toBe(false);
    });

    it('should toggle isExecuting multiple times', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setIsExecuting(true);
      });
      expect(result.current.isExecuting).toBe(true);

      act(() => {
        result.current.setIsExecuting(false);
      });
      expect(result.current.isExecuting).toBe(false);

      act(() => {
        result.current.setIsExecuting(true);
      });
      expect(result.current.isExecuting).toBe(true);
    });
  });

  describe('clearResults', () => {
    it('should clear all results state', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setHookResults({
          request_headers: {
            logs: [{ level: 3, message: 'Test' }],
            returnValue: 0,
          },
        });
        result.current.setFinalResponse({
          status: 200,
          statusText: 'OK',
          headers: {},
          body: 'test',
          contentType: 'text/plain',
        });
        result.current.setIsExecuting(true);
        result.current.clearResults();
      });

      expect(result.current.hookResults).toEqual({});
      expect(result.current.finalResponse).toBe(null);
      expect(result.current.isExecuting).toBe(false);
    });

    it('should reset to default state', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setHookResult('request_headers', {
          logs: [{ level: 3, message: 'Test' }],
          returnValue: 0,
        });
        result.current.clearResults();
      });

      expect(result.current.hookResults).toEqual({});
      expect(result.current.finalResponse).toBe(null);
      expect(result.current.isExecuting).toBe(false);
    });

    it('should be idempotent when called multiple times', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setHookResult('request_headers', {
          logs: [{ level: 3, message: 'Test' }],
          returnValue: 0,
        });
        result.current.clearResults();
        result.current.clearResults();
        result.current.clearResults();
      });

      expect(result.current.hookResults).toEqual({});
      expect(result.current.finalResponse).toBe(null);
      expect(result.current.isExecuting).toBe(false);
    });
  });

  describe('Immer mutations', () => {
    it('should properly mutate hook results with Immer', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setHookResult('request_headers', {
          logs: [{ level: 3, message: 'First' }],
          returnValue: 0,
        });
      });

      const firstResults = result.current.hookResults;

      act(() => {
        result.current.setHookResult('request_body', {
          logs: [{ level: 3, message: 'Second' }],
          returnValue: 0,
        });
      });

      // Verify immutability - state should be different object
      expect(result.current.hookResults).not.toBe(firstResults);
      expect(Object.keys(result.current.hookResults)).toHaveLength(2);
    });
  });

  describe('complex scenarios', () => {
    it('should handle full execution flow', () => {
      const { result } = renderHook(() => useAppStore());

      // Start execution
      act(() => {
        result.current.setIsExecuting(true);
      });
      expect(result.current.isExecuting).toBe(true);

      // Add hook results
      act(() => {
        result.current.setHookResult('request_headers', {
          logs: [{ level: 3, message: 'Processing request headers' }],
          returnValue: 0,
        });
        result.current.setHookResult('request_body', {
          logs: [{ level: 3, message: 'Processing request body' }],
          returnValue: 0,
        });
      });

      expect(Object.keys(result.current.hookResults)).toHaveLength(2);

      // Set final response
      act(() => {
        result.current.setFinalResponse({
          status: 200,
          statusText: 'OK',
          headers: { 'Content-Type': 'application/json' },
          body: '{"success": true}',
          contentType: 'application/json',
        });
      });

      expect(result.current.finalResponse).not.toBe(null);

      // End execution
      act(() => {
        result.current.setIsExecuting(false);
      });

      expect(result.current.isExecuting).toBe(false);
    });

    it('should handle execution with errors', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setIsExecuting(true);
        result.current.setHookResult('request_headers', {
          logs: [{ level: 1, message: 'Error in hook' }],
          error: 'Hook failed',
        });
        result.current.setIsExecuting(false);
      });

      expect(result.current.hookResults['request_headers'].error).toBe('Hook failed');
      expect(result.current.isExecuting).toBe(false);
    });
  });
});
