export type HeaderMap = Record<string, string>;
export type HeaderTuples = [string, string][];

// Wire/projection format for hook and full-flow results.
// Single-valued headers are a string; multi-valued (e.g. set-cookie) are a string[].
// Matches Node's IncomingHttpHeaders shape for consumers that read these fields.
export type HeaderRecord = Record<string, string | string[]>;

export type HookCall = {
  hook: string;
  request: {
    headers: HeaderRecord;
    body: string;
    method?: string;
    path?: string;
    scheme?: string;
  };
  /**
   * Seed state for the response hooks (`onResponseHeaders` / `onResponseBody`)
   * when calling them in isolation via `callHook()`. The full-flow path
   * (`callFullFlow`) generates the upstream response at runtime and does not
   * consume this field — request hooks ignore it, and response hooks are
   * called with the response built from the live origin fetch or built-in
   * responder output.
   */
  response?: {
    headers: HeaderRecord;
    body: string;
    status?: number;
    statusText?: string;
  };
  properties: Record<string, unknown>;
  dotenvEnabled?: boolean;
  enforceProductionPropertyRules?: boolean; // Default: true - Enforce property access control rules
};

export type HookResult = {
  returnCode: number | null;
  logs: { level: number; message: string }[];
  input: {
    request: { headers: HeaderRecord; body: string };
    response: { headers: HeaderRecord; body: string };
    properties?: Record<string, unknown>;
  };
  output: {
    request: { headers: HeaderRecord; body: string };
    response: { headers: HeaderRecord; body: string };
    properties?: Record<string, unknown>;
  };
  properties: Record<string, unknown>;
};

export enum ProxyStatus {
  Ok = 0,
  NotFound = 1,
  BadArgument = 2,
}

export enum BufferType {
  RequestBody = 0,
  ResponseBody = 1,
  HttpCallResponseBody = 4,
  VmConfiguration = 6,
  PluginConfiguration = 7,
}

export enum MapType {
  RequestHeaders = 0,
  RequestTrailers = 1,
  ResponseHeaders = 2,
  ResponseTrailers = 3,
  HttpCallResponseHeaders = 6,
  HttpCallResponseTrailers = 7,
}

export type LogEntry = {
  level: number;
  message: string;
};

export type FullFlowResult = {
  hookResults: Record<string, HookResult>;
  finalResponse: {
    status: number;
    statusText: string;
    headers: HeaderRecord;
    body: string;
    contentType: string;
    isBase64?: boolean;
  };
  calculatedProperties?: Record<string, unknown>;
};
