/**
 * WASM Type Detector Tests
 *
 * Tests the detection logic that routes WASM binaries to the correct runner.
 * Uses real compiled binaries from wasm/ to catch toolchain-level changes.
 *
 * Detection paths:
 * 1. Component Model binary (compile fails) → http-wasm
 * 2. Core module with http/incoming-handler or process exports → http-wasm
 * 3. Core module with wasi:http/ or wasi:io/ imports → http-wasm
 * 4. Core module with proxy_* exports → proxy-wasm
 */

import { describe, it, expect } from "vitest";
import { resolve } from "path";
import { detectWasmType } from "../../../utils/wasmTypeDetector.js";

const WASM_ROOT = resolve(__dirname, "../../../../wasm");

describe("detectWasmType", () => {
  describe("JS Component Model binaries (compile fails → http-wasm)", () => {
    it("detects JS hello-world as http-wasm", async () => {
      const result = await detectWasmType(
        `${WASM_ROOT}/http-apps/js/hello-world.wasm`,
      );
      expect(result).toBe("http-wasm");
    });

    it("detects JS http-responder as http-wasm", async () => {
      const result = await detectWasmType(
        `${WASM_ROOT}/http-apps/js/http-responder.wasm`,
      );
      expect(result).toBe("http-wasm");
    });
  });

  describe("Rust wstd async binaries (incoming-handler export → http-wasm)", () => {
    it("detects wasi/hello-world as http-wasm", async () => {
      const result = await detectWasmType(
        `${WASM_ROOT}/http-apps/rust/wasi/hello-world.wasm`,
      );
      expect(result).toBe("http-wasm");
    });

    it("detects wasi/headers as http-wasm", async () => {
      const result = await detectWasmType(
        `${WASM_ROOT}/http-apps/rust/wasi/headers.wasm`,
      );
      expect(result).toBe("http-wasm");
    });
  });

  describe("Rust legacy sync binaries (process export → http-wasm)", () => {
    it("detects basic/hello-world as http-wasm", async () => {
      const result = await detectWasmType(
        `${WASM_ROOT}/http-apps/rust/basic/hello-world.wasm`,
      );
      expect(result).toBe("http-wasm");
    });

    it("detects basic/headers as http-wasm", async () => {
      const result = await detectWasmType(
        `${WASM_ROOT}/http-apps/rust/basic/headers.wasm`,
      );
      expect(result).toBe("http-wasm");
    });
  });

  describe("Proxy-WASM CDN binaries (proxy_* exports → proxy-wasm)", () => {
    it("detects Rust http-call as proxy-wasm", async () => {
      const result = await detectWasmType(
        `${WASM_ROOT}/cdn-apps/rust/http-call/http-call.wasm`,
      );
      expect(result).toBe("proxy-wasm");
    });

    it("detects AS http-call as proxy-wasm", async () => {
      const result = await detectWasmType(
        `${WASM_ROOT}/cdn-apps/as/http-call/http-call.wasm`,
      );
      expect(result).toBe("proxy-wasm");
    });
  });

  describe("Buffer input (same detection, different input type)", () => {
    it("detects wasi binary from Buffer as http-wasm", async () => {
      const { readFile } = await import("fs/promises");
      const buffer = await readFile(
        `${WASM_ROOT}/http-apps/rust/wasi/hello-world.wasm`,
      );
      const result = await detectWasmType(buffer);
      expect(result).toBe("http-wasm");
    });

    it("detects proxy-wasm binary from Buffer as proxy-wasm", async () => {
      const { readFile } = await import("fs/promises");
      const buffer = await readFile(
        `${WASM_ROOT}/cdn-apps/as/headers/headers-change.wasm`,
      );
      const result = await detectWasmType(buffer);
      expect(result).toBe("proxy-wasm");
    });
  });
});
