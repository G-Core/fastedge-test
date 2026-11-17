import { HookCall, HookResult, StoreCall } from "../types";
import type { TestConfig, ClientContext, EdgeContext, Preset } from "../stores/types";
export type { TestConfig } from "../stores/types";
import { hasFilesystemAccess } from "../utils/environment";
import { getFilePath, hasFilePath, formatFileSize } from "../utils/filePath";
import { getToken } from "../utils/token";

const API_BASE = "/api";

function apiFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("x-fastedge-token", getToken());
  return fetch(input, { ...init, headers });
}

/**
 * Environment info from server
 */
export interface EnvironmentInfo {
  environment: 'vscode' | 'node';
  supportsPathLoading: boolean;
  workspaceRoot: string | null;
}

/**
 * Get environment information from the server
 * @returns Environment info indicating if running in VSCode or Node
 */
export async function getEnvironment(): Promise<EnvironmentInfo> {
  const response = await apiFetch(`${API_BASE}/environment`, {
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
      workspaceRoot: null,
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
    const response = await apiFetch(`${API_BASE}/workspace-wasm`, {
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

/** Per-load settings from the config file (no UI controls); null = the server default. */
export type LoadOptions = {
  httpPort?: number | null;
  stores?: boolean | null;
  dc?: string | null;
  client?: ClientContext | null;
  edge?: EdgeContext | null;
};

function loadOptions({ httpPort, stores, dc, client, edge }: LoadOptions) {
  return {
    ...(httpPort ? { httpPort } : {}),
    ...(stores != null ? { stores } : {}),
    ...(dc ? { dc } : {}),
    ...requestContext({ client, edge }),
  };
}

/** Client and edge for a request body: always both, so "none" clears the runner's. */
export type RequestContext = { client?: ClientContext | null; edge?: EdgeContext | null };
function requestContext({ client, edge }: RequestContext = {}) {
  return { client: client ?? {}, edge: edge ?? {} };
}

/** Client and edge presets (prod captures), from the server. */
export async function getRequestContextPresets(): Promise<{
  client: Record<Preset, Required<Omit<ClientContext, "preset">>>;
  edge: Record<Preset, Required<Omit<EdgeContext, "preset">>>;
}> {
  const response = await apiFetch(`${API_BASE}/request-context/presets`);
  if (!response.ok) throw new Error("Failed to load request context presets");
  return response.json();
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
  options: LoadOptions = {},
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
        const response = await apiFetch(`${API_BASE}/load`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ wasmPath: filePath, dotenv: { enabled: dotenvEnabled, ...(dotenvPath ? { path: dotenvPath } : {}) }, ...loadOptions(options) }),
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

  const response = await apiFetch(`${API_BASE}/load`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ wasmBase64: base64, dotenv: { enabled: dotenvEnabled, ...(dotenvPath ? { path: dotenvPath } : {}) }, ...loadOptions(options) }),
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
  options: LoadOptions = {},
): Promise<UploadWasmResult> {
  const startTime = performance.now();

  console.log(`📁 Loading WASM from path: ${wasmPath}`);

  const response = await apiFetch(`${API_BASE}/load`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ wasmPath, dotenv: { enabled: dotenvEnabled, ...(dotenvPath ? { path: dotenvPath } : {}) }, ...loadOptions(options) }),
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
  context?: RequestContext,
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
    ...requestContext(context),
    // logLevel not sent - server always returns all logs for client-side filtering
  };

  const response = await apiFetch(`${API_BASE}/call`, {
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
    storeCalls: result.result?.storeCalls,
  };
}

export async function sendFullFlow(
  url: string,
  method: string,
  params: HookCall,
  context?: RequestContext,
): Promise<{
  hookResults: Record<string, HookResult>;
  finalResponse: {
    status: number;
    statusText: string;
    headers: Record<string, string | string[]>;
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
    properties: params.properties || {},
    ...requestContext(context),
    // logLevel not sent - server always returns all logs for client-side filtering
  };

  const response = await apiFetch(`${API_BASE}/send`, {
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
      storeCalls: hr?.storeCalls,
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
  const response = await apiFetch(`${API_BASE}/config`, {
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
  const response = await apiFetch(`${API_BASE}/config`, {
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
  const response = await apiFetch(`${API_BASE}/config/show-save-dialog`, {
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
  const response = await apiFetch(`${API_BASE}/config/save-as`, {
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
  body: string = '',
  context?: RequestContext,
): Promise<{
  status: number;
  statusText: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
  contentType: string;
  isBase64?: boolean;
  logs: Array<{ level: number; message: string }>;
  storeCalls?: StoreCall[];
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
    ...requestContext(context),
  };

  const response = await apiFetch(`${API_BASE}/execute`, {
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
  const response = await apiFetch(`${API_BASE}/dotenv`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dotenv: { enabled, ...(dotenvPath ? { path: dotenvPath } : {}) } }),
  });

  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error || "Failed to apply dotenv setting");
  }
}

/** What the cache (one `dc`) and Edge KV hold: sizes, not values (Stores panel). */
export type StoresSnapshot =
  | { enabled: false }
  | {
      enabled: true;
      /** The loaded app's cache bucket. */
      appDc: string;
      /** The service clock (ms since epoch). */
      now: number;
      /** The clock is paused: it moves only with Advance clock. */
      clockPaused: boolean;
      dc: string;
      dcs: string[];
      cache: { key: string; size: number; expiresAt: number }[];
      kv: {
        store: string;
        strings: { key: string; size: number }[];
        zsets: { key: string; members: number }[];
        bloom: { key: string; items: number }[];
      }[];
    };

async function storesCall(path: string, init?: RequestInit): Promise<any> {
  const response = await apiFetch(`${API_BASE}/stores${path}`, init);
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || `Stores request failed (${response.status})`);
  return result;
}

export async function getStoresSnapshot(dc?: string): Promise<StoresSnapshot> {
  return storesCall(dc ? `?dc=${encodeURIComponent(dc)}` : "");
}

/** Back to the fixtures: cache emptied (every dc), Edge KV re-seeded. */
export async function resetStores(): Promise<void> {
  await storesCall("/reset", { method: "POST" });
}

/** Move the service clock (cache expiry) forward. */
export async function advanceStoresClock(ms: number): Promise<void> {
  await storesCall("/advance-clock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ms }),
  });
}

/** Pause (true) or resume (false) the service clock every app sees. */
export async function pauseStoresClock(paused: boolean): Promise<void> {
  await storesCall("/clock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paused }),
  });
}

/** One stored value (base64 bytes, cut to the first 4 KB; lists to 200 items). */
type StoredBytes = { size: number; value: string; truncated: boolean };
export type StoredValue =
  | ({ type: "string"; expiresAt?: number } & StoredBytes)
  | { type: "zset"; count: number; members: (StoredBytes & { score: number })[] }
  | { type: "bloom"; count: number; items: string[] };

/** A cache entry (`dc`) or Edge KV key (`store`); null if it is gone. */
export async function getStoredValue(where: { dc: string } | { store: string }, key: string): Promise<StoredValue | null> {
  const params = new URLSearchParams({ ...where, key });
  return (await storesCall(`/value?${params}`)).value;
}

// ── Storage Explorer (/api/storage/*): works with or without an app loaded ──────────────────

/** A stored value as in fixture files: UTF-8 text, or { base64 }. */
export type FixtureValue = string | { base64: string };

/** What the cache (one dc) and Edge KV hold (as StoresSnapshot, without the app fields). */
export type ExplorerSnapshot = Omit<Extract<StoresSnapshot, { enabled: true }>, "enabled" | "appDc"> & {
  /** The loaded app's cache bucket (the default dc), or null with no app (or stores off). */
  appDc: string | null;
};

/** One Edge KV key: a string, a sorted set ([member, score]) or a bloom filter's items. */
export type KvKeyInput =
  | { type: "string"; value: FixtureValue }
  | { type: "zset"; members: [FixtureValue, number][] }
  | { type: "bloom"; items: string[] };

/** A change Save to fixtures would make to one fixture file. */
export type FixtureChange = {
  store: string;
  file: string;
  status: "new" | "changed" | "deleted";
  current: string | null;
  proposed: string | null;
  hash: string;
};

async function storageCall(path: string, body?: unknown): Promise<any> {
  const response = await apiFetch(
    `${API_BASE}/storage${path}`,
    body === undefined
      ? undefined
      : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );
  const result = await response.json();
  if (!response.ok || !result.ok) {
    const error = typeof result.error === "string" ? result.error : JSON.stringify(result.error);
    throw new Error(error || `Storage request failed (${response.status})`);
  }
  return result;
}

export const storage = {
  /** dc null = the loaded app's (or local). */
  snapshot: (dc: string | null): Promise<ExplorerSnapshot> => storageCall(dc ? `?dc=${encodeURIComponent(dc)}` : ""),
  value: async (where: { dc: string } | { store: string }, key: string): Promise<StoredValue | null> =>
    (await storageCall(`/value?${new URLSearchParams({ ...where, key })}`)).value,
  putKv: (store: string, key: string, input: KvKeyInput) => storageCall("/kv/put", { store, key, ...input }),
  deleteKv: (store: string, key: string) => storageCall("/kv/delete", { store, key }),
  createStore: (store: string) => storageCall("/kv/store", { store }),
  deleteStore: (store: string) => storageCall("/kv/store/delete", { store }),
  importKv: async (store: string, data: Record<string, unknown>, replace: boolean): Promise<number> =>
    (await storageCall("/import", { store, data, replace })).keys,
  putCache: (dc: string, key: string, value: FixtureValue, ttlMs?: number) => storageCall("/cache/put", { dc, key, value, ttlMs }),
  expireCache: async (dc: string, key: string, ttlMs: number): Promise<boolean> =>
    (await storageCall("/cache/expire", { dc, key, ttlMs })).updated,
  deleteCache: (dc: string, key: string) => storageCall("/cache/delete", { dc, key }),
  reset: () => storageCall("/reset", {}),
  advanceClock: (ms: number) => storageCall("/advance-clock", { ms }),
  pauseClock: (paused: boolean) => storageCall("/clock", { paused }),
  fixturesDiff: async (): Promise<{ root: string; changes: FixtureChange[] }> => storageCall("/fixtures/diff"),
  saveFixtures: async (files: { file: string; hash: string }[]): Promise<string[]> =>
    (await storageCall("/fixtures/save", { files })).saved,
};

// ── Resource (several apps, one per hook, as on a CDN resource) ──

export const CDN_HOOKS = ["onRequestHeaders", "onRequestBody", "onResponseHeaders", "onResponseBody"] as const;
export type CdnHook = (typeof CDN_HOOKS)[number];
export type HookApp = string | { app: string; interruptOnError?: boolean };
export type ResourceHooks = Partial<Record<CdnHook, HookApp>>;
export type ResourceOrigin = { url: string } | { app: string };
export type ResourceApp = { config?: string; wasm?: string; dotenv?: { enabled?: boolean; path?: string } };
export type ResourceRule = { name?: string; match: string; hooks?: ResourceHooks; origin?: ResourceOrigin };
/** A resource file as written; fields the page does not edit (client, edge, properties…) are kept. */
export type ResourceConfig = {
  apps: Record<string, ResourceApp>;
  main: { hooks?: ResourceHooks; origin: ResourceOrigin };
  rules?: ResourceRule[];
  request?: { method?: string; url: string; headers?: Record<string, string>; body?: string };
  [field: string]: unknown;
};
export type ResourceLoaded = { configPath?: string | null; apps: { name: string; wasmType: "proxy-wasm" | "http-wasm" }[] };
export type ResourceHookResult = {
  returnCode: number | null;
  logs: { level: number; message: string }[];
  input: { request: { headers: Record<string, string | string[]>; body: string }; response: { headers: Record<string, string | string[]>; body: string } };
  output: { request: { headers: Record<string, string | string[]>; body: string }; response: { headers: Record<string, string | string[]>; body: string } };
  storeCalls?: StoreCall[];
  localResponse?: { status: number };
  customProperties?: string[];
};
export type ResourceResult = {
  rule: { index: number; name?: string; match: string } | null;
  hooks: Partial<Record<CdnHook, { app: string; result: ResourceHookResult }>>;
  origin?: { kind: "url" | "built-in" | "app"; app?: string; response: { status: number; statusText?: string; headers: Record<string, string | string[]>; body: string }; storeCalls?: StoreCall[] };
  finalResponse: { status: number; statusText: string; headers: Record<string, string | string[]>; body: string; contentType: string; isBase64?: boolean };
};

async function resourceCall(path: string, body?: unknown): Promise<any> {
  const response = await apiFetch(
    `${API_BASE}${path}`,
    body === undefined
      ? undefined
      : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );
  const result = await response.json();
  if (!response.ok || !result.ok) {
    const error = typeof result.error === "string" ? result.error : JSON.stringify(result.error);
    throw new Error(error || `Request failed (${response.status})`);
  }
  return result;
}

/** Suggestions for the Resource page's path fields; paths are relative to `root` (the workspace). */
export interface WorkspaceFiles {
  root: string;
  wasm: string[];
  configs: string[];
  dotenvDirs: string[];
  truncated: boolean;
}

export const resource = {
  /** The file as written (null = no file yet) and its full path. */
  read: async (configPath: string): Promise<{ path: string; config: ResourceConfig | null }> =>
    resourceCall(`/resource/config?path=${encodeURIComponent(configPath)}`),
  save: async (configPath: string, config: ResourceConfig): Promise<string> =>
    (await resourceCall("/resource/save", { configPath, config })).path,
  /** Loads the file (replacing the debugger's app); the websocket's resource_loaded follows. */
  load: async (configPath: string): Promise<ResourceLoaded> => resourceCall("/resource/load", { configPath }),
  send: async (request: { url: string; method: string; headers: Record<string, string>; body: string }): Promise<ResourceResult> =>
    resourceCall("/send", { url: request.url, request: { method: request.method, headers: request.headers, body: request.body } }),
  files: async (): Promise<WorkspaceFiles> => resourceCall("/workspace/files"),
};
