/**
 * NullStateManager
 *
 * No-op implementation of IStateManager for headless/standalone use.
 * Runners use this when running without a WebSocket server.
 */

import type { IStateManager } from "./IStateManager.js";

export class NullStateManager implements IStateManager {
  emitRequestStarted(): void {}
  emitHookExecuted(): void {}
  emitRequestCompleted(): void {}
  emitRequestFailed(): void {}
  emitWasmLoaded(): void {}
  emitPropertiesUpdated(): void {}
  emitHttpWasmRequestCompleted(): void {}
  emitHttpWasmLog(): void {}
  emitReloadWorkspaceWasm(): void {}
}
