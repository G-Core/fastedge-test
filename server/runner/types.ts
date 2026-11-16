import type { RequestContext } from "./requestContext.js";
import type { StoreCall } from "../stores/trace.js";
export type HeaderMap = Record<string, string>;
export type HeaderTuples = [string, string][];

// Wire/projection format for hook and full-flow results.
// Single-valued headers are a string; multi-valued (e.g. set-cookie) are a string[].
// Matches Node's IncomingHttpHeaders shape for consumers that read these fields.
export type HeaderRecord = Record<string, string | string[]>;

export type HookCall = {
  hook: string;
  /** Client and edge for this call only (see `RunnerConfig.client` / `.edge`); default: the runner's. */
  context?: RequestContext;
  request: {
    headers: HeaderRecord;
    body: string;
    /** `body` is base64 of raw bytes (a body that is not text, e.g. an image). */
    isBase64?: boolean;
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
    /** `body` is base64 of raw bytes. */
    isBase64?: boolean;
    status?: number;
    statusText?: string;
  };
  properties: Record<string, unknown>;
  enforceProductionPropertyRules?: boolean; // Default: true - Enforce property access control rules
  /**
   * Custom properties an earlier hook of this request wrote (and later hooks may read), when the
   * hooks run on different apps: on the edge custom properties belong to the request, not the app.
   */
  customProperties?: string[];
  /**
   * Set when this call is one hook of a flow driven from outside the runner (a resource): the
   * request id shared by the flow's hooks; `request` and `properties` already carry `context`.
   */
  requestId?: string;
};

/** A response a hook sent with send_http_response. */
export type LocalResponse = {
  statusCode: number;
  statusText: string;
  /** The additional headers passed as send_http_response's 4th argument. */
  headers: HeaderTuples;
  bodyBase64: string;
};

/** Headers and body of the request or response; `isBase64`: the body is base64 of raw bytes (not text). */
export type HookBody = { headers: HeaderRecord; body: string; isBase64?: boolean };

export type HookResult = {
  returnCode: number | null;
  logs: { level: number; message: string }[];
  input: {
    request: HookBody;
    response: HookBody;
    properties?: Record<string, unknown>;
  };
  output: {
    request: HookBody;
    response: HookBody;
    properties?: Record<string, unknown>;
  };
  properties: Record<string, unknown>;
  /** The cache / Edge KV calls this hook made, in order (stores on only). */
  storeCalls?: StoreCall[];
  /** Set when the hook answered with send_http_response. */
  localResponse?: LocalResponse;
  /** Custom properties later hooks of this request may read (see `HookCall.customProperties`). */
  customProperties?: string[];
};

export enum ProxyStatus {
  Ok = 0,
  NotFound = 1,
  BadArgument = 2,
  InternalFailure = 10,
  Unimplemented = 12,
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
