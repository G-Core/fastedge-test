/**
 * @gcoredev/fastedge-test — Runner public API
 *
 * Entry point for headless programmatic use of the WASM runner.
 * Import via the package root: import { createRunner } from '@gcoredev/fastedge-test'
 */

export { ProxyWasmRunner } from "./ProxyWasmRunner.js";
export { HttpWasmRunner } from "./HttpWasmRunner.js";
export { WasmRunnerFactory } from "./WasmRunnerFactory.js";
export { NullStateManager } from "./NullStateManager.js";
export { createRunner, createRunnerFromBuffer } from "./standalone.js";

export type { IWasmRunner, WasmType, RunnerConfig, HttpRequest, HttpResponse } from "./IWasmRunner.js";
export type { IStateManager } from "./IStateManager.js";
export type { HookResult, FullFlowResult, HookCall } from "./types.js";
