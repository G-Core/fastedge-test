/**
 * Standalone headless runner factory
 *
 * Creates a fully loaded WASM runner without needing a server or WebSocket connection.
 * Detects the WASM type automatically, or uses runnerConfig.runnerType to override detection.
 *
 * Usage:
 *   import { createRunner } from './server/runner/standalone.js';
 *   const runner = await createRunner('./path/to/wasm.wasm');
 *   const result = await runner.callFullFlow('https://example.com', 'GET', {}, '', {}, '', 200, 'OK', {}, true);
 */

import { readFile } from "fs/promises";
import type { IWasmRunner, RunnerConfig } from "./IWasmRunner.js";
import { ProxyWasmRunner } from "./ProxyWasmRunner.js";
import { HttpWasmRunner } from "./HttpWasmRunner.js";
import { PortManager } from "./PortManager.js";
import { detectWasmType } from "../utils/wasmTypeDetector.js";

/**
 * Create a headless runner from a file path.
 * Detects the WASM type automatically.
 */
export async function createRunner(
  wasmPath: string,
  config?: RunnerConfig,
): Promise<IWasmRunner> {
  const buffer = await readFile(wasmPath);
  return createRunnerFromBuffer(buffer, config);
}

/**
 * Create a headless runner from an in-memory buffer.
 * Detects the WASM type automatically.
 */
export async function createRunnerFromBuffer(
  buffer: Buffer,
  config?: RunnerConfig,
): Promise<IWasmRunner> {
  const wasmType = config?.runnerType ?? await detectWasmType(buffer);

  let runner: IWasmRunner;
  if (wasmType === "http-wasm") {
    runner = new HttpWasmRunner(new PortManager(), config?.dotenv?.enabled ?? false);
  } else {
    runner = new ProxyWasmRunner(undefined, config?.dotenv?.enabled ?? false);
  }

  await runner.load(buffer, config);
  return runner;
}
