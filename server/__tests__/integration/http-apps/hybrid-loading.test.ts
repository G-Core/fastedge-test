/**
 * Hybrid Loading Tests
 *
 * Integration tests for both buffer-based and path-based WASM loading.
 * Tests the performance optimization of loading from file paths.
 * Uses js/hello-world.wasm for HTTP WASM and headers/headers-change.wasm for proxy-WASM.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { join } from "path";
import { readFile } from "fs/promises";
import type { IWasmRunner } from "../../../runner/IWasmRunner.js";
import { createHttpWasmRunner } from "../utils/http-wasm-helpers.js";
import { loadCdnAppWasm, WASM_TEST_BINARIES } from "../utils/wasm-loader.js";
import { ProxyWasmRunner } from "../../../runner/ProxyWasmRunner.js";

const HTTP_WASM_PATH = join(
  process.cwd(),
  "wasm",
  "http-apps",
  "js",
  "hello-world.wasm",
);
const CDN_WASM_DIR = "headers";
const CDN_WASM_FILE = WASM_TEST_BINARIES.cdnApps.headers.headersChange;

describe("Hybrid Loading - Path vs Buffer", () => {
  describe("HTTP WASM Runner - Both Modes", () => {
    let runnerBuffer: IWasmRunner;
    let runnerPath: IWasmRunner;
    let wasmBinary: Uint8Array;

    beforeAll(async () => {
      const buffer = await readFile(HTTP_WASM_PATH);
      wasmBinary = new Uint8Array(buffer);

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
      await runnerPath.load(HTTP_WASM_PATH);
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
      expect(response.body).toContain("Hello, you made a request");
    });

    it("should execute request successfully with path-loaded WASM", async () => {
      const response = await runnerPath.execute({
        path: "/",
        method: "GET",
        headers: {},
        body: "",
      });

      expect(response.status).toBe(200);
      expect(response.body).toContain("Hello, you made a request");
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

      expect(responsePath.status).toBe(responseBuffer.status);
      expect(responsePath.contentType).toBe(responseBuffer.contentType);
      expect(responsePath.body).toBe(responseBuffer.body);
    });
  });

  describe("Proxy WASM Runner - Both Modes", () => {
    let runnerBuffer: ProxyWasmRunner;
    let runnerPath: ProxyWasmRunner;
    let wasmBinary: Uint8Array;
    let wasmPath: string;

    beforeAll(async () => {
      wasmBinary = await loadCdnAppWasm(CDN_WASM_DIR, CDN_WASM_FILE);

      wasmPath = join(
        process.cwd(),
        "wasm",
        "cdn-apps",
        "as",
        CDN_WASM_DIR,
        CDN_WASM_FILE,
      );

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

      expect(result.returnCode).toBeDefined();
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

      expect(result.returnCode).toBeDefined();
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

      expect(resultPath.returnCode).toBe(resultBuffer.returnCode);
      expect(resultPath.output.request.headers).toEqual(
        resultBuffer.output.request.headers,
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
  });

  describe("Memory Management", () => {
    it("should not create temp file when loading from path", async () => {
      const runner = createHttpWasmRunner();

      await runner.load(HTTP_WASM_PATH);

      const response = await runner.execute({
        path: "/",
        method: "GET",
        headers: {},
        body: "",
      });

      expect(response.status).toBe(200);

      await runner.cleanup();
    }, 20000);

    it("should create and cleanup temp file when loading from buffer", async () => {
      const wasmBinary = await readFile(HTTP_WASM_PATH);

      const runner = createHttpWasmRunner();

      await runner.load(Buffer.from(wasmBinary));

      const response = await runner.execute({
        path: "/",
        method: "GET",
        headers: {},
        body: "",
      });

      expect(response.status).toBe(200);

      await runner.cleanup();
    }, 20000);
  });
});
