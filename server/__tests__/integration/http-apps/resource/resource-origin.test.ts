/**
 * A resource whose origin is an HTTP app: the CDN app's request-header changes reach the HTTP app,
 * and its response goes through the CDN response hooks (as with a FastEdge-type origin on the edge).
 */
import path from "node:path";
import { describe, it, expect, afterAll } from "vitest";
import { createResource, type Resource } from "../../../../runner/resource";
import { HTTP_APP_VARIANTS, resolveWasmPath, wasmExists } from "../shared/variants";

const variant = HTTP_APP_VARIANTS.find((v) => wasmExists(v, "headers"));
const probe = path.resolve(__dirname, "../../../../../wasm/cdn-apps/rust/resource-probe/resource-probe.wasm");

(variant ? describe : describe.skip)("resource with an HTTP app origin", () => {
  let resource: Resource | undefined;
  afterAll(() => resource?.cleanup());

  it("runs CDN hooks around the HTTP app", async () => {
    resource = await createResource({
      apps: { filter: { wasm: probe }, origin: { wasm: resolveWasmPath(variant!, "headers") } },
      main: { hooks: { onRequestHeaders: "filter", onResponseHeaders: "filter" }, origin: { app: "origin" } },
      edge: { preset: "nl" },
    }, { stores: false });

    const result = await resource.request({ url: "https://example.com/hello" });
    expect(result.origin?.kind).toBe("app");
    expect(result.origin?.app).toBe("origin");
    // The headers app echoes request headers: the filter's request header reached it.
    expect(result.origin?.response.headers["x-probe-reqh"]).toMatch(/^app=\? global=0/);
    expect(result.origin?.response.headers.dc).toBe("am3");
    expect(result.finalResponse.headers["x-probe-resph"]).toMatch(/^app=\? global=0/);
    expect(result.finalResponse.status).toBe(200);
  }, 30000);

  it("refuses an HTTP app on a hook and a CDN app as origin", async () => {
    await expect(createResource({
      apps: { filter: { wasm: probe }, origin: { wasm: resolveWasmPath(variant!, "headers") } },
      main: { hooks: { onRequestHeaders: "origin" }, origin: { app: "filter" } },
    }, { stores: false })).rejects.toThrow('main.hooks.onRequestHeaders: "origin" is an HTTP app');
  }, 30000);
});
