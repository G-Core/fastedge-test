import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runFlow } from '../../../../test-framework';
import { loadCdnAppWasm, WASM_TEST_BINARIES } from '../../utils/wasm-loader';
import { createTestRunner } from '../../utils/test-helpers';
import type { ProxyWasmRunner } from '../../../../runner/ProxyWasmRunner';

/**
 * Regression coverage for the WASI env init gap (CC-08 in proxy-wasm-sdk-as
 * EXAMPLE_VALIDATION.md). When `dotenv.enabled` is false and the dictionary
 * is empty, `getEnv()` on the AS SDK previously trapped with `memory access
 * out of bounds` because Node WASI's `environ_get` returns INVAL on an empty
 * env, which aborts `_start` mid-init and leaves `process.env` in a
 * partially-constructed state.
 *
 * Expected behaviour: production FastEdge guarantees an at-least-empty WASI
 * env, so a missing key should return "" without trapping.
 */
describe('CDN Empty Env: getEnv with dotenv disabled', () => {
  let runner: ProxyWasmRunner;

  beforeAll(async () => {
    runner = createTestRunner();
    const wasmBinary = await loadCdnAppWasm(
      'empty-env',
      WASM_TEST_BINARIES.cdnApps.emptyEnv.emptyEnv
    );
    await runner.load(Buffer.from(wasmBinary));
  }, 30000);

  afterAll(async () => {
    await runner.cleanup();
  });

  it('should not trap when getEnv is called on an uninitialized env', async () => {
    const result = await runFlow(runner, {
      url: 'http://unused.test/',
      requestHeaders: {},
    });

    // The hook must reach a clean return — pre-fix this throws
    // `memory access out of bounds` from inside process.env.has().
    expect(result.hookResults.onRequestHeaders).toBeDefined();
    expect(result.hookResults.onRequestHeaders.returnCode).toBe(0);
  });

  it('should return empty string for a missing env var', async () => {
    const result = await runFlow(runner, {
      url: 'http://unused.test/',
      requestHeaders: {},
    });

    // The app logs `empty-env >> MISSING_KEY="<value>"` — assert the empty
    // string is what came back from getEnv().
    const log = result.hookResults.onRequestHeaders.logs.find((entry) =>
      entry.message.includes('empty-env >> MISSING_KEY=')
    );
    expect(log).toBeDefined();
    expect(log!.message).toContain('empty-env >> MISSING_KEY=""');
  });
});
