/**
 * Request context (client / edge) on an HTTP app: the presets arrive as geoip-*, dc and pop-*
 * request headers (the headers app echoes them), and explicit headers win.
 */

import { describe, it, expect, afterAll } from "vitest";
import { createHttpWasmRunner } from "../../utils/http-wasm-helpers";
import { HTTP_APP_VARIANTS, resolveWasmPath, wasmExists } from "../shared/variants";

const variant = HTTP_APP_VARIANTS.find((v) => wasmExists(v, "headers"));

(variant ? describe : describe.skip)("HTTP request context", () => {
  const runner = createHttpWasmRunner();
  afterAll(() => runner.cleanup());

  it("sends the client and edge as headers; explicit headers win", async () => {
    await runner.load(resolveWasmPath(variant!, "headers"), { client: { preset: "de" }, edge: { preset: "nl" } });
    const response = await runner.execute({ path: "/", method: "GET", headers: { "GeoIP-City": "Berlin" } });
    expect(response.headers).toMatchObject({
      "geoip-country-code": "DE",
      "geoip-city": "Berlin",
      "x-real-ip": "192.0.2.10",
      dc: "am3",
      "pop-city": "Amsterdam",
    });

    await runner.setRequestContext({ edge: { preset: "us" } });
    const again = await runner.execute({ path: "/", method: "GET", headers: {} });
    expect(again.headers.dc).toBe("sv5");
    expect(again.headers["geoip-city"]).toBeUndefined();

    // A request's own context is for that request only.
    const own = await runner.execute({ path: "/", method: "GET", headers: {}, context: { client: { preset: "nl" } } });
    expect(own.headers["geoip-city"]).toBe("Amsterdam");
    expect(own.headers.dc).toBeUndefined();
    expect((await runner.execute({ path: "/", method: "GET", headers: {} })).headers.dc).toBe("sv5");
  }, 30000);
});
