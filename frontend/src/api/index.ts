import { HookCall, HookResult } from "../types";
import type { TestConfig } from "../stores/types";
export type { TestConfig } from "../stores/types";
import { hasFilesystemAccess } from "../utils/environment";
import { getFilePath, hasFilePath, formatFileSize } from "../utils/filePath";

const API_BASE = "/api";

/**
 * Environment info from server
 */
export interface EnvironmentInfo {
  environment: 'vscode' | 'node';
  supportsPathLoading: boolean;
}

/**
 * Get environment information from the server
 * @returns Environment info indicating if running in VSCode or Node
 */
export async function getEnvironment(): Promise<EnvironmentInfo> {
  const response = await fetch(`${API_BASE}/environment`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    // Default to node environment if endpoint fails
    console.warn("Failed to fetch environment info, defaulting to node");
    return {
      environment: 'node',
      supportsPathLoading: true,
    };
  }

  const result = await response.json();
  return result;
}

/**
 * Get workspace WASM path (VSCode only)
 * @returns Path to workspace WASM file if it exists, null otherwise
 */
export async function getWorkspaceWasm(): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE}/workspace-wasm`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return null;
    }

    const result = await response.json();
    return result.path;
  } catch (error) {
    console.error("Failed to fetch workspace WASM path:", error);
    return null;
  }
}

/**
 * Loading mode used for WASM upload
 */
export type LoadingMode = "path" | "buffer";

/**
 * Result of WASM upload with loading metadata
 */
export interface UploadWasmResult {
  path: string;
  wasmType: "proxy-wasm" | "http-wasm";
  loadingMode: LoadingMode;
  loadTime: number;
  fileSize: number;
}

/**
 * Uploads a WASM file to the server using the optimal loading strategy.
 *
 * **Path-based loading (preferred)**:
 * - Used when running in VSCode/Electron with filesystem access
 * - Sends file path instead of binary data
 * - 70-95% faster for large files (10MB+)
 * - 75-80% less memory usage
 *
 * **Buffer-based loading (fallback)**:
 * - Used in browser-only contexts
 * - Sends base64-encoded binary data
 * - Required when file path is unavailable
 *
 * @param file - The WASM file to upload
 * @param dotenvEnabled - Whether to enable .env file loading
 * @returns Upload result with metadata
 */
export async function uploadWasm(
  file: File,
  dotenvEnabled: boolean = true,
  dotenvPath?: string | null,
): Promise<UploadWasmResult> {
  const startTime = performance.now();
  const fileSize = file.size;

  // Try path-based loading first (if available)
  if (hasFilesystemAccess() && hasFilePath(file)) {
    const filePath = getFilePath(file);

    if (filePath) {
      console.log(
        `📁 Using path-based loading (${formatFileSize(fileSize)}): ${filePath}`,
      );

      try {
        const response = await fetch(`${API_BASE}/load`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ wasmPath: filePath, dotenv: { enabled: dotenvEnabled, ...(dotenvPath ? { path: dotenvPath } : {}) } }),
        });

        if (!response.ok) {
          const result = await response.json();
          // If path loading fails, fall back to buffer loading
          console.warn(
            "⚠️ Path-based loading failed, falling back to buffer mode:",
            result.error,
          );
        } else {
          const loadTime = performance.now() - startTime;
          const result = await response.json();

          console.log(
            `✅ Path-based loading succeeded in ${loadTime.toFixed(1)}ms`,
          );

          return {
            path: file.name,
            wasmType: result.wasmType,
            loadingMode: "path",
            loadTime,
            fileSize,
          };
        }
      } catch (error) {
        console.warn(
          "⚠️ Path-based loading error, falling back to buffer mode:",
          error,
        );
      }
    }
  }

  // Fallback to buffer-based loading
  console.log(
    `💾 Using buffer-based loading (${formatFileSize(fileSize)})...`,
  );

  const buffer = await file.arrayBuffer();
  const base64 = btoa(
    new Uint8Array(buffer).reduce(
      (data, byte) => data + String.fromCharCode(byte),
      "",
    ),
  );

  const response = await fetch(`${API_BASE}/load`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ wasmBase64: base64, dotenv: { enabled: dotenvEnabled, ...(dotenvPath ? { path: dotenvPath } : {}) } }),
  });

  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error || "Failed to load WASM file");
  }

  const loadTime = performance.now() - startTime;
  const result = await response.json();

  console.log(`✅ Buffer-based loading succeeded in ${loadTime.toFixed(1)}ms`);

  return {
    path: file.name,
    wasmType: result.wasmType,
    loadingMode: "buffer",
    loadTime,
    fileSize,
  };
}

/**
 * Uploads a WASM file by path directly (no File object needed).
 *
 * This is ideal for:
 * - Local development in browser mode
 * - CI/CD testing workflows
 * - Agent/API usage
 * - When you know the exact file path
 *
 * Always uses path-based loading (fastest mode).
 *
 * @param wasmPath - Absolute or relative path to WASM file
 * @param dotenvEnabled - Whether to enable .env file loading
 * @returns Upload result with metadata
 */
export async function uploadWasmFromPath(
  wasmPath: string,
  dotenvEnabled: boolean = true,
  dotenvPath?: string | null,
): Promise<UploadWasmResult> {
  const startTime = performance.now();

  console.log(`📁 Loading WASM from path: ${wasmPath}`);

  const response = await fetch(`${API_BASE}/load`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ wasmPath, dotenv: { enabled: dotenvEnabled, ...(dotenvPath ? { path: dotenvPath } : {}) } }),
  });

  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error || "Failed to load WASM from path");
  }

  const loadTime = performance.now() - startTime;
  const result = await response.json();

  console.log(`✅ Path-based loading succeeded in ${loadTime.toFixed(1)}ms`);

  return {
    path: result.resolvedPath || wasmPath, // Use resolved absolute path from backend, fallback to original
    wasmType: result.wasmType,
    loadingMode: "path",
    loadTime,
    fileSize: 0, // Unknown from path-only loading
  };
}

export async function callHook(
  hook: string,
  params: HookCall,
): Promise<HookResult> {
  const payload = {
    hook,
    request: {
      headers: params.request_headers || {},
      body: params.request_body || "",
      trailers: params.request_trailers || {},
    },
    response: {
      headers: params.response_headers || {},
      body: params.response_body || "",
      trailers: params.response_trailers || {},
    },
    properties: params.properties || {},
    // logLevel not sent - server always returns all logs for client-side filtering
  };

  const response = await fetch(`${API_BASE}/call`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error || `Failed to call hook: ${hook}`);
  }

  const result = await response.json();
  const logs = result.result?.logs || [];
  return {
    logs: logs, // Keep as array for client-side filtering
    returnValue: result.result?.returnCode,
    error: result.error,
  };
}

export async function sendFullFlow(
  url: string,
  method: string,
  params: HookCall,
): Promise<{
  hookResults: Record<string, HookResult>;
  finalResponse: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
    contentType: string;
    isBase64?: boolean;
  };
  calculatedProperties?: Record<string, unknown>;
}> {
  const payload = {
    url,
    request: {
      headers: params.request_headers || {},
      body: params.request_body || "",
      method: method || "GET",
    },
    response: {
      headers: params.response_headers || {},
      body: params.response_body || "",
    },
    properties: params.properties || {},
    // logLevel not sent - server always returns all logs for client-side filtering
  };

  const response = await fetch(`${API_BASE}/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error || "Failed to execute full flow");
  }

  const result = await response.json();
  const hookResults: Record<string, HookResult> = {};

  // Transform each hook result
  for (const [hook, hookResult] of Object.entries(result.hookResults || {})) {
    const hr = hookResult as any;
    const logs = hr?.logs || [];
    hookResults[hook] = {
      logs: logs, // Keep as array for client-side filtering
      returnValue: hr?.returnCode,
      error: hr?.error,
      input: hr?.input,
      output: hr?.output,
      properties: hr?.properties,
    };
  }

  return {
    hookResults,
    finalResponse: result.finalResponse,
    calculatedProperties: result.calculatedProperties,
  };
}

