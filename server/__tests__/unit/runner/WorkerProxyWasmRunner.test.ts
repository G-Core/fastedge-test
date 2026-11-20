/**
 * WorkerProxyWasmRunner: the worker-specific parts (the runner behaviour itself is covered by
 * the CDN integration suite, which runs through the worker with FASTEDGE_TEST_CDN_RUNNER=worker).
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { WorkerProxyWasmRunner } from '../../../runner/WorkerProxyWasmRunner';
import { NullStateManager } from '../../../runner/NullStateManager';

const PROXY_WASM = resolve(__dirname, '../../../../wasm/cdn-apps/as/headers/headers-change.wasm');

const hookCall = {
  hook: 'onRequestHeaders',
  request: { headers: { host: 'example.com' }, body: '', method: 'GET' },
  response: { headers: {}, body: '' },
  properties: {},
};

describe('WorkerProxyWasmRunner', () => {
  it('passes errors from the worker back to the caller', async () => {
    const runner = new WorkerProxyWasmRunner(undefined, false);
    await expect(runner.callHook(hookCall)).rejects.toThrow('WASM module not loaded');
    await runner.cleanup();
  });

  it('delivers state manager events before the call resolves', async () => {
    const runner = new WorkerProxyWasmRunner(undefined, false);
    await runner.load(await readFile(PROXY_WASM));
    const events: string[] = [];
    const manager = new NullStateManager();
    manager.emitRequestStarted = () => { events.push('started'); };
    manager.emitHookExecuted = (hook) => { events.push(hook); };
    runner.setStateManager(manager);

    const result = await runner.callFullFlow('built-in', 'GET', {}, '', {}, true);

    expect(result.hookResults).toHaveProperty('onResponseBody');
    expect(events[0]).toBe('started');
    expect(events).toContain('onResponseBody');
    await runner.cleanup();
  });

  it('rejects calls after cleanup', async () => {
    const runner = new WorkerProxyWasmRunner(undefined, false);
    await runner.cleanup();
    await expect(runner.load(await readFile(PROXY_WASM))).rejects.toThrow('cleaned up');
  });
});
