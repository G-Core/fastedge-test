/**
 * CDN WASM Runner - Variables and Secrets Tests
 *
 * Tests that env vars and secrets loaded from dotenv files are accessible
 * at runtime via getEnv() and getSecret() in the FastEdge proxy-wasm AS SDK.
 *
 * App: variables-and-secrets.wasm (CDN / proxy-wasm)
 *   - Reads USERNAME via getEnv("USERNAME") → proxy_dictionary_get
 *   - Reads PASSWORD via getSecret("PASSWORD") → proxy_get_secret
 *   - Adds them as request headers: x-env-username, x-env-password
 *   - Logs: "USERNAME: <value>" and "PASSWORD: <value>"
 *
 * Dotenv loading: fixtures/.env
 *   - FASTEDGE_VAR_ENV_USERNAME  → dictionary entry USERNAME
 *   - FASTEDGE_VAR_SECRET_PASSWORD → secret PASSWORD
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { join } from "path";
import type { ProxyWasmRunner } from "../../../../runner/ProxyWasmRunner";
import { loadCdnAppWasm, WASM_TEST_BINARIES } from "../../utils/wasm-loader";
import {
  createTestRunnerWithDotenv,
  createHookCall,
  logsContain,
} from "../../utils/test-helpers";

const FIXTURES_DIR = join(
  process.cwd(),
  "server/__tests__/integration/cdn-apps/variables-and-secrets/fixtures",
);

describe("CDN WASM Runner - Variables and Secrets", () => {
  let runner: ProxyWasmRunner;
  let wasmBinary: Uint8Array;

  beforeAll(async () => {
    wasmBinary = await loadCdnAppWasm(
      "variables-and-secrets",
      WASM_TEST_BINARIES.cdnApps.variablesAndSecrets.variablesAndSecrets,
    );

    runner = createTestRunnerWithDotenv();
    await runner.load(Buffer.from(wasmBinary), { dotenvPath: FIXTURES_DIR });
  }, 30000);

  afterAll(async () => {
    await runner.cleanup();
  });

  it("should load variables-and-secrets WASM binary successfully", () => {
    expect(runner.getType()).toBe("proxy-wasm");
  });

  it("should read USERNAME env var from dotenv file and log it", async () => {
    const result = await runner.callHook(createHookCall("onRequestHeaders"));

    expect(logsContain(result, "USERNAME: cdn-test-user")).toBe(true);
  });

  it("should read PASSWORD secret from dotenv file and log it", async () => {
    const result = await runner.callHook(createHookCall("onRequestHeaders"));

    expect(logsContain(result, "PASSWORD: cdn-test-secret")).toBe(true);
  });

  it("should add x-env-username request header with env var value", async () => {
    const result = await runner.callHook(createHookCall("onRequestHeaders"));

    expect(result.output.request.headers["x-env-username"]).toBe(
      "cdn-test-user",
    );
  });

  it("should add x-env-password request header with secret value", async () => {
    const result = await runner.callHook(createHookCall("onRequestHeaders"));

    expect(result.output.request.headers["x-env-password"]).toBe(
      "cdn-test-secret",
    );
  });

  it("should return both values consistently across multiple hook calls", async () => {
    for (let i = 0; i < 3; i++) {
      const result = await runner.callHook(createHookCall("onRequestHeaders"));

      expect(result.output.request.headers["x-env-username"]).toBe(
        "cdn-test-user",
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
