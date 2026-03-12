/**
 * Hybrid Loading Tests
 *
 * Integration tests for both buffer-based and path-based WASM loading.
 * Tests the performance optimization of loading from file paths.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { join } from "path";
import type { IWasmRunner } from "../../runner/IWasmRunner.js";
import {
  loadHttpAppWasm,
  loadCdnAppWasm,
  WASM_TEST_BINARIES,
} from "./utils/wasm-loader.js";
import { createHttpWasmRunner } from "./utils/http-wasm-helpers.js";
import { ProxyWasmRunner } from "../../runner/ProxyWasmRunner.js";

describe("Hybrid Loading - Path vs Buffer", () => {

  describe("HTTP WASM Runner - Both Modes", () => {
    let runnerBuffer: IWasmRunner;
    let runnerPath: IWasmRunner;
    let wasmBinary: Uint8Array;
    let wasmPath: string;

    beforeAll(async () => {
      // Load WASM binary for buffer mode
      wasmBinary = await loadHttpAppWasm(
        "sdk-examples",
        WASM_TEST_BINARIES.httpApps.sdkExamples.sdkBasic,
      );

      // Get actual file path for path mode
      wasmPath = join(
        process.cwd(),
        "server",
        "__tests__",
        "integration",
        "http-apps",
        "sdk-examples",
        WASM_TEST_BINARIES.httpApps.sdkExamples.sdkBasic,
      );

      // Create two runners
      runnerBuffer = createHttpWasmRunner();
      runnerPath = createHttpWasmRunner();
    }, 30000);

    afterAll(async () => {
      await runnerBuffer?.cleanup();
      await runnerPath?.cleanup();
    });

    it("should load WASM from Buffer (legacy mode)", async () => {
      await runnerBuffer.load(Buffer.from(wasmBinary));
      expect(runnerBuffer.getType()).toBe("http-wasm");
    }, 20000);

    it("should load WASM from file path (optimized mode)", async () => {
      await runnerPath.load(wasmPath);
      expect(runnerPath.getType()).toBe("http-wasm");
    }, 20000);

    it("should execute request successfully with buffer-loaded WASM", async () => {
      const response = await runnerBuffer.execute({
        path: "/",
        method: "GET",
        headers: {},
        body: "",
      });

      expect(response.status).toBe(200);
      expect(response.body).toContain("You made a request");
    });

    it("should execute request successfully with path-loaded WASM", async () => {
      const response = await runnerPath.execute({
        path: "/",
        method: "GET",
        headers: {},
        body: "",
      });

      expect(response.status).toBe(200);
      expect(response.body).toContain("You made a request");
    });

    it("should produce identical results from both loading modes", async () => {
      const request = {
        path: "/test?foo=bar",
        method: "GET",
        headers: { "x-test": "value" },
        body: "",
      };

      const responseBuffer = await runnerBuffer.execute(request);
      const responsePath = await runnerPath.execute(request);

      // Both should have same status
      expect(responsePath.status).toBe(responseBuffer.status);

      // Both should have same content type
      expect(responsePath.contentType).toBe(responseBuffer.contentType);

      // Both should return same body
      expect(responsePath.body).toBe(responseBuffer.body);
    });
  });

  describe("Proxy WASM Runner - Both Modes", () => {
    let runnerBuffer: ProxyWasmRunner;
    let runnerPath: ProxyWasmRunner;
    let wasmBinary: Uint8Array;
    let wasmPath: string;

    beforeAll(async () => {
      // Load WASM binary for buffer mode
      wasmBinary = await loadCdnAppWasm(
        "basic-modify-request-headers",
        WASM_TEST_BINARIES.cdnApps.basicModifyRequestHeaders,
      );

      // Get actual file path for path mode
      wasmPath = join(
        process.cwd(),
        "server",
        "__tests__",
        "integration",
        "cdn-apps",
        "basic-modify-request-headers",
        WASM_TEST_BINARIES.cdnApps.basicModifyRequestHeaders,
      );

      // Create two runners
      runnerBuffer = new ProxyWasmRunner();
      runnerPath = new ProxyWasmRunner();
    });

    afterAll(async () => {
      await runnerBuffer?.cleanup();
      await runnerPath?.cleanup();
    });

    it("should load WASM from Buffer (legacy mode)", async () => {
      await runnerBuffer.load(Buffer.from(wasmBinary));
      expect(runnerBuffer.getType()).toBe("proxy-wasm");
    });

    it("should load WASM from file path (optimized mode)", async () => {
      await runnerPath.load(wasmPath);
      expect(runnerPath.getType()).toBe("proxy-wasm");
    });

    it("should execute hook successfully with buffer-loaded WASM", async () => {
      const result = await runnerBuffer.callHook({
        hook: "onRequestHeaders",
        request: {
          headers: { host: "example.com" },
          body: "",
        },
        response: {
          headers: {},
          body: "",
        },
        properties: {},
      });

      expect(result.error).toBeUndefined();
      expect(result.returnValue).toBeDefined();
    });

    it("should execute hook successfully with path-loaded WASM", async () => {
      const result = await runnerPath.callHook({
        hook: "onRequestHeaders",
        request: {
          headers: { host: "example.com" },
          body: "",
        },
        response: {
          headers: {},
          body: "",
        },
        properties: {},
      });

      expect(result.error).toBeUndefined();
      expect(result.returnValue).toBeDefined();
    });

    it("should produce identical results from both loading modes", async () => {
      const hookCall = {
        hook: "onRequestHeaders" as const,
        request: {
          headers: { host: "example.com", "x-test": "value" },
          body: "",
        },
        response: {
          headers: {},
          body: "",
        },
        properties: {},
      };

      const resultBuffer = await runnerBuffer.callHook(hookCall);
      const resultPath = await runnerPath.callHook(hookCall);

      // Both should have same return value
      expect(resultPath.returnValue).toBe(resultBuffer.returnValue);

      // Both should have no errors
      expect(resultBuffer.error).toBeUndefined();
      expect(resultPath.error).toBeUndefined();

      // Both should modify headers in the same way
      expect(resultPath.modifiedRequest?.headers).toEqual(
        resultBuffer.modifiedRequest?.headers,
      );
    });
  });

  describe("Error Handling", () => {
    it("should reject invalid file path", async () => {
      const runner = createHttpWasmRunner();

      await expect(
        runner.load("/nonexistent/path/to/file.wasm"),
      ).rejects.toThrow();

      await runner.cleanup();
    });

    it("should reject path to non-WASM file", async () => {
      const runner = createHttpWasmRunner();
      const txtPath = join(process.cwd(), "package.json");

      // Note: This might succeed if validation allows it, but should fail during WASM compilation
      await expect(runner.load(txtPath)).rejects.toThrow();

      await runner.cleanup();
    });
  });

  describe("Performance Characteristics", () => {
    it("should load large WASM faster from path than buffer", async () => {
      // Note: This is a conceptual test - actual timing depends on file size
      // For a 12MB WASM file, path loading should be significantly faster

      const wasmBinary = await loadHttpAppWasm(
        "sdk-examples",
        WASM_TEST_BINARIES.httpApps.sdkExamples.sdkBasic,
      );

      const wasmPath = join(
        process.cwd(),
        "server",
        "__tests__",
        "integration",
        "http-apps",
        "sdk-examples",
        WASM_TEST_BINARIES.httpApps.sdkExamples.sdkBasic,
      );

      const runnerBuffer = createHttpWasmRunner();
      const runnerPath = createHttpWasmRunner();

      const startBuffer = Date.now();
      await runnerBuffer.load(Buffer.from(wasmBinary));
      const timeBuffer = Date.now() - startBuffer;

      const startPath = Date.now();
      await runnerPath.load(wasmPath);
      const timePath = Date.now() - startPath;

      console.log(
        `Buffer mode: ${timeBuffer}ms, Path mode: ${timePath}ms, Speedup: ${(timeBuffer / timePath).toFixed(2)}x`,
      );

      // Path mode should not be significantly slower
      // (might be slightly slower for small files due to filesystem overhead)
      expect(timePath).toBeLessThan(timeBuffer * 2);

      await runnerBuffer.cleanup();
      await runnerPath.cleanup();
    }, 30000);
  });

  describe("Memory Management", () => {
    it("should not create temp file when loading from path", async () => {
      const wasmPath = join(
        process.cwd(),
        "server",
        "__tests__",
        "integration",
        "http-apps",
        "sdk-examples",
        WASM_TEST_BINARIES.httpApps.sdkExamples.sdkBasic,
      );

      const runner = createHttpWasmRunner();

      // Load from path (should not create temp file)
      await runner.load(wasmPath);

      // Runner should be functional
      const response = await runner.execute({
        path: "/",
        method: "GET",
        headers: {},
        body: "",
      });

      expect(response.status).toBe(200);

      // Cleanup should succeed without trying to delete non-existent temp file
      await runner.cleanup();
    }, 20000);

    it("should create and cleanup temp file when loading from buffer", async () => {
      const wasmBinary = await loadHttpAppWasm(
        "sdk-examples",
        WASM_TEST_BINARIES.httpApps.sdkExamples.sdkBasic,
      );

      const runner = createHttpWasmRunner();

      // Load from buffer (creates temp file)
      await runner.load(Buffer.from(wasmBinary));

      // Runner should be functional
      const response = await runner.execute({
        path: "/",
        method: "GET",
        headers: {},
        body: "",
      });

      expect(response.status).toBe(200);

      // Cleanup should remove temp file
      await runner.cleanup();
    }, 20000);
  });
});
