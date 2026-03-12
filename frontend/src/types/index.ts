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

export interface HookResult {
  logs: LogEntry[];
  returnValue?: number;
  error?: string;
  input?: {
    request: {
      headers: Record<string, string>;
      body: string;
    };
    response: {
      headers: Record<string, string>;
      body: string;
    };
  };
  output?: {
    request: {
      headers: Record<string, string>;
      body: string;
    };
    response: {
      headers: Record<string, string>;
      body: string;
    };
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
  headers: Record<string, string>;
  body: string;
  contentType: string;
  isBase64?: boolean;
}
