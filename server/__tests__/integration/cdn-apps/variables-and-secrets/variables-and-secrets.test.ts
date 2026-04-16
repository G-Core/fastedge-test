/**
 * CDN WASM Runner - Variables and Secrets Tests
 *
 * Tests all three runtime data access surfaces:
 *   1. getEnv()         — WASI process.env (< 64 KB values)
 *   2. getDictionary()  — proxy_dictionary_get host function (2mb limit)
 *   3. getSecret()      — proxy_get_secret host function
 *
 * Runs the same assertions against all language variants (AS, Rust).
 *
 * App behavior:
 *   - Reads USERNAME via getEnv (WASI env) → header x-env-username
 *   - Reads LARGE_DATA via getDictionary (proxy_dictionary_get) → header x-dict-large-data
 *   - Reads PASSWORD via getSecret (proxy_get_secret) → header x-env-password
 *   - Logs all three values
 *
 * Dotenv loading: fixtures/.env
 *   - FASTEDGE_VAR_ENV_USERNAME    → WASI env + dictionary entry USERNAME
 *   - FASTEDGE_VAR_ENV_LARGE_DATA  → WASI env + dictionary entry LARGE_DATA
 *   - FASTEDGE_VAR_SECRET_PASSWORD → secret PASSWORD
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { join } from "path";
import { readFile } from "fs/promises";
import { ProxyWasmRunner } from "../../../../runner/ProxyWasmRunner";
import {
  createTestRunnerWithDotenv,
  createHookCall,
  logsContain,
} from "../../utils/test-helpers";
import {
  CDN_APP_VARIANTS,
  resolveCdnWasmPath,
  cdnWasmExists,
} from "../shared/variants";

const FIXTURES_DIR = join(
  process.cwd(),
  "server/__tests__/integration/cdn-apps/variables-and-secrets/fixtures",
);
const WASM_FILE = "variables-and-secrets.wasm";
const CATEGORY = "variables-and-secrets";

for (const variant of CDN_APP_VARIANTS) {
  const wasmPath = resolveCdnWasmPath(variant, CATEGORY, WASM_FILE);
  const describeFn = cdnWasmExists(variant, CATEGORY, WASM_FILE)
    ? describe
    : describe.skip;

  describeFn(`CDN WASM - Variables and Secrets [${variant.name}]`, () => {
    let runner: ProxyWasmRunner;

    beforeAll(async () => {
      const wasmBinary = new Uint8Array(await readFile(wasmPath));
      runner = createTestRunnerWithDotenv();
      await runner.load(Buffer.from(wasmBinary), {
        dotenv: { path: FIXTURES_DIR },
      });
    }, 30000);

    afterAll(async () => {
      await runner.cleanup();
    });

    it("should load variables-and-secrets WASM binary successfully", () => {
      expect(runner.getType()).toBe("proxy-wasm");
    });

    // --- getEnv (WASI process.env) ---

    it("should read USERNAME via getEnv (WASI env) and log it", async () => {
      const result = await runner.callHook(createHookCall("onRequestHeaders"));
      expect(logsContain(result, "USERNAME: cdn-test-user")).toBe(true);
    });

    it("should add x-env-username header via getEnv", async () => {
      const result = await runner.callHook(createHookCall("onRequestHeaders"));
      expect(result.output.request.headers["x-env-username"]).toBe(
        "cdn-test-user",
      );
    });

    // --- getDictionary (proxy_dictionary_get) ---

    it("should read LARGE_DATA via getDictionary (proxy_dictionary_get) and log it", async () => {
      const result = await runner.callHook(createHookCall("onRequestHeaders"));
      expect(logsContain(result, "LARGE_DATA: cdn-test-large-data")).toBe(true);
    });

    it("should add x-dict-large-data header via getDictionary", async () => {
      const result = await runner.callHook(createHookCall("onRequestHeaders"));
      expect(result.output.request.headers["x-dict-large-data"]).toBe(
        "cdn-test-large-data",
      );
    });

    // --- getSecret (proxy_get_secret) ---

    it("should read PASSWORD via getSecret (proxy_get_secret) and log it", async () => {
      const result = await runner.callHook(createHookCall("onRequestHeaders"));
      expect(logsContain(result, "PASSWORD: cdn-test-secret")).toBe(true);
    });

    it("should add x-env-password header via getSecret", async () => {
      const result = await runner.callHook(createHookCall("onRequestHeaders"));
      expect(result.output.request.headers["x-env-password"]).toBe(
        "cdn-test-secret",
      );
    });

    // --- All three surfaces together ---

    it("should return all three values consistently across multiple hook calls", async () => {
      for (let i = 0; i < 3; i++) {
        const result = await runner.callHook(
          createHookCall("onRequestHeaders"),
        );
        expect(result.output.request.headers["x-env-username"]).toBe(
          "cdn-test-user",
        );
        expect(result.output.request.headers["x-dict-large-data"]).toBe(
          "cdn-test-large-data",
        );
        expect(result.output.request.headers["x-env-password"]).toBe(
          "cdn-test-secret",
        );
      }
    });

    it("should return FilterHeadersStatusValues.Continue (returnCode 0)", async () => {
      const result = await runner.callHook(createHookCall("onRequestHeaders"));
      expect(result.returnCode).toBe(0);
    });
  });
}
