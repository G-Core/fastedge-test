import type { StoreCall } from "../stores/trace.js";
import type { ResourceResult } from "../runner/resource.js";
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
    headers: Record<string, string | string[]>;
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
      request: { headers: Record<string, string | string[]>; body: string };
      response: { headers: Record<string, string | string[]>; body: string };
    };
    output: {
      request: { headers: Record<string, string | string[]>; body: string };
      response: { headers: Record<string, string | string[]>; body: string };
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
      headers: Record<string, string | string[]>;
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
      // Mirrors Node's IncomingHttpHeaders — undefined values are dropped by JSON serialization.
      headers: Record<string, string | string[] | undefined>;
      body: string;
      storeCalls?: StoreCall[];
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
 * Resource loaded (several apps, one per hook)
 */
export interface ResourceLoadedEvent extends BaseEvent {
  type: "resource_loaded";
  data: {
    /** The config file, when loaded from one. */
    configPath?: string | null;
    apps: { name: string; wasmType: "proxy-wasm" | "http-wasm" }[];
  };
}

/**
 * Loading a resource file failed (a config, path or build problem): the file and the error, so a
 * page can show the file with the error instead of staying on the previous view.
 */
export interface ResourceLoadFailedEvent extends BaseEvent {
  type: "resource_load_failed";
  data: { configPath: string; error: string };
}

/**
 * The user approved reading an allowed folder (outside the workspace) for this session. The page
 * lists these folders so reads from outside the workspace are visible.
 */
export interface AllowedFolderApprovedEvent extends BaseEvent {
  type: "allowed_folder_approved";
  data: { folder: string };
}

/**
 * A resource file was saved through the API (the page, an agent): its full path and version, so
 * a page showing that file can reload it (or warn about its own unsaved edits).
 */
export interface ResourceSavedEvent extends BaseEvent {
  type: "resource_saved";
  data: { configPath: string; version: string };
}

/**
 * Resource request completed: the rule that matched, each hook's app and result, the origin
 */
export interface ResourceRequestCompletedEvent extends BaseEvent {
  type: "resource_request_completed";
  data: { result: ResourceResult };
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
  | ReloadWorkspaceWasmEvent
  | ResourceLoadedEvent
  | ResourceSavedEvent
  | ResourceLoadFailedEvent
  | AllowedFolderApprovedEvent
  | ResourceRequestCompletedEvent;

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
