export type HeaderMap = Record<string, string>;

export type HookCall = {
  hook: string;
  request: {
    headers: HeaderMap;
    body: string;
    method?: string;
    path?: string;
    scheme?: string;
  };
  response: {
    headers: HeaderMap;
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
    request: { headers: HeaderMap; body: string };
    response: { headers: HeaderMap; body: string };
    properties?: Record<string, unknown>;
  };
  output: {
    request: { headers: HeaderMap; body: string };
    response: { headers: HeaderMap; body: string };
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
    headers: HeaderMap;
    body: string;
    contentType: string;
    isBase64?: boolean;
  };
  calculatedProperties?: Record<string, unknown>;
};
