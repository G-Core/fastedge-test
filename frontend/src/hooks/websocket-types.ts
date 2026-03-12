/**
 * WebSocket Event Types (Frontend)
 *
 * Mirror of backend event types for type safety
 */

export type EventSource = "ui" | "ai_agent" | "api" | "system";

export interface BaseEvent {
  type: string;
  timestamp: number;
  source: EventSource;
}

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

export interface RequestStartedEvent extends BaseEvent {
  type: "request_started";
  data: {
    url: string;
    method: string;
    headers: Record<string, string>;
  };
}

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

export interface RequestFailedEvent extends BaseEvent {
  type: "request_failed";
  data: {
    error: string;
    details?: string;
  };
}

export interface PropertiesUpdatedEvent extends BaseEvent {
  type: "properties_updated";
  data: {
    properties: Record<string, string>;
  };
}

export interface ConnectionStatusEvent extends BaseEvent {
  type: "connection_status";
  data: {
    connected: boolean;
    clientCount: number;
  };
}

export interface HttpWasmRequestCompletedEvent extends BaseEvent {
  type: "http_wasm_request_completed";
  data: {
    response: {
      status: number;
      statusText: string;
      headers: Record<string, string>;
      body: string;
      contentType: string;
      isBase64?: boolean;
    };
  };
}

export interface HttpWasmLogEvent extends BaseEvent {
  type: "http_wasm_log";
  data: {
    level: number;
    message: string;
  };
}

export interface ReloadWorkspaceWasmEvent extends BaseEvent {
  type: "reload_workspace_wasm";
  data: {
    path: string;
  };
}

export type ServerEvent =
  | WasmLoadedEvent
  | RequestStartedEvent
  | HookExecutedEvent
  | RequestCompletedEvent
  | RequestFailedEvent
  | PropertiesUpdatedEvent
  | ConnectionStatusEvent
  | HttpWasmRequestCompletedEvent
  | HttpWasmLogEvent
  | ReloadWorkspaceWasmEvent;
