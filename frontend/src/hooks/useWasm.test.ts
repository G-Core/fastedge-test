import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useWasm } from './useWasm';
import * as api from '../api';

// Mock the API module
vi.mock('../api', () => ({
  uploadWasm: vi.fn(),
}));

describe('useWasm', () => {
  const mockUploadWasm = vi.mocked(api.uploadWasm);

  // Helper function to create a mock File with arrayBuffer method
  const createMockFile = (
    content: string,
    name: string,
    arrayBuffer: ArrayBuffer
  ): File => {
    return {
      name,
      type: 'application/wasm',
      size: content.length,
      arrayBuffer: vi.fn().mockResolvedValue(arrayBuffer),
    } as unknown as File;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('initial state', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() => useWasm());

      expect(result.current.wasmState).toEqual({
        wasmPath: null,
        wasmBuffer: null,
        wasmFile: null,
      });
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('should provide loadWasm and reloadWasm functions', () => {
      const { result } = renderHook(() => useWasm());

      expect(typeof result.current.loadWasm).toBe('function');
      expect(typeof result.current.reloadWasm).toBe('function');
    });
  });

  describe('loadWasm', () => {
    it('should successfully load a WASM file with dotenv enabled', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      const mockPath = 'test.wasm';
      const mockFile = createMockFile('wasm content', 'test.wasm', mockArrayBuffer);

      mockUploadWasm.mockResolvedValue(mockPath);

      const { result } = renderHook(() => useWasm());

      await act(async () => {
        await result.current.loadWasm(mockFile, true);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockUploadWasm).toHaveBeenCalledWith(mockFile, true);
      expect(mockUploadWasm).toHaveBeenCalledTimes(1);
      expect(result.current.wasmState.wasmPath).toBe(mockPath);
      expect(result.current.wasmState.wasmBuffer).toBe(mockArrayBuffer);
      expect(result.current.wasmState.wasmFile).toBe(mockFile);
      expect(result.current.error).toBe(null);
    });

    it('should successfully load a WASM file with dotenv disabled', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      const mockPath = 'test.wasm';
      const mockFile = createMockFile('wasm content', 'test.wasm', mockArrayBuffer);

      mockUploadWasm.mockResolvedValue(mockPath);

      const { result } = renderHook(() => useWasm());

      await act(async () => {
        await result.current.loadWasm(mockFile, false);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockUploadWasm).toHaveBeenCalledWith(mockFile, false);
      expect(result.current.wasmState.wasmFile).toBe(mockFile);
      expect(result.current.error).toBe(null);
    });

    it('should default dotenvEnabled to true when not specified', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      const mockFile = createMockFile('wasm content', 'test.wasm', mockArrayBuffer);

      mockUploadWasm.mockResolvedValue('test.wasm');

      const { result } = renderHook(() => useWasm());

      await act(async () => {
        await result.current.loadWasm(mockFile);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockUploadWasm).toHaveBeenCalledWith(mockFile, true);
    });

    it('should set loading to true during upload', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      const mockFile = createMockFile('wasm content', 'test.wasm', mockArrayBuffer);

      let resolveUpload: (value: string) => void;
      const uploadPromise = new Promise<string>((resolve) => {
        resolveUpload = resolve;
      });
      mockUploadWasm.mockReturnValue(uploadPromise);

      const { result } = renderHook(() => useWasm());

      act(() => {
        result.current.loadWasm(mockFile);
      });

      // Loading should be true immediately after calling loadWasm
      expect(result.current.loading).toBe(true);

      // Resolve the upload
      await act(async () => {
        resolveUpload!('test.wasm');
        await uploadPromise;
      });

      // Loading should be false after completion
      expect(result.current.loading).toBe(false);
    });

    it('should clear previous errors when loading new file', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      const mockFile = createMockFile('wasm content', 'test.wasm', mockArrayBuffer);

      // First call fails
      mockUploadWasm.mockRejectedValueOnce(new Error('Upload failed'));

      const { result } = renderHook(() => useWasm());

      // First load fails
      await act(async () => {
        await result.current.loadWasm(mockFile);
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Upload failed');
      });

      // Second load succeeds
      mockUploadWasm.mockResolvedValueOnce('test.wasm');

      await act(async () => {
        await result.current.loadWasm(mockFile);
      });

      await waitFor(() => {
        expect(result.current.error).toBe(null);
      });
    });

    it('should handle Error object in catch block', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      const errorMessage = 'Network error occurred';
      const mockFile = createMockFile('wasm content', 'test.wasm', mockArrayBuffer);

      mockUploadWasm.mockRejectedValue(new Error(errorMessage));

      const { result } = renderHook(() => useWasm());

      await act(async () => {
        await result.current.loadWasm(mockFile);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe(errorMessage);
      expect(result.current.wasmState.wasmPath).toBe(null);
      expect(result.current.wasmState.wasmBuffer).toBe(null);
      expect(result.current.wasmState.wasmFile).toBe(null);
    });

    it('should handle non-Error object in catch block', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      const mockFile = createMockFile('wasm content', 'test.wasm', mockArrayBuffer);

      mockUploadWasm.mockRejectedValue('String error');

      const { result } = renderHook(() => useWasm());

      await act(async () => {
        await result.current.loadWasm(mockFile);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('Failed to load WASM');
    });

    it('should handle upload failure from API', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      const errorMessage = 'Failed to load WASM file';
      const mockFile = createMockFile('wasm content', 'test.wasm', mockArrayBuffer);

      mockUploadWasm.mockRejectedValue(new Error(errorMessage));

      const { result } = renderHook(() => useWasm());

      await act(async () => {
        await result.current.loadWasm(mockFile);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe(errorMessage);
      expect(mockUploadWasm).toHaveBeenCalledTimes(1);
    });

    it('should handle arrayBuffer() failure', async () => {
      const errorMessage = 'Failed to read file buffer';
      const mockFile = {
        name: 'test.wasm',
        type: 'application/wasm',
        arrayBuffer: vi.fn().mockRejectedValue(new Error(errorMessage)),
      } as unknown as File;

      const { result } = renderHook(() => useWasm());

      await act(async () => {
        await result.current.loadWasm(mockFile);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe(errorMessage);
      expect(mockUploadWasm).not.toHaveBeenCalled();
    });

    it('should set loading to false even when upload fails', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      const mockFile = createMockFile('wasm content', 'test.wasm', mockArrayBuffer);

      mockUploadWasm.mockRejectedValue(new Error('Upload failed'));

      const { result } = renderHook(() => useWasm());

      await act(async () => {
        await result.current.loadWasm(mockFile);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).not.toBe(null);
    });

    it('should store the file for later reloading', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      const mockFile = createMockFile('wasm content', 'test.wasm', mockArrayBuffer);

      mockUploadWasm.mockResolvedValue('test.wasm');

      const { result } = renderHook(() => useWasm());

      await act(async () => {
        await result.current.loadWasm(mockFile);
      });

      await waitFor(() => {
        expect(result.current.wasmState.wasmFile).toBe(mockFile);
      });
    });
  });

  describe('reloadWasm', () => {
    it('should reload the stored WASM file with dotenv enabled', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      const mockFile = createMockFile('wasm content', 'test.wasm', mockArrayBuffer);

      mockUploadWasm.mockResolvedValue('test.wasm');

      const { result } = renderHook(() => useWasm());

      // First, load a file
      await act(async () => {
        await result.current.loadWasm(mockFile, false);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockUploadWasm).toHaveBeenCalledWith(mockFile, false);

      // Reset mock to verify reloadWasm call
      mockUploadWasm.mockClear();
      mockUploadWasm.mockResolvedValue('test.wasm');

      // Now reload with dotenv enabled
      await act(async () => {
        await result.current.reloadWasm(true);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockUploadWasm).toHaveBeenCalledWith(mockFile, true);
      expect(mockUploadWasm).toHaveBeenCalledTimes(1);
      expect(result.current.error).toBe(null);
    });

    it('should reload the stored WASM file with dotenv disabled', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      const mockFile = createMockFile('wasm content', 'test.wasm', mockArrayBuffer);

      mockUploadWasm.mockResolvedValue('test.wasm');

      const { result } = renderHook(() => useWasm());

      // First, load a file
      await act(async () => {
        await result.current.loadWasm(mockFile, true);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockUploadWasm.mockClear();
      mockUploadWasm.mockResolvedValue('test.wasm');

      // Now reload with dotenv disabled
      await act(async () => {
        await result.current.reloadWasm(false);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockUploadWasm).toHaveBeenCalledWith(mockFile, false);
      expect(result.current.error).toBe(null);
    });

    it('should default dotenvEnabled to true when not specified', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      const mockFile = createMockFile('wasm content', 'test.wasm', mockArrayBuffer);

      mockUploadWasm.mockResolvedValue('test.wasm');

      const { result } = renderHook(() => useWasm());

      // First, load a file
      await act(async () => {
        await result.current.loadWasm(mockFile);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockUploadWasm.mockClear();
      mockUploadWasm.mockResolvedValue('test.wasm');

      // Reload without specifying dotenvEnabled
      await act(async () => {
        await result.current.reloadWasm();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockUploadWasm).toHaveBeenCalledWith(mockFile, true);
    });

    it('should set error when no file is loaded', async () => {
      const { result } = renderHook(() => useWasm());

      await act(async () => {
        await result.current.reloadWasm();
      });

      expect(result.current.error).toBe('No WASM file loaded to reload');
      expect(mockUploadWasm).not.toHaveBeenCalled();
    });

    it('should not call uploadWasm when no file is stored', async () => {
      const { result } = renderHook(() => useWasm());

      await act(async () => {
        await result.current.reloadWasm(true);
      });

      expect(mockUploadWasm).not.toHaveBeenCalled();
      expect(result.current.error).toBe('No WASM file loaded to reload');
    });

    it('should handle reload errors gracefully', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      const errorMessage = 'Reload failed';
      const mockFile = createMockFile('wasm content', 'test.wasm', mockArrayBuffer);

      mockUploadWasm.mockResolvedValue('test.wasm');

      const { result } = renderHook(() => useWasm());

      // First, load a file
      await act(async () => {
        await result.current.loadWasm(mockFile);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Mock failure on reload
      mockUploadWasm.mockRejectedValueOnce(new Error(errorMessage));

      // Attempt to reload
      await act(async () => {
        await result.current.reloadWasm();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe(errorMessage);
    });

    it('should reuse the same file instance from wasmState', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      const mockFile = createMockFile('wasm content', 'test.wasm', mockArrayBuffer);

      mockUploadWasm.mockResolvedValue('test.wasm');

      const { result } = renderHook(() => useWasm());

      // Load initial file
      await act(async () => {
        await result.current.loadWasm(mockFile);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const storedFile = result.current.wasmState.wasmFile;

      // Reload
      mockUploadWasm.mockClear();
      mockUploadWasm.mockResolvedValue('test.wasm');

      await act(async () => {
        await result.current.reloadWasm();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Verify the same file instance was used
      expect(mockUploadWasm).toHaveBeenCalledWith(storedFile, true);
      expect(result.current.wasmState.wasmFile).toBe(storedFile);
    });
  });

  describe('state persistence', () => {
    it('should preserve wasmState across multiple operations', async () => {
      const mockArrayBuffer1 = new ArrayBuffer(8);
      const mockArrayBuffer2 = new ArrayBuffer(16);
      const mockFile1 = createMockFile('wasm content 1', 'test1.wasm', mockArrayBuffer1);
      const mockFile2 = createMockFile('wasm content 2', 'test2.wasm', mockArrayBuffer2);

      mockUploadWasm.mockResolvedValueOnce('test1.wasm');

      const { result } = renderHook(() => useWasm());

      // Load first file
      await act(async () => {
        await result.current.loadWasm(mockFile1);
      });

      await waitFor(() => {
        expect(result.current.wasmState.wasmFile).toBe(mockFile1);
      });

      // Load second file, should replace first
      mockUploadWasm.mockResolvedValueOnce('test2.wasm');

      await act(async () => {
        await result.current.loadWasm(mockFile2);
      });

      await waitFor(() => {
        expect(result.current.wasmState.wasmFile).toBe(mockFile2);
        expect(result.current.wasmState.wasmPath).toBe('test2.wasm');
        expect(result.current.wasmState.wasmBuffer).toBe(mockArrayBuffer2);
      });
    });

    it('should not update state if upload fails', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      const mockFile = createMockFile('wasm content', 'test.wasm', mockArrayBuffer);

      mockUploadWasm.mockRejectedValue(new Error('Upload failed'));

      const { result } = renderHook(() => useWasm());

      await act(async () => {
        await result.current.loadWasm(mockFile);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // State should remain null after failed upload
      expect(result.current.wasmState.wasmPath).toBe(null);
      expect(result.current.wasmState.wasmBuffer).toBe(null);
      expect(result.current.wasmState.wasmFile).toBe(null);
    });
  });

  describe('loading states', () => {
    it('should set loading to false after successful load', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      const mockFile = createMockFile('wasm content', 'test.wasm', mockArrayBuffer);

      mockUploadWasm.mockResolvedValue('test.wasm');

      const { result } = renderHook(() => useWasm());

      await act(async () => {
        await result.current.loadWasm(mockFile);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it('should handle concurrent load operations', async () => {
      const mockArrayBuffer1 = new ArrayBuffer(8);
      const mockArrayBuffer2 = new ArrayBuffer(16);
      const mockFile1 = createMockFile('wasm content 1', 'test1.wasm', mockArrayBuffer1);
      const mockFile2 = createMockFile('wasm content 2', 'test2.wasm', mockArrayBuffer2);

      let resolveUpload1: (value: string) => void;
      let resolveUpload2: (value: string) => void;

      const uploadPromise1 = new Promise<string>((resolve) => {
        resolveUpload1 = resolve;
      });
      const uploadPromise2 = new Promise<string>((resolve) => {
        resolveUpload2 = resolve;
      });

      mockUploadWasm
        .mockReturnValueOnce(uploadPromise1)
        .mockReturnValueOnce(uploadPromise2);

      const { result } = renderHook(() => useWasm());

      // Start both loads without awaiting
      act(() => {
        result.current.loadWasm(mockFile1);
      });

      act(() => {
        result.current.loadWasm(mockFile2);
      });

      expect(result.current.loading).toBe(true);

      // Resolve both uploads
      await act(async () => {
        resolveUpload1!('test1.wasm');
        resolveUpload2!('test2.wasm');
        await Promise.all([uploadPromise1, uploadPromise2]);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // One of the files should be loaded (both operations complete)
      expect(result.current.wasmState.wasmFile).toBeTruthy();
      expect([mockFile1, mockFile2]).toContain(result.current.wasmState.wasmFile);
    });
  });

  describe('error handling', () => {
    it('should clear error on successful operation after failure', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      const mockFile = createMockFile('wasm content', 'test.wasm', mockArrayBuffer);

      const { result } = renderHook(() => useWasm());

      // First attempt fails
      mockUploadWasm.mockRejectedValueOnce(new Error('First failure'));

      await act(async () => {
        await result.current.loadWasm(mockFile);
      });

      await waitFor(() => {
        expect(result.current.error).toBe('First failure');
      });

      // Second attempt succeeds
      mockUploadWasm.mockResolvedValueOnce('test.wasm');

      await act(async () => {
        await result.current.loadWasm(mockFile);
      });

      await waitFor(() => {
        expect(result.current.error).toBe(null);
      });
    });

    it('should preserve error state when reload fails', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      const mockFile = createMockFile('wasm content', 'test.wasm', mockArrayBuffer);

      mockUploadWasm.mockResolvedValue('test.wasm');

      const { result } = renderHook(() => useWasm());

      // Successful initial load
      await act(async () => {
        await result.current.loadWasm(mockFile);
      });

      await waitFor(() => {
        expect(result.current.error).toBe(null);
      });

      // Failed reload
      mockUploadWasm.mockRejectedValueOnce(new Error('Reload failed'));

      await act(async () => {
        await result.current.reloadWasm();
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Reload failed');
      });
    });

    it('should handle network timeout errors', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      const timeoutError = new Error('Network timeout');
      const mockFile = createMockFile('wasm content', 'test.wasm', mockArrayBuffer);

      mockUploadWasm.mockRejectedValue(timeoutError);

      const { result } = renderHook(() => useWasm());

      await act(async () => {
        await result.current.loadWasm(mockFile);
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Network timeout');
      });
    });
  });

  describe('wasmState updates', () => {
    it('should update all wasmState fields correctly', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      const mockPath = 'test.wasm';
      const mockFile = createMockFile('wasm content', 'test.wasm', mockArrayBuffer);

      mockUploadWasm.mockResolvedValue(mockPath);

      const { result } = renderHook(() => useWasm());

      expect(result.current.wasmState.wasmPath).toBe(null);
      expect(result.current.wasmState.wasmBuffer).toBe(null);
      expect(result.current.wasmState.wasmFile).toBe(null);

      await act(async () => {
        await result.current.loadWasm(mockFile);
      });

      await waitFor(() => {
        expect(result.current.wasmState.wasmPath).toBe(mockPath);
        expect(result.current.wasmState.wasmBuffer).toBe(mockArrayBuffer);
        expect(result.current.wasmState.wasmFile).toBe(mockFile);
      });
    });

    it('should maintain wasmBuffer reference across reloads', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      const mockFile = createMockFile('wasm content', 'test.wasm', mockArrayBuffer);

      mockUploadWasm.mockResolvedValue('test.wasm');

      const { result } = renderHook(() => useWasm());

      // Initial load
      await act(async () => {
        await result.current.loadWasm(mockFile);
      });

      await waitFor(() => {
        expect(result.current.wasmState.wasmBuffer).toBe(mockArrayBuffer);
      });

      const firstBuffer = result.current.wasmState.wasmBuffer;

      // Reload
      await act(async () => {
        await result.current.reloadWasm();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Buffer should be updated (arrayBuffer is called again)
      expect(result.current.wasmState.wasmBuffer).toBe(mockArrayBuffer);
      expect(result.current.wasmState.wasmBuffer).toBe(firstBuffer);
    });
  });
});
