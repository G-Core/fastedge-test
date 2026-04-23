/**
 * HTTP WASM Runner - Hello World Execution Tests
 *
 * Integration tests for HTTP WASM binaries using the FastEdge-run CLI runner.
 * Runs the same assertions against all language variants (JS, Rust basic, Rust wasi).
 *
 * Note: Tests run sequentially to avoid port conflicts and resource contention
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import type { IWasmRunner } from "../../../../runner/IWasmRunner";
import { createHttpWasmRunner } from "../../utils/http-wasm-helpers";
import {
  assertHttpStatus,
  assertHttpContentType,
  assertHttpBodyContains,
  assertHttpLog,
} from "../../../../test-framework/assertions";
import { runHttpRequest } from "../../../../test-framework/suite-runner";
import {
  HTTP_APP_VARIANTS,
  resolveWasmPath,
  wasmExists,
} from "../shared/variants";

// --- Parameterized tests: run against all available variants ---
for (const variant of HTTP_APP_VARIANTS) {
  const wasmPath = resolveWasmPath(variant, "hello-world");
  const describeFn = wasmExists(variant, "hello-world")
    ? describe.sequential
    : describe.skip;

  describeFn(`HTTP WASM - Hello World [${variant.name}]`, () => {
    let runner: IWasmRunner;

    beforeAll(async () => {
      runner = createHttpWasmRunner();
      await runner.load(wasmPath);
    }, 20000);

    afterAll(async () => {
      await runner.cleanup();
    });

    it("should load HTTP WASM binary successfully", async () => {
      expect(runner.getType()).toBe("http-wasm");
    });

    it("should execute GET request and return response with correct content-type", async () => {
      const response = await runHttpRequest(runner, {
        path: "/",
        method: "GET",
      });

      assertHttpStatus(response, 200);
      expect(response.statusText).toBe("OK");
      assertHttpContentType(response, "text/plain");
    });

    it("should return text body without base64 encoding", async () => {
      const response = await runHttpRequest(runner, {
        path: "/",
        method: "GET",
      });

      assertHttpBodyContains(response, "Hello, you made a request");
    });

    it("should capture logs from WASM application", async () => {
      const response = await runHttpRequest(runner, {
        path: "/",
        method: "GET",
      });

      assertHttpLog(response, "test-logging-string");
    });

    it("should handle path with query parameters", async () => {
      const response = await runHttpRequest(runner, {
        path: "/test?foo=bar&baz=qux",
        method: "GET",
      });

      assertHttpStatus(response, 200);
      assertHttpBodyContains(response, "foo=bar");
      assertHttpBodyContains(response, "baz=qux");
    });
  });
}

// --- Non-variant tests: runner interface behavior (not WASM-specific) ---
describe("Runner Type and Interface", () => {
  let runner: IWasmRunner;

  beforeEach(() => {
    runner = createHttpWasmRunner();
  });

  afterEach(async () => {
    await runner.cleanup();
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  it("should report correct runner type", () => {
    expect(runner.getType()).toBe("http-wasm");
  });

  it("should throw error when executing without loading WASM", async () => {
    await expect(
      runner.execute({
        path: "/",
        method: "GET",
        headers: {},
        body: "",
      }),
    ).rejects.toThrow("HttpWasmRunner not loaded");
  });

  it("should throw error when calling proxy-wasm methods", async () => {
    await expect(
      runner.callHook({
        hook: "onRequestHeaders",
        request: { headers: {}, body: "" },
        response: { headers: {}, body: "" },
        properties: {},
      }),
    ).rejects.toThrow("not supported for HTTP WASM");

    await expect(
      runner.callFullFlow(
        "http://example.com",
        "GET",
        {},
        "",
        {},
        true,
      ),
    ).rejects.toThrow("not supported for HTTP WASM");
  });
});
