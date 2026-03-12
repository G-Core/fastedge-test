import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAppStore } from '../index';
import * as api from '../../api';

// Mock the API module
vi.mock('../../api', () => ({
  uploadWasm: vi.fn(),
}));

describe('WasmSlice', () => {
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

  // Helper function to create mock upload result
  const createMockUploadResult = (
    path: string,
    loadingMode: 'path' | 'buffer' = 'buffer'
  ) => ({
    path,
    wasmType: 'proxy-wasm' as const,
    loadingMode,
    loadTime: 100,
    fileSize: 1024,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear the store state
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.clearWasm();
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('initial state', () => {
    it('should have correct default values', () => {
      const { result } = renderHook(() => useAppStore());

      expect(result.current.wasmPath).toBe(null);
      expect(result.current.wasmBuffer).toBe(null);
      expect(result.current.wasmFile).toBe(null);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(null);
    });
  });

  describe('loadWasm', () => {
    it('should successfully load a WASM file with dotenv enabled', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      const mockPath = 'test.wasm';
      const mockFile = createMockFile('wasm content', 'test.wasm', mockArrayBuffer);

      mockUploadWasm.mockResolvedValue({
        path: mockPath,
        wasmType: 'proxy-wasm',
        loadingMode: 'buffer',
        loadTime: 100,
        fileSize: mockFile.size,
      });

      const { result } = renderHook(() => useAppStore());

      await act(async () => {
        await result.current.loadWasm(mockFile, true);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockUploadWasm).toHaveBeenCalledWith(mockFile, true);
      expect(mockUploadWasm).toHaveBeenCalledTimes(1);
      expect(result.current.wasmPath).toBe(mockPath);
      expect(result.current.wasmBuffer).toBe(mockArrayBuffer);
      expect(result.current.wasmFile).toBe(mockFile);
      expect(result.current.error).toBe(null);
    });

    it('should successfully load a WASM file with dotenv disabled', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      const mockPath = 'test.wasm';
      const mockFile = createMockFile('wasm content', 'test.wasm', mockArrayBuffer);

      mockUploadWasm.mockResolvedValue(createMockUploadResult(mockPath));

      const { result } = renderHook(() => useAppStore());

      await act(async () => {
        await result.current.loadWasm(mockFile, false);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockUploadWasm).toHaveBeenCalledWith(mockFile, false);
      expect(result.current.wasmFile).toBe(mockFile);
      expect(result.current.error).toBe(null);
    });

    it('should set loading to true during upload', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      const mockFile = createMockFile('wasm content', 'test.wasm', mockArrayBuffer);

      let resolveUpload: (value: string) => void;
      const uploadPromise = new Promise<string>((resolve) => {
        resolveUpload = resolve;
      });
      mockUploadWasm.mockReturnValue(uploadPromise);

      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.loadWasm(mockFile, true);
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

      const { result } = renderHook(() => useAppStore());

      // First load fails
      await act(async () => {
        await result.current.loadWasm(mockFile, true);
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Upload failed');
      });

      // Second load succeeds
      mockUploadWasm.mockResolvedValueOnce(createMockUploadResult('test.wasm'));

      await act(async () => {
        await result.current.loadWasm(mockFile, true);
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

      const { result } = renderHook(() => useAppStore());

      await act(async () => {
        await result.current.loadWasm(mockFile, true);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe(errorMessage);
      expect(result.current.wasmPath).toBe(null);
      expect(result.current.wasmBuffer).toBe(null);
      expect(result.current.wasmFile).toBe(null);
    });

    it('should handle non-Error object in catch block', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      const mockFile = createMockFile('wasm content', 'test.wasm', mockArrayBuffer);

      mockUploadWasm.mockRejectedValue('String error');

      const { result } = renderHook(() => useAppStore());

      await act(async () => {
        await result.current.loadWasm(mockFile, true);
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

      const { result } = renderHook(() => useAppStore());

      await act(async () => {
        await result.current.loadWasm(mockFile, true);
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
        size: 1024,
        arrayBuffer: vi.fn().mockRejectedValue(new Error(errorMessage)),
      } as unknown as File;

      // Mock uploadWasm to succeed with buffer loading mode
      mockUploadWasm.mockResolvedValue(createMockUploadResult('test.wasm', 'buffer'));

      const { result } = renderHook(() => useAppStore());

      await act(async () => {
        await result.current.loadWasm(mockFile, true);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // uploadWasm succeeds, but arrayBuffer() fails, so error is caught
      expect(result.current.error).toBe(errorMessage);
      expect(mockUploadWasm).toHaveBeenCalledWith(mockFile, true);
    });

    it('should set loading to false even when upload fails', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      const mockFile = createMockFile('wasm content', 'test.wasm', mockArrayBuffer);

      mockUploadWasm.mockRejectedValue(new Error('Upload failed'));

      const { result } = renderHook(() => useAppStore());

      await act(async () => {
        await result.current.loadWasm(mockFile, true);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).not.toBe(null);
    });

    it('should store the file for later reloading', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      const mockFile = createMockFile('wasm content', 'test.wasm', mockArrayBuffer);

      mockUploadWasm.mockResolvedValue(createMockUploadResult('test.wasm'));

      const { result } = renderHook(() => useAppStore());

      await act(async () => {
        await result.current.loadWasm(mockFile, true);
      });

      await waitFor(() => {
        expect(result.current.wasmFile).toBe(mockFile);
      });
    });
  });

  describe('reloadWasm', () => {
    it('should reload the stored WASM file with dotenv enabled', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      const mockFile = createMockFile('wasm content', 'test.wasm', mockArrayBuffer);

      mockUploadWasm.mockResolvedValue(createMockUploadResult('test.wasm'));

      const { result } = renderHook(() => useAppStore());

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
      mockUploadWasm.mockResolvedValue(createMockUploadResult('test.wasm'));

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

      mockUploadWasm.mockResolvedValue(createMockUploadResult('test.wasm'));

      const { result } = renderHook(() => useAppStore());

      // First, load a file
      await act(async () => {
        await result.current.loadWasm(mockFile, true);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockUploadWasm.mockClear();
      mockUploadWasm.mockResolvedValue(createMockUploadResult('test.wasm'));

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

    it('should set error when no file is loaded', async () => {
      const { result } = renderHook(() => useAppStore());

      await act(async () => {
        await result.current.reloadWasm(true);
      });

      expect(result.current.error).toBe('No WASM file loaded to reload');
      expect(mockUploadWasm).not.toHaveBeenCalled();
    });

    it('should not call uploadWasm when no file is stored', async () => {
      const { result } = renderHook(() => useAppStore());

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

      mockUploadWasm.mockResolvedValue(createMockUploadResult('test.wasm'));

      const { result } = renderHook(() => useAppStore());

      // First, load a file
      await act(async () => {
        await result.current.loadWasm(mockFile, true);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Mock failure on reload
      mockUploadWasm.mockRejectedValueOnce(new Error(errorMessage));

      // Attempt to reload
      await act(async () => {
        await result.current.reloadWasm(true);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe(errorMessage);
    });

    it('should reuse the same file instance from state', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      const mockFile = createMockFile('wasm content', 'test.wasm', mockArrayBuffer);

      mockUploadWasm.mockResolvedValue(createMockUploadResult('test.wasm'));

      const { result } = renderHook(() => useAppStore());

      // Load initial file
      await act(async () => {
        await result.current.loadWasm(mockFile, true);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const storedFile = result.current.wasmFile;

      // Reload
      mockUploadWasm.mockClear();
      mockUploadWasm.mockResolvedValue(createMockUploadResult('test.wasm'));

      await act(async () => {
        await result.current.reloadWasm(true);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Verify the same file instance was used
      expect(mockUploadWasm).toHaveBeenCalledWith(storedFile, true);
      expect(result.current.wasmFile).toBe(storedFile);
    });
  });

  describe('clearWasm', () => {
    it('should clear all WASM state', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      const mockFile = createMockFile('wasm content', 'test.wasm', mockArrayBuffer);

      mockUploadWasm.mockResolvedValue(createMockUploadResult('test.wasm'));

      const { result } = renderHook(() => useAppStore());

      // Load a file first
      await act(async () => {
        await result.current.loadWasm(mockFile, true);
      });

      await waitFor(() => {
        expect(result.current.wasmPath).not.toBe(null);
      });

      // Clear WASM
      act(() => {
        result.current.clearWasm();
      });

      expect(result.current.wasmPath).toBe(null);
      expect(result.current.wasmBuffer).toBe(null);
      expect(result.current.wasmFile).toBe(null);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('should clear error state', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setError('Some error');
        result.current.clearWasm();
      });

      expect(result.current.error).toBe(null);
    });
  });

  describe('setLoading', () => {
    it('should manually set loading state to true', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setLoading(true);
      });

      expect(result.current.loading).toBe(true);
    });

    it('should manually set loading state to false', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setLoading(true);
        result.current.setLoading(false);
      });

      expect(result.current.loading).toBe(false);
    });
  });

  describe('setError', () => {
    it('should manually set error state', () => {
      const { result } = renderHook(() => useAppStore());
      const errorMessage = 'Manual error';

      act(() => {
        result.current.setError(errorMessage);
      });

      expect(result.current.error).toBe(errorMessage);
    });

    it('should clear error state by setting null', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setError('Some error');
        result.current.setError(null);
      });

      expect(result.current.error).toBe(null);
    });
  });

  describe('state persistence', () => {
    it('should preserve wasmState across multiple operations', async () => {
      const mockArrayBuffer1 = new ArrayBuffer(8);
      const mockArrayBuffer2 = new ArrayBuffer(16);
      const mockFile1 = createMockFile('wasm content 1', 'test1.wasm', mockArrayBuffer1);
      const mockFile2 = createMockFile('wasm content 2', 'test2.wasm', mockArrayBuffer2);

      mockUploadWasm.mockResolvedValueOnce(createMockUploadResult('test1.wasm'));

      const { result } = renderHook(() => useAppStore());

      // Load first file
      await act(async () => {
        await result.current.loadWasm(mockFile1, true);
      });

      await waitFor(() => {
        expect(result.current.wasmFile).toBe(mockFile1);
      });

      // Load second file, should replace first
      mockUploadWasm.mockResolvedValueOnce(createMockUploadResult('test2.wasm'));

      await act(async () => {
        await result.current.loadWasm(mockFile2, true);
      });

      await waitFor(() => {
        expect(result.current.wasmFile).toBe(mockFile2);
        expect(result.current.wasmPath).toBe('test2.wasm');
        expect(result.current.wasmBuffer).toBe(mockArrayBuffer2);
      });
    });

    it('should not update state if upload fails', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      const mockFile = createMockFile('wasm content', 'test.wasm', mockArrayBuffer);

      mockUploadWasm.mockRejectedValue(new Error('Upload failed'));

      const { result } = renderHook(() => useAppStore());

      await act(async () => {
        await result.current.loadWasm(mockFile, true);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // State should remain null after failed upload
      expect(result.current.wasmPath).toBe(null);
      expect(result.current.wasmBuffer).toBe(null);
      expect(result.current.wasmFile).toBe(null);
    });
  });

  describe('error handling', () => {
    it('should clear error on successful operation after failure', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      const mockFile = createMockFile('wasm content', 'test.wasm', mockArrayBuffer);

      const { result } = renderHook(() => useAppStore());

      // First attempt fails
      mockUploadWasm.mockRejectedValueOnce(new Error('First failure'));

      await act(async () => {
        await result.current.loadWasm(mockFile, true);
      });

      await waitFor(() => {
        expect(result.current.error).toBe('First failure');
      });

      // Second attempt succeeds
      mockUploadWasm.mockResolvedValueOnce(createMockUploadResult('test.wasm'));

      await act(async () => {
        await result.current.loadWasm(mockFile, true);
      });

      await waitFor(() => {
        expect(result.current.error).toBe(null);
      });
    });

    it('should handle network timeout errors', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      const timeoutError = new Error('Network timeout');
      const mockFile = createMockFile('wasm content', 'test.wasm', mockArrayBuffer);

      mockUploadWasm.mockRejectedValue(timeoutError);

      const { result } = renderHook(() => useAppStore());

      await act(async () => {
        await result.current.loadWasm(mockFile, true);
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Network timeout');
      });
    });
  });
});
