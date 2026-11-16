/**
 * @gcoredev/fastedge-test — Runner public API
 *
 * Entry point for headless programmatic use of the WASM runner.
 * Import via the package root: import { createRunner } from '@gcoredev/fastedge-test'
 */

export { ProxyWasmRunner, BUILTIN_URL, BUILTIN_SHORTHAND } from "./ProxyWasmRunner.js";
export { HttpWasmRunner } from "./HttpWasmRunner.js";
export { WasmRunnerFactory } from "./WasmRunnerFactory.js";
export { NullStateManager } from "./NullStateManager.js";
export { createRunner, createRunnerFromBuffer } from "./standalone.js";
export { createResource, matchRule, DEFAULT_RESOURCE_FILE } from "./resource.js";
export type { Resource, ResourceRequest, ResourceResult, CreateResourceOptions } from "./resource.js";
export type { OriginResponse, CdnHook } from "./cdnFlow.js";

export type { IWasmRunner, WasmType, RunnerConfig, HttpRequest, HttpResponse } from "./IWasmRunner.js";
export type { IStateManager } from "./IStateManager.js";
export type { HookResult, FullFlowResult, HookCall, LocalResponse } from "./types.js";
export type { StoreCall } from "../stores/trace.js";
export { createStores } from "../stores/testStores.js";
export type { TestStores, CreateStoresOptions } from "../stores/testStores.js";
export type { StoresSeed } from "../stores/fixtures.js";
export { CLIENT_PRESETS, EDGE_PRESETS } from "./requestContext.js";
export type { ClientContext, EdgeContext, RequestContext, Preset } from "./requestContext.js";
