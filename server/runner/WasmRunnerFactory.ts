/**
 * WASM Runner Factory
 *
 * Creates the appropriate runner based on WASM type
 */

import type { IWasmRunner, WasmType } from "./IWasmRunner.js";
import { WorkerProxyWasmRunner, type RunnerStores } from "./WorkerProxyWasmRunner.js";
import { HttpWasmRunner } from "./HttpWasmRunner.js";
import { PortManager } from "./PortManager.js";

export class WasmRunnerFactory {
  private portManager: PortManager;

  constructor() {
    this.portManager = new PortManager();
  }

  /**
   * Create a runner for the specified WASM type
   * @param wasmType The type of WASM binary
   * @param dotenvEnabled Whether to enable dotenv file loading
   * @param stores Storage service connection for CDN apps (null = stores off)
   * @returns The appropriate runner instance
   */
  createRunner(wasmType: WasmType, dotenvEnabled: boolean = true, stores: RunnerStores | null = null): IWasmRunner {
    if (wasmType === "http-wasm") {
      return new HttpWasmRunner(this.portManager, dotenvEnabled);
    } else if (wasmType === "proxy-wasm") {
      return new WorkerProxyWasmRunner(undefined, dotenvEnabled, stores);
    } else {
      throw new Error(`Unknown WASM type: ${wasmType}`);
    }
  }

  /**
   * Get the port manager instance (for monitoring/debugging)
   */
  getPortManager(): PortManager {
    return this.portManager;
  }
}
