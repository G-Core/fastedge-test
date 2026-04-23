/**
 * Full-Flow Integration: runner + mockOrigins
 *
 * Proves that an undici MockAgent installed via mockOrigins() intercepts
 * the ProxyWasmRunner's origin fetch inside callFullFlow. Consumers use this
 * pattern to test how their WASM app responds to specific origin statuses,
 * bodies, and headers without any real network.
 *
 * Covers both call shapes: raw runner.callFullFlow() and the ergonomic
 * runFlow() wrapper.
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import type { ProxyWasmRunner } from '../../../../runner/ProxyWasmRunner';
import { loadCdnAppWasm, WASM_TEST_BINARIES } from '../../utils/wasm-loader';
import { createTestRunner } from '../../utils/test-helpers';
import {
  mockOrigins,
  runFlow,
  assertFinalStatus,
  assertFinalHeader,
  type MockOriginsHandle,
} from '../../../../test-framework';

describe('Full-Flow with mocked origin', () => {
  let cdnRunner: ProxyWasmRunner;
  let mocks: MockOriginsHandle | null = null;

  beforeAll(async () => {
    cdnRunner = createTestRunner();
    const cdnWasmBinary = await loadCdnAppWasm(
      'headers',
      WASM_TEST_BINARIES.cdnApps.headers.headersChange,
    );
    await cdnRunner.load(Buffer.from(cdnWasmBinary));
  }, 30000);

  afterEach(async () => {
    if (mocks) {
      await mocks.close();
      mocks = null;
    }
  });

  it('intercepts the runner origin fetch and returns the mocked response', async () => {
    mocks = mockOrigins();
    mocks
      .origin('https://origin.example')
      .intercept({ path: '/api/resource' })
      .reply(
        200,
        JSON.stringify({ message: 'mocked payload' }),
        { headers: { 'content-type': 'application/json' } },
      );

    const result = await cdnRunner.callFullFlow(
      'https://origin.example/api/resource',
      'GET',
      {},
      '',
      {},
      true,
    );

    expect(result.finalResponse.status).toBe(200);
    const body = JSON.parse(result.finalResponse.body);
    expect(body.message).toBe('mocked payload');
    // headers-change injects x-custom-response in onResponseHeaders — proves
    // the response hooks ran against the mocked origin response.
    expect(result.finalResponse.headers['x-custom-response']).toBe(
      'I am injected from onResponseHeaders',
    );
    mocks.assertAllCalled();
  }, 15000);

  it('surfaces upstream 503 so the WASM response hooks see a failure status', async () => {
    mocks = mockOrigins();
    mocks
      .origin('https://origin.example')
      .intercept({ path: '/down' })
      .reply(503, 'upstream down');

    const result = await cdnRunner.callFullFlow(
      'https://origin.example/down',
      'GET',
      {},
      '',
      {},
      true,
    );

    expect(result.finalResponse.status).toBe(503);
    expect(result.finalResponse.body).toBe('upstream down');
    mocks.assertAllCalled();
  }, 15000);

  it('assertAllCalled reports unused interceptors', async () => {
    mocks = mockOrigins();
    mocks.origin('https://origin.example').intercept({ path: '/hit' }).reply(200, 'ok');
    mocks.origin('https://origin.example').intercept({ path: '/never' }).reply(200, 'ok');

    await cdnRunner.callFullFlow(
      'https://origin.example/hit',
      'GET',
      {},
      '',
      {},
      true,
    );

    expect(() => mocks!.assertAllCalled()).toThrow();
  }, 15000);

  it('blocks unmocked origins by default — fetch fails cleanly in the runner error path', async () => {
    mocks = mockOrigins();
    mocks.origin('https://only-this.example').intercept({ path: '/' }).reply(200, 'ok');

    const result = await cdnRunner.callFullFlow(
      'https://not-mocked.example/x',
      'GET',
      {},
      '',
      {},
      true,
    );

    // The runner's fetch catch block returns status 0 + 'Fetch Failed' when
    // undici rejects the request. This is the "loud failure" contract —
    // unmocked requests don't silently escape to the real network.
    expect(result.finalResponse.status).toBe(0);
    expect(result.hookResults.onResponseHeaders.returnCode).toBeNull();
  }, 15000);

  it('composes with runFlow — pseudo-headers derived by runFlow do not reach the outbound fetch', async () => {
    // runFlow auto-derives :method / :path / :authority / :scheme so WASM
    // hooks can read them; the runner strips them before the HTTP/1.1 fetch.
    // Without that strip, the outbound fetch would throw on pseudo-headers.
    mocks = mockOrigins();
    mocks
      .origin('https://origin.example')
      .intercept({ path: '/api/resource?id=42', method: 'GET' })
      .reply(
        200,
        JSON.stringify({ via: 'runFlow' }),
        { headers: { 'content-type': 'application/json' } },
      );

    const result = await runFlow(cdnRunner, {
      url: 'https://origin.example/api/resource?id=42',
    });

    assertFinalStatus(result, 200);
    assertFinalHeader(result, 'x-custom-response', 'I am injected from onResponseHeaders');
    const body = JSON.parse(result.finalResponse.body);
    expect(body.via).toBe('runFlow');
    mocks.assertAllCalled();
  }, 15000);

  it('routes to request.url when WASM rewrites it (FastEdge production parity)', async () => {
    // Production semantics: request.url is the sole routing source. WASM code
    // (e.g. the geoRedirect example) rewrites request.url in onRequestHeaders
    // to reroute the upstream fetch. Here we seed the property directly via
    // callFullFlow's `properties` argument — equivalent to what a WASM
    // set_property call would produce in the property map.
    mocks = mockOrigins();
    // Only the REWRITTEN URL is mocked. If the runner reconstructs the
    // fetch target from path/host/scheme/query (the pre-fix behaviour), the
    // real fetch to origin.example is unmocked and the test fails with a
    // block. If the runner honours request.url, the fetch lands on the
    // mocked rewrite target.
    mocks
      .origin('https://rewritten.example')
      .intercept({ path: '/new-target' })
      .reply(200, 'via rewritten');

    const result = await cdnRunner.callFullFlow(
      'https://origin.example/original',
      'GET',
      {},
      '',
      { 'request.url': 'https://rewritten.example/new-target' },
      true,
    );

    expect(result.finalResponse.status).toBe(200);
    expect(result.finalResponse.body).toBe('via rewritten');
    mocks.assertAllCalled();
  }, 15000);

  it('silently drops request.path writes — routing stays on the original URL (FastEdge parity)', async () => {
    // Production behaviour: set_property("request.path", ...) returns Ok but
    // the fetch target is not affected. Only request.url controls routing.
    // Seed a request.path rewrite and confirm the original URL is still hit.
    mocks = mockOrigins();
    mocks
      .origin('https://origin.example')
      .intercept({ path: '/original' })
      .reply(200, 'via original');

    const result = await cdnRunner.callFullFlow(
      'https://origin.example/original',
      'GET',
      {},
      '',
      { 'request.path': '/should-not-reroute' },
      true,
    );

    expect(result.finalResponse.status).toBe(200);
    expect(result.finalResponse.body).toBe('via original');
    mocks.assertAllCalled();
  }, 15000);
});