// TestConfig is imported from ../types

export async function loadConfig(): Promise<TestConfig> {
  const response = await fetch(`${API_BASE}/config`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error || "Failed to load config");
  }

  const result = await response.json();
  return result.config;
}

export async function saveConfig(config: TestConfig): Promise<void> {
  const response = await fetch(`${API_BASE}/config`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ config }),
  });

  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error || "Failed to save config");
  }
}

export async function showSaveDialog(
  suggestedName: string
): Promise<{ canceled?: boolean; filePath?: string; fallbackRequired?: boolean }> {
  const response = await fetch(`${API_BASE}/config/show-save-dialog`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ suggestedName }),
  });

  const result = await response.json();
  return result;
}

export async function saveConfigAs(
  config: TestConfig,
  filePath: string
): Promise<{ savedPath: string }> {
  const response = await fetch(`${API_BASE}/config/save-as`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ config, filePath }),
  });

  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error || "Failed to save config");
  }

  return response.json();
}

export async function executeHttpWasm(
  url: string,
  method: string = 'GET',
  headers: Record<string, string> = {},
  body: string = ''
): Promise<{
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  contentType: string;
  isBase64?: boolean;
  logs: Array<{ level: number; message: string }>;
}> {
  // Extract the path from the full internal URL and send `path` to the server.
  // The server accepts both `path` and `url`, but `path` is the canonical form
  // for HTTP WASM apps (mirrors how the real FastEdge server works).
  let path: string;
  try {
    const parsed = new URL(url);
    path = parsed.pathname + parsed.search;
  } catch {
    // If url is already a path (e.g. "/api/hello"), use it directly
    path = url;
  }

  const payload = {
    path,
    method,
    headers,
    body,
  };

  const response = await fetch(`${API_BASE}/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error || "Failed to execute HTTP WASM");
  }

  const result = await response.json();
  return result.result;
}

/**
 * Apply dotenv settings to the current runner without reloading the WASM.
 * For proxy-wasm: resets stores and re-loads .env files in-place.
 * For http-wasm: restarts the fastedge-run process with the updated flag.
 */
export async function applyDotenv(enabled: boolean, dotenvPath?: string | null): Promise<void> {
  const response = await fetch(`${API_BASE}/dotenv`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dotenv: { enabled, ...(dotenvPath ? { path: dotenvPath } : {}) } }),
  });

  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error || "Failed to apply dotenv setting");
  }
}
