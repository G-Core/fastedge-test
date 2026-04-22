/**
 * HTTP WASM Runner - Port Pinning Tests
 *
 * Covers RunnerConfig.httpPort: when set, the spawned fastedge-run process
 * listens on that exact port instead of the dynamic 8100-8199 pool. Load
 * fails fast if the port is already in use — there is no fallback to dynamic
 * allocation (pinning is for external port-forwarding / Codespaces / Docker
 * setups where a predictable address is the whole point).
 *
 * Port-pinning logic lives in the Node runner, not the WASM, so a single
 * variant (JS + hello-world) exercises all of it.
 */

import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { createServer, Server } from 'net';
import type { IWasmRunner } from '../../../../runner/IWasmRunner';
import { createHttpWasmRunner } from '../../utils/http-wasm-helpers';
import { runHttpRequest } from '../../../../test-framework/suite-runner';
import { assertHttpStatus } from '../../../../test-framework/assertions';
import { HTTP_APP_VARIANTS, resolveWasmPath, wasmExists } from '../shared/variants';

// Use ports well above the dynamic pool (8100-8199) to avoid collisions with
// other integration tests that allocate dynamically.
const PIN_OK_PORT = 8250;
const PIN_BUSY_PORT = 8251;

const jsVariant = HTTP_APP_VARIANTS.find(v => v.name === 'js')!;
const wasmPath = resolveWasmPath(jsVariant, 'hello-world');
const describeFn = wasmExists(jsVariant, 'hello-world') ? describe : describe.skip;

describeFn('HTTP WASM - httpPort pinning', () => {
  let runner: IWasmRunner | null = null;
  let preBoundServer: Server | null = null;

  beforeAll(async () => {
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  afterEach(async () => {
    if (runner) {
      await runner.cleanup();
      runner = null;
    }
    if (preBoundServer) {
      await new Promise<void>(resolve => preBoundServer!.close(() => resolve()));
      preBoundServer = null;
    }
  });

  it('uses the pinned port when httpPort is set and the port is free', async () => {
    runner = createHttpWasmRunner();
    await runner.load(wasmPath, { httpPort: PIN_OK_PORT });

    expect(runner.getType()).toBe('http-wasm');
    // getPort is only defined on HttpWasmRunner; cast via the known type.
    expect((runner as { getPort(): number | null }).getPort()).toBe(PIN_OK_PORT);

    const response = await runHttpRequest(runner, { path: '/' });
    assertHttpStatus(response, 200);
  }, 30000);

  it('throws a clear error when the pinned port is already in use', async () => {
    // Reserve the port before loading so isPortFree reports busy.
    preBoundServer = createServer();
    await new Promise<void>((resolve, reject) => {
      preBoundServer!.once('error', reject);
      preBoundServer!.listen(PIN_BUSY_PORT, '127.0.0.1', () => resolve());
    });

    runner = createHttpWasmRunner();

    await expect(
      runner.load(wasmPath, { httpPort: PIN_BUSY_PORT }),
    ).rejects.toThrow(new RegExp(`port ${PIN_BUSY_PORT} is not available`));
  }, 30000);
});
