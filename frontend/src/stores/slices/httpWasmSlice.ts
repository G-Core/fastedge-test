import { StateCreator } from 'zustand';
import { AppStore, HttpWasmSlice, HttpWasmState } from '../types';
import { executeHttpWasm } from '../../api';

// ============================================================================
// CONSTANTS
// ============================================================================

// HTTP WASM binaries always run on this fixed host
export const HTTP_WASM_HOST = 'http://test.localhost/';

// ============================================================================
// DEFAULT STATE
// ============================================================================

const DEFAULT_HTTP_WASM_STATE: HttpWasmState = {
  // Request state
  httpMethod: 'GET',
  httpUrl: 'http://test.localhost/',  // Full URL with fixed host prefix
  httpRequestHeaders: {},
  httpRequestBody: '',

  // Response state
  httpResponse: null,

  // Logs
  httpLogs: [],

  // Execution state
  httpIsExecuting: false,

  // Runner port
  httpRunnerPort: null,
};

// ============================================================================
// SLICE CREATOR
// ============================================================================

export const createHttpWasmSlice: StateCreator<
  AppStore,
  [['zustand/immer', never]],
  [],
  HttpWasmSlice
> = (set, get) => ({
  // Initial state
  ...DEFAULT_HTTP_WASM_STATE,

  // ============================================================================
  // ACTIONS
  // ============================================================================

  /**
   * Set HTTP method
   */
  setHttpMethod: (method: string) => {
    set(
      (state) => {
        state.httpMethod = method;
      },
      false,
      'httpWasm/setMethod'
    );
  },

  /**
   * Set request URL (must start with http://test.localhost/)
   */
  setHttpUrl: (url: string) => {
    // Ensure URL always starts with the fixed host
    if (!url.startsWith(HTTP_WASM_HOST)) {
      url = HTTP_WASM_HOST;
    }

    set(
      (state) => {
        state.httpUrl = url;
      },
      false,
      'httpWasm/setUrl'
    );
  },

  /**
   * Set request headers
   */
  setHttpRequestHeaders: (headers: Record<string, string>) => {
    set(
      (state) => {
        state.httpRequestHeaders = headers;
      },
      false,
      'httpWasm/setRequestHeaders'
    );
  },

  /**
   * Set request body
   */
  setHttpRequestBody: (body: string) => {
    set(
      (state) => {
        state.httpRequestBody = body;
      },
      false,
      'httpWasm/setRequestBody'
    );
  },

  /**
   * Set response
   */
  setHttpResponse: (response: HttpWasmState['httpResponse']) => {
    set(
      (state) => {
        state.httpResponse = response;
      },
      false,
      'httpWasm/setResponse'
    );
  },

  /**
   * Set logs (replaces all)
   */
  setHttpLogs: (logs: Array<{ level: number; message: string }>) => {
    set(
      (state) => {
        state.httpLogs = logs;
      },
      false,
      'httpWasm/setLogs'
    );
  },

  /**
   * Append logs (used for real-time streaming)
   */
  appendHttpLogs: (logs: Array<{ level: number; message: string }>) => {
    set(
      (state) => {
        state.httpLogs.push(...logs);
      },
      false,
      'httpWasm/appendLogs'
    );
  },

  /**
   * Set the fastedge-run HTTP server port (received via wasm_loaded WebSocket event)
   */
  setHttpRunnerPort: (port: number | null) => {
    set(
      (state) => {
        state.httpRunnerPort = port;
      },
      false,
      'httpWasm/setRunnerPort'
    );
  },

  /**
   * Set execution state
   */
  setHttpIsExecuting: (isExecuting: boolean) => {
    set(
      (state) => {
        state.httpIsExecuting = isExecuting;
      },
      false,
      'httpWasm/setIsExecuting'
    );
  },

  /**
   * Execute HTTP WASM request
   */
  executeHttpRequest: async () => {
    const state = get();

    // Set executing state and clear previous logs
    set(
      (state) => {
        state.httpIsExecuting = true;
        state.httpLogs = [];
      },
      false,
      'httpWasm/executeRequest/start'
    );

    try {
      const result = await executeHttpWasm(
        state.httpUrl,
        state.httpMethod,
        state.httpRequestHeaders,
        state.httpRequestBody
      );

      // Update response and logs
      set(
        (state) => {
          state.httpResponse = {
            status: result.status,
            statusText: result.statusText,
            headers: result.headers,
            body: result.body,
            contentType: result.contentType,
            isBase64: result.isBase64,
          };
          state.httpLogs = result.logs;
          state.httpIsExecuting = false;
        },
        false,
        'httpWasm/executeRequest/success'
      );
    } catch (err) {
      // Handle errors
      const errorMessage = err instanceof Error ? err.message : 'Failed to execute HTTP WASM';

      set(
        (state) => {
          state.httpResponse = {
            status: 0,
            statusText: 'Error',
            headers: {},
            body: errorMessage,
            contentType: 'text/plain',
          };
          state.httpLogs = [
            { level: 4, message: `Error: ${errorMessage}` }
          ];
          state.httpIsExecuting = false;
        },
        false,
        'httpWasm/executeRequest/error'
      );
    }
  },

  /**
   * Clear response and logs
   */
  clearHttpResponse: () => {
    set(
      (state) => {
        state.httpResponse = null;
        state.httpLogs = [];
      },
      false,
      'httpWasm/clearResponse'
    );
  },

  /**
   * Reset all HTTP WASM state
   */
  resetHttpWasm: () => {
    set(
      (state) => {
        Object.assign(state, DEFAULT_HTTP_WASM_STATE);
      },
      false,
      'httpWasm/reset'
    );
  },
});
