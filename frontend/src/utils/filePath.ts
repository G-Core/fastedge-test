/**
 * File Path Extraction Utilities
 *
 * Safely extracts filesystem paths from File objects when available.
 * In VSCode/Electron environments, File objects have a 'path' property.
 */

/**
 * Augment the File interface to include the optional 'path' property
 * that exists in Electron/VSCode environments.
 */
declare global {
  interface File {
    /**
     * Filesystem path to the file (Electron/VSCode only).
     * Not available in standard browser environments.
     */
    path?: string;
  }
}

/**
 * Checks if a File object has a filesystem path.
 *
 * @param file - The File object to check
 * @returns true if the file has a path property
 */
export function hasFilePath(file: File): boolean {
  return typeof file.path === "string" && file.path.length > 0;
}

/**
 * Safely extracts the filesystem path from a File object.
 *
 * In VSCode/Electron environments, File objects include a 'path' property
 * that contains the full filesystem path. This allows for optimized
 * path-based loading instead of buffer-based loading.
 *
 * @param file - The File object to extract the path from
 * @returns The filesystem path, or null if not available
 */
export function getFilePath(file: File): string | null {
  if (!file) {
    return null;
  }

  // Check for path property (Electron/VSCode)
  if (hasFilePath(file)) {
    return file.path!;
  }

  return null;
}

/**
 * Gets the filename from either a File object or path string.
 *
 * @param fileOrPath - A File object or path string
 * @returns The filename
 */
export function getFileName(fileOrPath: File | string): string {
  if (typeof fileOrPath === "string") {
    // Extract filename from path
    return fileOrPath.split(/[\\/]/).pop() || fileOrPath;
  }

  // Get name from File object
  return fileOrPath.name;
}

/**
 * Validates that a file path points to a WASM file.
 *
 * @param path - The path to validate
 * @returns true if the path ends with .wasm
 */
export function isWasmFile(path: string): boolean {
  return path.toLowerCase().endsWith(".wasm");
}

/**
 * File information for display and debugging
 */
export interface FileInfo {
  name: string;
  path: string | null;
  size: number;
  type: string;
  hasPath: boolean;
}

/**
 * Extracts comprehensive file information from a File object.
 *
 * @param file - The File object to extract info from
 * @returns File information object
 */
export function getFileInfo(file: File): FileInfo {
  return {
    name: file.name,
    path: getFilePath(file),
    size: file.size,
    type: file.type,
    hasPath: hasFilePath(file),
  };
}

/**
 * Formats file size for display (human-readable).
 *
 * @param bytes - File size in bytes
 * @returns Formatted size string (e.g., "1.2 MB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
