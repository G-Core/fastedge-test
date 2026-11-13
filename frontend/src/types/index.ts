export type { WebSocketStatus } from "../hooks/useWebSocket";

export interface HookCall {
  request_headers?: Record<string, string>;
  request_body?: string;
  request_trailers?: Record<string, string>;
  response_headers?: Record<string, string>;
  response_body?: string;
  response_trailers?: Record<string, string>;
  properties?: Record<string, string>;
  logLevel?: number;
}

export interface LogEntry {
  level: number;
  message: string;
}

/** One cache / Edge KV call a hook made (server/stores/trace.ts). Values are not recorded. */
export interface StoreCall {
  app: "cdn" | "http";
  hook?: string;
  kind: "cache" | "kv";
  op: string;
  dc?: string;
  store?: string;
  key?: string;
  pattern?: string;
  prefix?: string;
  result: string;
  value?: string;
  at: number;
}

export interface HookResult {
  logs: LogEntry[];
  /** Present when stores are on. */
  storeCalls?: StoreCall[];
  returnValue?: number;
  error?: string;
  input?: {
    request: {
      headers: Record<string, string | string[]>;
      body: string;
    };
    response: {
      headers: Record<string, string | string[]>;
      body: string;
    };
    properties?: Record<string, unknown>;
  };
  output?: {
    request: {
      headers: Record<string, string | string[]>;
      body: string;
    };
    response: {
      headers: Record<string, string | string[]>;
      body: string;
    };
    properties?: Record<string, unknown>;
  };
  properties?: Record<string, unknown>;
}

export interface WasmState {
  wasmPath: string | null;
  wasmBuffer: ArrayBuffer | null;
  wasmFile: File | null;
}

export interface FinalResponse {
  status: number;
  statusText: string;
  // Multi-valued headers (e.g. set-cookie) arrive as string[].
  headers: Record<string, string | string[]>;
  body: string;
  contentType: string;
  isBase64?: boolean;
}
