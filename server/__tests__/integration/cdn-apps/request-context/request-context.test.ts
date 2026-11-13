/**
 * Request context (client / edge) on a CDN app: the client preset reaches `request.*`
 * properties and GeoIP headers, the edge preset reaches the dictionary and X-ID, and explicit
 * properties and headers win.
 */

import { describe, it, expect } from "vitest";
import { loadCdnAppWasm, WASM_TEST_BINARIES } from "../../utils/wasm-loader";
import { createHookCall, logsContain } from "../../utils/test-helpers";
import { ProxyWasmRunner } from "../../../../runner/ProxyWasmRunner";
import { createRunnerFromBuffer } from "../../../../runner/standalone";

const wasm = () => loadCdnAppWasm("properties", WASM_TEST_BINARIES.cdnApps.properties.validReadonlyRead);

describe("CDN request context", () => {
  it("fills properties, headers and dictionary from the presets; explicit values win", async () => {
    // In-process, so the dictionary can be read back.
    const runner = new ProxyWasmRunner({ dictionary: { city: "dotenv-city" } }, false);
    await runner.load(Buffer.from(await wasm()), { client: { preset: "nl" }, edge: { preset: "us" } });

    const result = await runner.callHook({
      ...createHookCall("onRequestHeaders"),
      properties: { "request.country.name": "France" },
    });
    expect(logsContain(result, "Request City: Amsterdam")).toBe(true);
    expect(logsContain(result, "Request Country Name: France")).toBe(true);
    expect(result.output.request.headers).toMatchObject({ "geoip-city": "Amsterdam", "x-id": "sv5-hw-edge-gpig-gc10" });

    const dictionary = (runner as unknown as { dictionary: { get(k: string): string | null } }).dictionary;
    expect(dictionary.get("dc")).toBe("sv5");
    expect(dictionary.get("city")).toBe("dotenv-city"); // explicit dictionary entry wins

    await runner.setRequestContext({ client: { preset: "de" } });
    const again = await runner.callHook(createHookCall("onRequestHeaders", { ":path": "/", "GeoIP-City": "Paris" }));
    expect(logsContain(again, "Request City: Frankfurt am Main")).toBe(true);
    expect(again.output.request.headers["geoip-city"]).toBe("Paris");
    expect(again.output.request.headers["x-id"]).toBeUndefined();
    expect(dictionary.get("dc")).toBeNull();
  });

  it("reaches the worker runner and selects the cache bucket", async () => {
    const runner = await createRunnerFromBuffer(Buffer.from(await wasm()), {
      stores: false,
      client: { preset: "us" },
      edge: { preset: "nl" },
    });
    try {
      const result = await runner.callFullFlow("built-in", "GET", {}, "", {}, true);
      expect(logsContain(result.hookResults.onRequestHeaders, "Request City: Chicago")).toBe(true);
      expect(result.hookResults.onRequestHeaders.output.request.headers["x-id"]).toBe("am3-hw-edge-gpig-gc96");
    } finally {
      await runner.cleanup();
    }
  });
});
