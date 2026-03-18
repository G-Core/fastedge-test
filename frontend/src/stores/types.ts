import type { HookResult, FinalResponse, WebSocketStatus } from '../types';

// ============================================================================
// STORE SLICE STATE INTERFACES
// ============================================================================

// Request Store
export interface RequestState {
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody: string;
  responseHeaders: Record<string, string>;
  responseBody: string;
}

export interface RequestActions {
  setMethod: (method: string) => void;
  setUrl: (url: string) => void;
  setRequestHeaders: (headers: Record<string, string>) => void;
  setRequestBody: (body: string) => void;
  setResponseHeaders: (headers: Record<string, string>) => void;
  setResponseBody: (body: string) => void;
  updateRequestHeader: (key: string, value: string) => void;
  removeRequestHeader: (key: string) => void;
  updateResponseHeader: (key: string, value: string) => void;
  removeResponseHeader: (key: string) => void;
  resetRequest: () => void;
}

export type RequestSlice = RequestState & RequestActions;

// WASM Store
export interface WasmState {
  wasmPath: string | null;
  wasmBuffer: ArrayBuffer | null;
  wasmFile: File | null;
  wasmType: 'proxy-wasm' | 'http-wasm' | null;
  loading: boolean;
  error: string | null;
  // Loading metadata
  loadingMode: 'path' | 'buffer' | null;
  loadTime: number | null; // Load time in milliseconds
  fileSize: number | null; // File size in bytes
}

export interface WasmActions {
  loadWasm: (fileOrPath: File | string, dotenvEnabled: boolean, dotenvPath?: string | null) => Promise<void>;
  reloadWasm: (dotenvEnabled: boolean, dotenvPath?: string | null) => Promise<void>;
  clearWasm: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setWasmLoaded: (filename: string, wasmType: WasmState['wasmType'], fileSize: number) => void;
}

export type WasmSlice = WasmState & WasmActions;

// Results Store
export interface ResultsState {
  hookResults: Record<string, HookResult>;
  finalResponse: FinalResponse | null;
  isExecuting: boolean;
}

export interface ResultsActions {
  setHookResult: (hook: string, result: HookResult) => void;
  setHookResults: (results: Record<string, HookResult>) => void;
  setFinalResponse: (response: FinalResponse | null) => void;
  setIsExecuting: (executing: boolean) => void;
  clearResults: () => void;
}

export type ResultsSlice = ResultsState & ResultsActions;

// Config Store
export interface ConfigState {
  properties: Record<string, string>;
  dotenv: {
    enabled: boolean;
    path: string | null;
  };
  logLevel: number;
}

export interface ConfigActions {
  setProperties: (properties: Record<string, string>) => void;
  updateProperty: (key: string, value: string) => void;
  removeProperty: (key: string) => void;
  mergeProperties: (properties: Record<string, string>) => void;
  setDotenvEnabled: (enabled: boolean) => Promise<void>;
  setDotenvPath: (path: string | null) => Promise<void>;
  setLogLevel: (level: number) => void;
  loadFromConfig: (config: TestConfig) => void;
  exportConfig: () => TestConfig;
  resetConfig: () => void;
}

export type ConfigSlice = ConfigState & ConfigActions;

// UI Store
export interface UIState {
  activeHookTab: string;
  activeSubView: 'logs' | 'inputs' | 'outputs';
  expandedPanels: Record<string, boolean>;
  wsStatus: WebSocketStatus;
}

export interface UIActions {
  setActiveHookTab: (tab: string) => void;
  setActiveSubView: (view: 'logs' | 'inputs' | 'outputs') => void;
  togglePanel: (panel: string) => void;
  setWsStatus: (status: WebSocketStatus) => void;
}

export type UISlice = UIState & UIActions;

// HTTP WASM Store
export interface HttpWasmState {
  // Request state
  httpMethod: string;
  httpUrl: string;  // Full URL, but host prefix (http://test.localhost/) is fixed
  httpRequestHeaders: Record<string, string>;
  httpRequestBody: string;

  // Response state
  httpResponse: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
    contentType: string;
    isBase64?: boolean;
  } | null;

  // Logs
  httpLogs: Array<{ level: number; message: string }>;

  // Execution state
  httpIsExecuting: boolean;

  // Port of the active fastedge-run HTTP server (null when no HTTP WASM loaded)
  httpRunnerPort: number | null;
}

export interface HttpWasmActions {
  setHttpMethod: (method: string) => void;
  setHttpUrl: (url: string) => void;  // Full URL (host prefix is enforced)
  setHttpRequestHeaders: (headers: Record<string, string>) => void;
  setHttpRequestBody: (body: string) => void;
  setHttpResponse: (response: HttpWasmState['httpResponse']) => void;
  setHttpLogs: (logs: Array<{ level: number; message: string }>) => void;
  appendHttpLogs: (logs: Array<{ level: number; message: string }>) => void;
  setHttpIsExecuting: (isExecuting: boolean) => void;
  setHttpRunnerPort: (port: number | null) => void;
  executeHttpRequest: () => Promise<void>;
  clearHttpResponse: () => void;
  resetHttpWasm: () => void;
}

export type HttpWasmSlice = HttpWasmState & HttpWasmActions;

// ============================================================================
// COMBINED APP STORE
// ============================================================================

export type AppStore = RequestSlice & WasmSlice & ResultsSlice & ConfigSlice & UISlice & HttpWasmSlice;

// ============================================================================
// UTILITY TYPES
// ============================================================================

export interface TestConfig {
  appType?: 'proxy-wasm' | 'http-wasm';
  description?: string;
  wasm?: {
    path: string;
    description?: string;
  };
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body: string;
  };
  response?: {
    headers: Record<string, string>;
    body: string;
  };
  properties: Record<string, string>;
  logLevel: number;
  dotenv?: {
    enabled?: boolean;
    path?: string;
  };
}

export interface PersistConfig {
  request: RequestState;
  config: ConfigState;
  ui: Pick<UIState, 'expandedPanels'>;
}
