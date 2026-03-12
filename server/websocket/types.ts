/**
 * WebSocket Event Types
 *
 * Defines all events that can flow between server and clients
 */

export type EventSource = "ui" | "ai_agent" | "api" | "system";

/**
 * Base event structure
 */
export interface BaseEvent {
  type: string;
  timestamp: number;
  source: EventSource;
}

/**
 * WASM binary loaded
 */
export interface WasmLoadedEvent extends BaseEvent {
  type: "wasm_loaded";
  data: {
    filename: string;
    size: number;
    runnerPort?: number | null;
    wasmType: "proxy-wasm" | "http-wasm";
    resolvedPath?: string | null;
  };
}

/**
 * Request execution started
 */
export interface RequestStartedEvent extends BaseEvent {
  type: "request_started";
  data: {
    url: string;
    method: string;
    headers: Record<string, string>;
  };
}

/**
 * Individual hook executed
 */
export interface HookExecutedEvent extends BaseEvent {
  type: "hook_executed";
  data: {
    hook: string;
    returnCode: number | null;
    logCount: number;
    input: {
      request: { headers: Record<string, string>; body: string };
      response: { headers: Record<string, string>; body: string };
    };
    output: {
      request: { headers: Record<string, string>; body: string };
      response: { headers: Record<string, string>; body: string };
    };
  };
}

/**
 * Request execution completed
 */
export interface RequestCompletedEvent extends BaseEvent {
  type: "request_completed";
  data: {
    hookResults: Record<string, any>;
    finalResponse: {
      status: number;
      statusText: string;
      headers: Record<string, string>;
      body: string;
      contentType: string;
      isBase64?: boolean;
    };
    calculatedProperties?: Record<string, unknown>;
  };
}

/**
 * Request execution failed
 */
export interface RequestFailedEvent extends BaseEvent {
  type: "request_failed";
  data: {
    error: string;
    details?: string;
  };
}

/**
 * Properties updated
 */
export interface PropertiesUpdatedEvent extends BaseEvent {
  type: "properties_updated";
  data: {
    properties: Record<string, string>;
  };
}

/**
 * HTTP WASM request completed
 */
export interface HttpWasmRequestCompletedEvent extends BaseEvent {
  type: "http_wasm_request_completed";
  data: {
    response: {
      status: number;
      statusText: string;
      headers: Record<string, string>;
      body: string;
      contentType: string | null;
      isBase64?: boolean;
    };
  };
}

/**
 * HTTP WASM log line emitted (streamed in real-time for both execute and live mode)
 */
export interface HttpWasmLogEvent extends BaseEvent {
  type: "http_wasm_log";
  data: {
    level: number;
    message: string;
  };
}

/**
 * Connection status
 */
export interface ConnectionStatusEvent extends BaseEvent {
  type: "connection_status";
  data: {
    connected: boolean;
    clientCount: number;
  };
}

/**
 * Reload workspace WASM (VSCode only)
 * Triggered by VSCode extension after F5 rebuild
 */
export interface ReloadWorkspaceWasmEvent extends BaseEvent {
  type: "reload_workspace_wasm";
  data: {
    path: string;
  };
}

/**
 * Union of all possible events
 */
export type ServerEvent =
  | WasmLoadedEvent
  | RequestStartedEvent
  | HookExecutedEvent
  | RequestCompletedEvent
  | RequestFailedEvent
  | PropertiesUpdatedEvent
  | HttpWasmRequestCompletedEvent
  | HttpWasmLogEvent
  | ConnectionStatusEvent
  | ReloadWorkspaceWasmEvent;

/**
 * Helper to create events with automatic timestamp
 */
export function createEvent<T extends ServerEvent>(
  type: T["type"],
  source: EventSource,
  data: T["data"],
): T {
  return {
    type,
    timestamp: Date.now(),
    source,
    data,
  } as T;
}
