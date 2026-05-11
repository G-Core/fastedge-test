/**
 * Regression: runner cross-phase response state + response-phase short-circuit.
 *
 * Both behaviours are exercised by the strict-validation `headers.wasm` app
 * (CDN AS variant) running through `callFullFlow`.
 *
 * Cross-phase response-header carry (#15): the request phase calls
 * `stream_context.headers.response.add("new-response-header", "value-01")`,
 * then `.replace(..., "value-02")`. At the edge this header survives into
 * the response phase and onto the wire. The runner used to drop the
 * request-phase response-state when constructing the response-phase hook
 * input, so the header silently disappeared from `finalResponse.headers`.
 *
 * Response-phase short-circuit (#12): when `send_http_response(...)` is
 * called from `onResponseHeaders` (or `onResponseBody`) the runner used to
 * log the intent but assemble `finalResponse` from the simulated origin's
 * response regardless. We trigger the 552 branch by feeding a mocked
 * origin a `new-header-99` value the WASM's diff doesn't expect.
 */
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { readFile } from "fs/promises";
import { ProxyWasmRunner } from "../../../../runner/ProxyWasmRunner";
import { createTestRunner } from "../../utils/test-helpers";
import {
  resolveCdnWasmPath,
  cdnWasmExists,
} from "../shared/variants";
import {
  mockOrigins,
  runFlow,
  type MockOriginsHandle,
} from "../../../../test-framework";

const WASM_FILE = "headers.wasm";
const CATEGORY = "headers";
const variant = { name: "as", wasmDir: "as" } as const;

const wasmPath = resolveCdnWasmPath(variant, CATEGORY, WASM_FILE);
const describeFn = cdnWasmExists(variant, CATEGORY, WASM_FILE)
  ? describe
  : describe.skip;

describeFn("CDN runner - cross-phase regression (#12, #15)", () => {
  let cdnRunner: ProxyWasmRunner;
  let mocks: MockOriginsHandle | null = null;

  beforeAll(async () => {
    const wasmBinary = new Uint8Array(await readFile(wasmPath));
    cdnRunner = createTestRunner();
    await cdnRunner.load(Buffer.from(wasmBinary));
  }, 30000);

  afterEach(async () => {
    if (mocks) {
      await mocks.close();
      mocks = null;
    }
  });

  it("#15 carries request-phase response headers into the response phase and finalResponse", async () => {
    mocks = mockOrigins();
    mocks
      .origin("https://origin.example")
      .intercept({ path: "/cross-phase" })
      .reply(200, "ok", {
        headers: { "content-type": "text/plain" },
      });

    const result = await runFlow(cdnRunner, {
      url: "https://origin.example/cross-phase",
      requestHeaders: { host: "origin.example" },
    });

    // Origin returned only content-type. new-response-header is set in the
    // request phase by the WASM and must survive into finalResponse.
    expect(result.finalResponse.headers["new-response-header"]).toBe("value-02");
  }, 15000);

  it("#12 honours send_http_response short-circuit from onResponseHeaders", async () => {
    mocks = mockOrigins();
    // Inject an unexpected new-header-* value: the WASM's onResponseHeaders
    // diff treats anything matching `new-header-*` that isn't in its
    // expected post-mutation set as a validation failure → 552 short-circuit.
    mocks
      .origin("https://origin.example")
      .intercept({ path: "/short-circuit" })
      .reply(200, "should be discarded", {
        headers: {
          "content-type": "text/plain",
          "new-header-99": "unexpected-from-origin",
        },
      });

    const result = await runFlow(cdnRunner, {
      url: "https://origin.example/short-circuit",
      requestHeaders: { host: "origin.example" },
    });

    expect(result.finalResponse.status).toBe(552);
    expect(result.finalResponse.body).toBe("Internal server error");
    expect(result.hookResults.onResponseHeaders.returnCode).toBe(1);
  }, 15000);
});
