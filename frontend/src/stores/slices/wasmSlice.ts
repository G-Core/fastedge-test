import { StateCreator } from 'zustand';
import { AppStore, WasmSlice, WasmState } from '../types';
import { uploadWasm, uploadWasmFromPath } from '../../api';

// ============================================================================
// DEFAULT STATE
// ============================================================================

const DEFAULT_WASM_STATE: WasmState = {
  wasmPath: null,
  wasmBuffer: null,
  wasmFile: null,
  wasmType: null,
  loading: false,
  error: null,
  loadingMode: null,
  loadTime: null,
  fileSize: null,
};

// ============================================================================
// SLICE CREATOR
// ============================================================================

export const createWasmSlice: StateCreator<
  AppStore,
  [['zustand/immer', never]],
  [],
  WasmSlice
> = (set, get) => ({
  // Initial state
  ...DEFAULT_WASM_STATE,

  // ============================================================================
  // ACTIONS
  // ============================================================================

  /**
   * Load a WASM file from disk or path
   * Accepts either a File object or a string path
   * Uses optimal loading strategy and automatically detects type
   */
  loadWasm: async (fileOrPath: File | string, dotenvEnabled: boolean) => {
    // Set loading state and reset previous results
    set(
      (state) => {
        state.loading = true;
        state.error = null;
        // Clear proxy-wasm results
        state.hookResults = {};
        state.finalResponse = null;
        state.isExecuting = false;
        // Clear http-wasm results
        state.httpResponse = null;
        state.httpLogs = [];
      },
      false,
      'wasm/loadWasm/start'
    );

    try {
      let result;
      let file: File | null = null;

      // Handle string path (direct path loading)
      if (typeof fileOrPath === 'string') {
        result = await uploadWasmFromPath(fileOrPath, dotenvEnabled);
      } else {
        // Handle File object (hybrid loading)
        file = fileOrPath;
        result = await uploadWasm(file, dotenvEnabled);
      }

      const { path, wasmType, loadingMode, loadTime, fileSize } = result;

      // Read buffer only if we used buffer-based loading with a File object
      // (for caching/reload capability)
      let buffer: ArrayBuffer | null = null;
      if (file && loadingMode === 'buffer') {
        buffer = await file.arrayBuffer();
      }

      // Update state with loaded WASM
      set(
        (state) => {
          state.wasmPath = path;
          state.wasmBuffer = buffer;
          state.wasmFile = file; // Store file for reload capability (null if path-based)
          state.wasmType = wasmType; // Store detected type
          state.loadingMode = loadingMode; // Track which mode was used
          state.loadTime = loadTime; // Track load performance
          state.fileSize = fileSize; // Track file size
          state.loading = false;
          state.error = null;
        },
        false,
        'wasm/loadWasm/success'
      );
    } catch (err) {
      // Handle errors
      const errorMessage = err instanceof Error ? err.message : 'Failed to load WASM';
      set(
        (state) => {
          state.error = errorMessage;
          state.loading = false;
        },
        false,
        'wasm/loadWasm/error'
      );
    }
  },

  /**
   * Reload the currently loaded WASM file
   * Useful when .env changes or server needs to reload
   */
  reloadWasm: async (dotenvEnabled: boolean) => {
    const { wasmFile, loadWasm } = get();

    // Check if there's a file to reload
    if (!wasmFile) {
      set(
        (state) => {
          state.error = 'No WASM file loaded to reload';
        },
        false,
        'wasm/reloadWasm/error'
      );
      return;
    }

    // Reuse loadWasm logic (type will be auto-detected)
    await loadWasm(wasmFile, dotenvEnabled);
  },

  /**
   * Clear all WASM state
   * Used when user wants to unload WASM or on error recovery
   */
  clearWasm: () => {
    set(
      (state) => {
        state.wasmPath = null;
        state.wasmBuffer = null;
        state.wasmFile = null;
        state.wasmType = null;
        state.loading = false;
        state.error = null;
        state.loadingMode = null;
        state.loadTime = null;
        state.fileSize = null;
      },
      false,
      'wasm/clearWasm'
    );
  },

  /**
   * Sync loaded state from a server-side load (e.g. VSCode extension).
   * Sets wasmPath/wasmType/fileSize without making an API call.
   */
  setWasmLoaded: (filename: string, wasmType: WasmState['wasmType'], fileSize: number) => {
    set(
      (state) => {
        state.wasmPath = filename;
        state.wasmType = wasmType;
        state.fileSize = fileSize;
        state.loading = false;
        state.error = null;
        state.loadingMode = 'path';
        // Clear proxy-wasm results
        state.hookResults = {};
        state.finalResponse = null;
        state.isExecuting = false;
        // Clear http-wasm results
        state.httpResponse = null;
        state.httpLogs = [];
      },
      false,
      'wasm/setWasmLoaded'
    );
  },

  /**
   * Manually set loading state
   * Useful for external loading indicators
   */
  setLoading: (loading: boolean) => {
    set(
      (state) => {
        state.loading = loading;
      },
      false,
      'wasm/setLoading'
    );
  },

  /**
   * Manually set error state
   * Useful for external error handling
   */
  setError: (error: string | null) => {
    set(
      (state) => {
        state.error = error;
      },
      false,
      'wasm/setError'
    );
  },
});
