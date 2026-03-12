/**
 * Environment Detection Utilities
 *
 * Detects the environment where the frontend is running to enable
 * context-specific optimizations (e.g., path-based WASM loading in VSCode).
 */

/**
 * Checks if the application is running within a VSCode extension context.
 *
 * In VSCode/Electron environments, a vscodeApi global object is exposed
 * that allows communication with the extension host.
 *
 * @returns true if running in VSCode extension context
 */
export function isVSCodeContext(): boolean {
  // Check for VSCode API
  if (typeof window !== "undefined") {
    // VSCode webview API
    if ((window as any).vscodeApi !== undefined) {
      return true;
    }

    // VSCode acquireVsCodeApi function
    if (typeof (window as any).acquireVsCodeApi === "function") {
      return true;
    }

    // Check for VSCode-specific global
    if ((window as any).vscode !== undefined) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if the application is running in an Electron environment.
 *
 * Electron apps (including VSCode) expose process and related APIs.
 *
 * @returns true if running in Electron
 */
export function isElectronContext(): boolean {
  if (typeof window !== "undefined") {
    // Check for electron in user agent
    if (
      navigator.userAgent.toLowerCase().includes("electron") ||
      navigator.userAgent.toLowerCase().includes("vscode")
    ) {
      return true;
    }

    // Check for process.type (Electron-specific)
    if (
      (window as any).process?.type === "renderer" ||
      (window as any).process?.type === "worker"
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if running in a Node.js-like environment with filesystem access.
 *
 * This includes VSCode extensions, Electron apps, and GitHub Codespaces.
 *
 * @returns true if filesystem access is likely available
 */
export function hasFilesystemAccess(): boolean {
  // VSCode/Electron contexts have filesystem access
  if (isVSCodeContext() || isElectronContext()) {
    return true;
  }

  // Check for Node.js process global
  if (typeof (window as any).process !== "undefined") {
    return true;
  }

  // Check for File.path property support (Electron-specific)
  try {
    const testFile = new File(["test"], "test.txt");
    if ("path" in testFile) {
      return true;
    }
  } catch {
    // Ignore errors
  }

  return false;
}

/**
 * Checks if the application is running in a browser-only context.
 *
 * In browser-only mode, file paths are not available and buffer-based
 * loading must be used.
 *
 * @returns true if running in browser-only context
 */
export function isBrowserOnlyContext(): boolean {
  return !hasFilesystemAccess();
}

/**
 * Environment information for debugging and telemetry
 */
export interface EnvironmentInfo {
  isVSCode: boolean;
  isElectron: boolean;
  hasFilesystem: boolean;
  isBrowserOnly: boolean;
  userAgent: string;
  platform: string;
}

/**
 * Gets comprehensive environment information.
 *
 * Useful for debugging, telemetry, and feature detection.
 *
 * @returns Environment information object
 */
export function getEnvironmentInfo(): EnvironmentInfo {
  return {
    isVSCode: isVSCodeContext(),
    isElectron: isElectronContext(),
    hasFilesystem: hasFilesystemAccess(),
    isBrowserOnly: isBrowserOnlyContext(),
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
    platform: typeof navigator !== "undefined" ? navigator.platform : "unknown",
  };
}

/**
 * Logs environment information to console (for debugging).
 *
 * Only logs in development mode to avoid console spam in production.
 */
export function logEnvironmentInfo(): void {
  if (import.meta.env.DEV) {
    const info = getEnvironmentInfo();
    console.log("🌍 Environment Detection:", info);
  }
}
