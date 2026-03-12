/**
 * IStateManager
 *
 * Interface for state manager implementations.
 * Allows runners to work with either the real StateManager (server mode)
 * or NullStateManager (headless/standalone mode) without a WebSocket dependency.
 */

export type EventSource = "ui" | "ai_agent" | "api" | "system";

export interface IStateManager {
  emitRequestStarted(
    url: string,
    method: string,
    headers: Record<string, string>,
    source?: EventSource,
  ): void;

  emitHookExecuted(
    hook: string,
    returnCode: number | null,
    logCount: number,
    input: {
      request: { headers: Record<string, string>; body: string };
      response: { headers: Record<string, string>; body: string };
    },
    output: {
      request: { headers: Record<string, string>; body: string };
      response: { headers: Record<string, string>; body: string };
    },
    source?: EventSource,
  ): void;

  emitRequestCompleted(
    hookResults: Record<string, unknown>,
    finalResponse: {
      status: number;
      statusText: string;
      headers: Record<string, string>;
      body: string;
      contentType: string;
      isBase64?: boolean;
    },
    calculatedProperties?: Record<string, unknown>,
    source?: EventSource,
  ): void;

  emitRequestFailed(
    error: string,
    details?: string,
    source?: EventSource,
  ): void;

  emitWasmLoaded(
    filename: string,
    size: number,
    source?: EventSource,
  ): void;

  emitPropertiesUpdated(
    properties: Record<string, string>,
    source?: EventSource,
  ): void;

  emitHttpWasmRequestCompleted(
    response: {
      status: number;
      statusText: string;
      headers: Record<string, string>;
      body: string;
      contentType: string | null;
      isBase64?: boolean;
    },
    source?: EventSource,
  ): void;

  emitHttpWasmLog(
    log: { level: number; message: string },
    source?: EventSource,
  ): void;

  emitReloadWorkspaceWasm(path: string, source?: EventSource): void;
}
