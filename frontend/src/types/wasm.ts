/**
 * WASM Loading Types
 *
 * Type definitions for WASM loading and metadata.
 */

/**
 * Loading mode used for WASM upload
 */
export type LoadingMode = "path" | "buffer";

/**
 * WASM type detected by the server
 */
export type WasmType = "proxy-wasm" | "http-wasm";

/**
 * Result of WASM upload with loading metadata
 */
export interface UploadWasmResult {
  /** File name or path */
  path: string;

  /** Detected WASM type */
  wasmType: WasmType;

  /** Loading mode used (path or buffer) */
  loadingMode: LoadingMode;

  /** Load time in milliseconds */
  loadTime: number;

  /** File size in bytes */
  fileSize: number;
}

/**
 * File information for display and debugging
 */
export interface FileInfo {
  /** File name */
  name: string;

  /** Filesystem path (if available) */
  path: string | null;

  /** File size in bytes */
  size: number;

  /** MIME type */
  type: string;

  /** Whether the file has a filesystem path */
  hasPath: boolean;
}

/**
 * Environment information for debugging and telemetry
 */
export interface EnvironmentInfo {
  /** Running in VSCode extension */
  isVSCode: boolean;

  /** Running in Electron */
  isElectron: boolean;

  /** Has filesystem access */
  hasFilesystem: boolean;

  /** Browser-only context */
  isBrowserOnly: boolean;

  /** User agent string */
  userAgent: string;

  /** Platform string */
  platform: string;
}
