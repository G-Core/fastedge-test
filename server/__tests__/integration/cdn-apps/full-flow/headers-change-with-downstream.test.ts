/**
 * Full-Flow Integration Test: CDN Headers-Change with Downstream HTTP Service
 *
 * This test validates the complete request/response flow through a CDN app
 * that makes downstream HTTP calls, ensuring headers and body modifications
 * work correctly through all 4 proxy-wasm hooks.
 *
 * Test Flow:
 * 1. Spawn http-responder as downstream service (port 8100)
 * 2. Load headers-change CDN app
 * 3. Execute full flow: onRequestHeaders → onRequestBody → HTTP fetch → onResponseHeaders → onResponseBody
 * 4. Verify:
 *    - Request headers injected (x-custom-request)
 *    - Request body modified (x-inject-req-body field added to JSON)
 *    - Downstream receives modified request
 *    - Response headers injected (x-custom-response)
 *    - Response body modified (x-inject-res-body field added to JSON)
 *
 * This ensures production parity for CDN apps making downstream fetches.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { IWasmRunner } from '../../../../runner/IWasmRunner';
import type { ProxyWasmRunner } from '../../../../runner/ProxyWasmRunner';
import { loadCdnAppWasm, loadHttpAppWasm, WASM_TEST_BINARIES } from '../../utils/wasm-loader';
import { createTestRunner } from '../../utils/test-helpers';
import { spawnDownstreamHttpApp } from '../../utils/http-wasm-helpers';

describe('Full-Flow: CDN Headers-Change with Downstream', () => {
  let downstreamRunner: IWasmRunner;
  let downstreamPort: number;
  let cdnRunner: ProxyWasmRunner;
  let cdnWasmBinary: Uint8Array;

  beforeAll(async () => {
    // Step 1: Spawn downstream HTTP responder service
    const httpResponderWasm = await loadHttpAppWasm(
      'basic-examples',
      WASM_TEST_BINARIES.httpApps.basicExamples.httpResponder
    );

    const downstream = await spawnDownstreamHttpApp(httpResponderWasm, 8100);
    downstreamRunner = downstream.runner;
    downstreamPort = downstream.port;

    console.log(`✅ Downstream HTTP responder running on port ${downstreamPort}`);

    // Step 2: Load CDN headers-change app
    cdnRunner = createTestRunner();
    cdnWasmBinary = await loadCdnAppWasm(
      'headers',
      WASM_TEST_BINARIES.cdnApps.headers.headersChange
    );

    await cdnRunner.load(Buffer.from(cdnWasmBinary));

    console.log('✅ CDN headers-change app loaded');
  }, 40000); // 40s timeout for loading both runners

  afterAll(async () => {
    // Cleanup both runners
    if (downstreamRunner) {
      await downstreamRunner.cleanup();
      console.log('✅ Downstream runner cleaned up');
    }
  });

  it('should complete full flow with request header injection', async () => {
    const downstreamUrl = `http://localhost:${downstreamPort}/test`;

    // Execute full flow
    const result = await cdnRunner.callFullFlow(
      downstreamUrl,
      'GET',
      {}, // Request headers
      '', // Request body
      {}, // Response headers (will be filled by downstream)
      '', // Response body (will be filled by downstream)
      200,
      'OK',
      {}, // Properties
      true // Enforce production property rules
    );

    // Verify full flow completed
    expect(result.hookResults.onRequestHeaders).toBeDefined();
    expect(result.hookResults.onRequestBody).toBeDefined();
    expect(result.hookResults.onResponseHeaders).toBeDefined();
    expect(result.hookResults.onResponseBody).toBeDefined();

    // Verify onRequestHeaders hook ran and logged
    const requestHeadersLogs = result.hookResults.onRequestHeaders.logs.map(l => l.message);
    expect(requestHeadersLogs.length).toBeGreaterThan(0);
    expect(requestHeadersLogs.some(log => log.includes('injecting header') || log.includes('x-custom-request'))).toBe(true);

    // Verify downstream received the request (check final response)
    expect(result.finalResponse.status).toBe(200);
    expect(result.finalResponse.body).toBeTruthy();

    // Parse downstream response (http-responder returns JSON with request details)
    const responseData = JSON.parse(result.finalResponse.body);
    expect(responseData.hello).toBe('http-responder works!');
    expect(responseData.reqHeaders).toBeDefined();

    // Verify x-custom-request header was added and forwarded to downstream
    expect(responseData.reqHeaders['x-custom-request']).toBe('I am injected from onRequestHeaders');
  }, 15000);

  it('should inject field into request JSON body when x-inject-req-body header is present', async () => {
    const downstreamUrl = `http://localhost:${downstreamPort}/test`;

    // Execute full flow with JSON body and x-inject-req-body header
    const result = await cdnRunner.callFullFlow(
      downstreamUrl,
      'POST',
      {
        'content-type': 'application/json',
        'x-inject-req-body': 'injected-value-from-test',
      },
      JSON.stringify({ original: 'data' }), // Original request body
      {},
      '',
      200,
      'OK',
      {},
      true
    );

    // Verify onRequestBody hook ran
    const requestBodyLogs = result.hookResults.onRequestBody.logs.map(l => l.message);
    expect(requestBodyLogs.some(log => log.includes('onRequestBody'))).toBe(true);
    expect(requestBodyLogs.some(log => log.includes('Injected x-inject-req-body'))).toBe(true);

    // Verify downstream received modified JSON body
    const responseData = JSON.parse(result.finalResponse.body);
    expect(responseData.reqBody).toBeDefined();

    // Parse the request body that downstream received
    const downstreamReceivedBody = JSON.parse(responseData.reqBody);
    expect(downstreamReceivedBody.original).toBe('data');
    expect(downstreamReceivedBody['x-inject-req-body']).toBe('injected-value-from-test');
  }, 15000);

  it('should inject response header through onResponseHeaders hook', async () => {
    const downstreamUrl = `http://localhost:${downstreamPort}/test`;

    const result = await cdnRunner.callFullFlow(
      downstreamUrl,
      'GET',
      {},
      '',
      {},
      '',
      200,
      'OK',
      {},
      true
    );

    // Verify onResponseHeaders hook ran
    const responseHeadersLogs = result.hookResults.onResponseHeaders.logs.map(l => l.message);
    expect(responseHeadersLogs.some(log => log.includes('onResponseHeaders'))).toBe(true);
    expect(responseHeadersLogs.some(log => log.includes('x-custom-response'))).toBe(true);

    // Verify x-custom-response header was added to final response
    expect(result.finalResponse.headers['x-custom-response']).toBe('I am injected from onResponseHeaders');
  }, 15000);

  it('should inject field into response JSON body when x-inject-res-body header is present', async () => {
    const downstreamUrl = `http://localhost:${downstreamPort}/test`;

    // Execute full flow with x-inject-res-body header
    const result = await cdnRunner.callFullFlow(
      downstreamUrl,
      'GET',
      {
        'x-inject-res-body': 'injected-response-value',
      },
      '',
      {},
      '',
      200,
      'OK',
      {},
      true
    );

    // Verify onResponseBody hook ran
    const responseBodyLogs = result.hookResults.onResponseBody.logs.map(l => l.message);
    expect(responseBodyLogs.some(log => log.includes('onResponseBody'))).toBe(true);
    expect(responseBodyLogs.some(log => log.includes('Injected x-inject-res-body'))).toBe(true);

    // Verify response body was modified
    const responseData = JSON.parse(result.finalResponse.body);
    expect(responseData['x-inject-res-body']).toBe('injected-response-value');

    // Original response data should still be present
    expect(responseData.hello).toBe('http-responder works!');
  }, 15000);

  it('should complete full flow through all 4 hooks with both request and response modifications', async () => {
    const downstreamUrl = `http://localhost:${downstreamPort}/test`;

    // Execute full flow with both request and response body injections
    const result = await cdnRunner.callFullFlow(
      downstreamUrl,
      'POST',
      {
        'content-type': 'application/json',
        'x-inject-req-body': 'request-injection',
        'x-inject-res-body': 'response-injection',
      },
      JSON.stringify({ test: 'data' }),
      {},
      '',
      200,
      'OK',
      {},
      true
    );

    // Verify all 4 hooks executed
    expect(result.hookResults.onRequestHeaders).toBeDefined();
    expect(result.hookResults.onRequestBody).toBeDefined();
    expect(result.hookResults.onResponseHeaders).toBeDefined();
    expect(result.hookResults.onResponseBody).toBeDefined();

    // Verify request modifications reached downstream
    const responseData = JSON.parse(result.finalResponse.body);
    const downstreamReceivedBody = JSON.parse(responseData.reqBody);
    expect(downstreamReceivedBody['x-inject-req-body']).toBe('request-injection');

    // Verify response was modified
    expect(responseData['x-inject-res-body']).toBe('response-injection');

    // Verify custom headers were added
    expect(responseData.reqHeaders['x-custom-request']).toBe('I am injected from onRequestHeaders');
    expect(result.finalResponse.headers['x-custom-response']).toBe('I am injected from onResponseHeaders');

    // Verify all hooks logged successfully
    const allLogs = [
      ...result.hookResults.onRequestHeaders.logs,
      ...result.hookResults.onRequestBody.logs,
      ...result.hookResults.onResponseHeaders.logs,
      ...result.hookResults.onResponseBody.logs,
    ];

    // Should have logs from all 4 hooks
    expect(allLogs.length).toBeGreaterThan(0);
    expect(result.hookResults.onRequestHeaders.logs.length).toBeGreaterThan(0);
    expect(result.hookResults.onRequestBody.logs.length).toBeGreaterThan(0);
    expect(result.hookResults.onResponseHeaders.logs.length).toBeGreaterThan(0);
    expect(result.hookResults.onResponseBody.logs.length).toBeGreaterThan(0);
  }, 15000);

  it('should pass headers through each phase of the hook lifecycle', async () => {
    const downstreamUrl = `http://localhost:${downstreamPort}/test`;

    const result = await cdnRunner.callFullFlow(
      downstreamUrl,
      'GET',
      {
        'x-test-header': 'original-value',
      },
      '',
      {},
      '',
      200,
      'OK',
      {},
      true
    );

    // Verify original header was preserved and forwarded
    const responseData = JSON.parse(result.finalResponse.body);
    expect(responseData.reqHeaders['x-test-header']).toBe('original-value');

    // Verify custom header was added in onRequestHeaders
    expect(responseData.reqHeaders['x-custom-request']).toBe('I am injected from onRequestHeaders');
  }, 15000);

  it('should produce complete response with all hook modifications combined (UI parity test)', async () => {
    const downstreamUrl = `http://localhost:${downstreamPort}/test`;

    // Execute full flow with both request and response body injections
    const result = await cdnRunner.callFullFlow(
      downstreamUrl,
      'POST',
      {
        'content-type': 'application/json',
        'x-inject-req-body': 'injected_into_reqBody',
        'x-inject-res-body': 'injected_into_responseBody',
      },
      JSON.stringify({ message: 'Hello' }),
      {},
      '',
      200,
      'OK',
      {},
      true
    );

    // Parse final response
    const finalResponse = JSON.parse(result.finalResponse.body);

    // Verify structure matches UI output exactly
    expect(finalResponse).toMatchObject({
      hello: 'http-responder works!',
      method: 'POST',
      reqHeaders: expect.objectContaining({
        'content-type': 'application/json',
        'x-custom-request': 'I am injected from onRequestHeaders',
        'x-inject-req-body': 'injected_into_reqBody',
        'x-inject-res-body': 'injected_into_responseBody',
      }),
      'x-inject-res-body': 'injected_into_responseBody',
    });

    // Verify request body modification from onRequestBody hook
    const reqBody = JSON.parse(finalResponse.reqBody);
    expect(reqBody).toEqual({
      message: 'Hello',
      'x-inject-req-body': 'injected_into_reqBody',
    });

    // Verify response headers from onResponseHeaders hook
    expect(result.finalResponse.headers['x-custom-response']).toBe('I am injected from onResponseHeaders');

    // Verify final response contains both original downstream data AND injected field from onResponseBody
    expect(finalResponse.hello).toBe('http-responder works!');
    expect(finalResponse.method).toBe('POST');
    expect(finalResponse.reqHeaders).toBeDefined();
    expect(finalResponse.reqBody).toBeDefined();
    expect(finalResponse.requestUrl).toBeDefined();
    expect(finalResponse['x-inject-res-body']).toBe('injected_into_responseBody');

    // Verify all 4 hooks executed successfully
    expect(result.hookResults.onRequestHeaders.logs.length).toBeGreaterThan(0);
    expect(result.hookResults.onRequestBody.logs.length).toBeGreaterThan(0);
    expect(result.hookResults.onResponseHeaders.logs.length).toBeGreaterThan(0);
    expect(result.hookResults.onResponseBody.logs.length).toBeGreaterThan(0);

    // Verify no hook returned an error code
    expect(result.hookResults.onRequestHeaders.returnCode).toBe(0);
    expect(result.hookResults.onRequestBody.returnCode).toBe(0);
    expect(result.hookResults.onResponseHeaders.returnCode).toBe(0);
    expect(result.hookResults.onResponseBody.returnCode).toBe(0);
  }, 15000);
});
