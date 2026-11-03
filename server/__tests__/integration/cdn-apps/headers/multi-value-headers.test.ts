/**
 * CDN WASM Runner - Multi-Value Headers Tests
 *
 * Tests that the proxy-wasm host correctly handles multi-valued headers:
 *   - add_header with same key creates separate entries
 *   - replace_header removes all entries for a key and sets one
 *   - remove_header deletes every entry for a key
 *   - get_headers returns separate entries (not comma-joined)
 *
 * Uses the FastEdge-sdk-rust cdn/headers example which performs extensive
 * header validation including add/set/remove with both string and bytes variants.
 *
 * App behavior (onRequestHeaders):
 *   - Validates initial headers exist (returns 550 if empty)
 *   - Validates host header present (returns 551 if missing or empty — the
 *     FastEdge host returns None for both)
 *   - Adds new-header-01..03 and new-header-bytes-01..03
 *   - Removes *-01 headers via set(None) → expects them gone
 *   - Replaces *-02 headers with new values
 *   - Adds second value to *-03 headers (multi-value)
 *   - Validates diff against expected set (returns 552 on mismatch)
 *   - Validates response headers from the request phase: none yet, so `host`
 *     reads None (553), and only its own new-response-header is listed (555-556)
 *   - Returns Action::Continue on success
 *
 * App behavior (onResponseHeaders):
 *   - Same pattern as onRequestHeaders but for response headers
 *   - Requires a non-empty response "host" header (551), and the removed
 *     *-01 headers to read None (553)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFile } from "fs/promises";
import { ProxyWasmRunner } from "../../../../runner/ProxyWasmRunner";
import {
  createTestRunner,
  createHookCall,
} from "../../utils/test-helpers";
import {
  CDN_APP_VARIANTS,
  resolveCdnWasmPath,
  cdnWasmExists,
} from "../shared/variants";

const WASM_FILE = "headers.wasm";
const CATEGORY = "headers";

for (const variant of CDN_APP_VARIANTS) {
  const wasmPath = resolveCdnWasmPath(variant, CATEGORY, WASM_FILE);
  const describeFn = cdnWasmExists(variant, CATEGORY, WASM_FILE)
    ? describe
    : describe.skip;

  describeFn(`CDN WASM - Multi-Value Headers [${variant.name}]`, () => {
    let runner: ProxyWasmRunner;
    // Rust SDK has _bytes header variants; AS SDK does not
    const hasBytesVariants = variant.name === "rust";

    beforeAll(async () => {
      const wasmBinary = new Uint8Array(await readFile(wasmPath));
      runner = createTestRunner();
      await runner.load(Buffer.from(wasmBinary));
    }, 30000);

    afterAll(async () => {
      await runner.cleanup();
    });

    it("should load headers WASM binary successfully", () => {
      expect(runner.getType()).toBe("proxy-wasm");
    });

    describe("onRequestHeaders", () => {
      it("should return Continue (0) — all header validations pass", async () => {
        const result = await runner.callHook(
          createHookCall("onRequestHeaders", {
            host: "example.com",
          }),
        );
        // returnCode 0 = Action::Continue, 1 = Action::Pause (error)
        expect(result.returnCode).toBe(0);
      });

      it("should add multi-valued headers as separate entries visible in output", async () => {
        const result = await runner.callHook(
          createHookCall("onRequestHeaders", {
            host: "example.com",
          }),
        );
        expect(result.returnCode).toBe(0);

        const outputHeaders = result.output.request.headers;
        // Multi-valued headers appear comma-joined in the Record<string, string> output
        expect(outputHeaders["new-header-03"]).toContain("value-03");
        expect(outputHeaders["new-header-03"]).toContain("value-03-a");
        if (hasBytesVariants) {
          expect(outputHeaders["new-header-bytes-03"]).toContain("value-bytes-03");
          expect(outputHeaders["new-header-bytes-03"]).toContain("value-bytes-03-a");
        }
      });

      it("should replace headers correctly (set with new value)", async () => {
        const result = await runner.callHook(
          createHookCall("onRequestHeaders", {
            host: "example.com",
          }),
        );
        expect(result.returnCode).toBe(0);

        const outputHeaders = result.output.request.headers;
        expect(outputHeaders["new-header-02"]).toBe("new-value-02");
        if (hasBytesVariants) {
          expect(outputHeaders["new-header-bytes-02"]).toBe("new-value-bytes-02");
        }
      });

      it("should handle remove — every entry deleted", async () => {
        const result = await runner.callHook(
          createHookCall("onRequestHeaders", {
            host: "example.com",
          }),
        );
        expect(result.returnCode).toBe(0);

        const outputHeaders = result.output.request.headers;
        // set(None) / remove() calls proxy_remove_header_map_value, which deletes every entry
        expect(outputHeaders).not.toHaveProperty("new-header-01");
        if (hasBytesVariants) {
          expect(outputHeaders).not.toHaveProperty("new-header-bytes-01");
        }
      });

      it("should return 550 (Pause) if no headers provided", async () => {
        const result = await runner.callHook(
          createHookCall("onRequestHeaders", {}),
        );
        expect(result.returnCode).toBe(1); // Action::Pause
      });

      it("should validate response header access from request phase", async () => {
        // The WASM app modifies response headers during onRequestHeaders
        // (add, replace, remove) and then validates them. This tests that
        // response headers are accessible and modifiable from the request phase.
        const result = await runner.callHook(
          createHookCall("onRequestHeaders", {
            host: "example.com",
          }),
        );
        expect(result.returnCode).toBe(0);

        const outputResponseHeaders = result.output.response.headers;
        // The app adds "new-response-header" then replaces its value
        expect(outputResponseHeaders["new-response-header"]).toBe("value-02");
      });
    });

    describe("onResponseHeaders", () => {
      it("should return Continue (0) when response has host header", async () => {
        const result = await runner.callHook({
          hook: "onResponseHeaders",
          request: {
            headers: {},
            body: "",
          },
          response: {
            headers: { host: "example.com" },
            body: "",
          },
          properties: {},
        });
        expect(result.returnCode).toBe(0);
      });

      it("should add and validate multi-valued response headers", async () => {
        const result = await runner.callHook({
          hook: "onResponseHeaders",
          request: {
            headers: {},
            body: "",
          },
          response: {
            headers: { host: "example.com" },
            body: "",
          },
          properties: {},
        });
        expect(result.returnCode).toBe(0);

        const outputHeaders = result.output.response.headers;
        expect(outputHeaders["new-header-02"]).toBe("new-value-02");
        if (hasBytesVariants) {
          expect(outputHeaders["new-header-bytes-02"]).toBe("new-value-bytes-02");
        }
        expect(outputHeaders["new-header-03"]).toContain("value-03");
        expect(outputHeaders["new-header-03"]).toContain("value-03-a");
      });

      it("should handle remove in response headers — every entry deleted", async () => {
        const result = await runner.callHook({
          hook: "onResponseHeaders",
          request: {
            headers: {},
            body: "",
          },
          response: {
            headers: { host: "example.com" },
            body: "",
          },
          properties: {},
        });
        expect(result.returnCode).toBe(0);

        const outputHeaders = result.output.response.headers;
        expect(outputHeaders).not.toHaveProperty("new-header-01");
        if (hasBytesVariants) {
          expect(outputHeaders).not.toHaveProperty("new-header-bytes-01");
        }
      });

      // Both variants emit two Set-Cookie headers in onResponseHeaders so
      // this runner-level projection check runs under AS and Rust identically.
      it("should preserve multiple Set-Cookie values as string[] (RFC 6265 §3)", async () => {
        const result = await runner.callHook({
          hook: "onResponseHeaders",
          request: { headers: {}, body: "" },
          response: { headers: { host: "example.com" }, body: "" },
          properties: {},
        });
        expect(result.returnCode).toBe(0);

        const setCookie = result.output.response.headers["set-cookie"];
        expect(Array.isArray(setCookie)).toBe(true);
        expect(setCookie).toEqual([
          "sid=abc; Path=/; HttpOnly",
          "theme=dark; Path=/",
        ]);
      });

      it("should preserve multi-value new-header-03 as string[] (lossless projection)", async () => {
        const result = await runner.callHook({
          hook: "onResponseHeaders",
          request: { headers: {}, body: "" },
          response: { headers: { host: "example.com" }, body: "" },
          properties: {},
        });
        expect(result.returnCode).toBe(0);

        // new-header-03 is added twice by the WASM: "value-03" then "value-03-a".
        // Post-fix the tuplesToRecord projection preserves both as an ordered
        // string[] instead of lossy comma-joining. Both Rust and AS variants
        // exercise the same runner pipeline and must agree.
        const newHeader03 = result.output.response.headers["new-header-03"];
        expect(Array.isArray(newHeader03)).toBe(true);
        expect(newHeader03).toEqual(["value-03", "value-03-a"]);
      });
    });
  });
}
