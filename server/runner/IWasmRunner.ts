/**
 * Base interface for WASM runners
 *
 * Defines the common contract for both ProxyWasmRunner and HttpWasmRunner
 */

import type { IStateManager } from "./IStateManager.js";
import type { HookCall, HookResult, FullFlowResult } from "./types.js";

export type WasmType = "http-wasm" | "proxy-wasm";

export interface RunnerConfig {
  dotenvEnabled?: boolean;
  /** Directory path to load dotenv files from. Passes --dotenv <path> to fastedge-run.
   *  When omitted, fastedge-run uses process CWD (correct for npm package users whose
   *  .env files live at their project root). Use this only when dotenv files are not in CWD,
   *  e.g. test fixture directories or non-standard project layouts. */
  dotenvPath?: string;
  enforceProductionPropertyRules?: boolean;
  /** Override automatic WASM type detection. Use when detection produces wrong results. */
  runnerType?: WasmType;
}

/**
 * HTTP Request type for HTTP WASM runner
 */
export interface HttpRequest {
  path: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

/**
 * HTTP Response type for HTTP WASM runner
 */
export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  contentType: string | null;
  isBase64?: boolean;
  logs: Array<{ level: number; message: string }>;
}

/**
 * Base interface that all WASM runners must implement
 */
export interface IWasmRunner {
  /**
   * Load WASM binary into the runner
   * @param bufferOrPath The WASM binary as a Buffer, or a file path string
   * @param config Optional configuration
   */
  load(bufferOrPath: Buffer | string, config?: RunnerConfig): Promise<void>;

  /**
   * Execute a request through the WASM module (HTTP WASM only)
   * @param request The HTTP request to execute
   * @returns The HTTP response
   */
  execute(request: HttpRequest): Promise<HttpResponse>;

  /**
   * Call a specific hook (Proxy-WASM only)
   * @param hookCall The hook call parameters
   * @returns The hook execution result
   */
  callHook(hookCall: HookCall): Promise<HookResult>;

  /**
   * Execute full request/response flow (Proxy-WASM only)
   * @param url Request URL
   * @param method HTTP method
   * @param headers Request headers
   * @param body Request body
   * @param responseHeaders Response headers
   * @param responseBody Response body
   * @param responseStatus Response status code
   * @param responseStatusText Response status text
   * @param properties Shared properties
   * @param enforceProductionPropertyRules Whether to enforce property access rules
   * @returns Full flow execution result
   */
  callFullFlow(
    url: string,
    method: string,
    headers: Record<string, string>,
    body: string,
    responseHeaders: Record<string, string>,
    responseBody: string,
    responseStatus: number,
    responseStatusText: string,
    properties: Record<string, unknown>,
    enforceProductionPropertyRules: boolean
  ): Promise<FullFlowResult>;

  /**
   * Apply dotenv settings to the current runner without reloading the WASM.
   * For ProxyWasmRunner: resets stores and re-loads dotenv files in-place.
   * For HttpWasmRunner: restarts the fastedge-run process with updated flags.
   * @param enabled Whether dotenv loading should be enabled
   * @param dotenvPath Optional directory to load dotenv files from
   */
  applyDotenv(enabled: boolean, dotenvPath?: string): Promise<void>;

  /**
   * Clean up resources (processes, temp files, etc.)
   */
  cleanup(): Promise<void>;

  /**
   * Get the type of WASM this runner handles
   */
  getType(): WasmType;

  /**
   * Set the state manager for event emission
   * @param stateManager The state manager instance
   */
  setStateManager(stateManager: IStateManager): void;
}
