/**
 * convert_image as three apps, one per hook: onRequestHeaders decides (Image-Format request header),
 * onResponseHeaders sets the `response.content-type` property, onResponseBody re-encodes the image as
 * AVIF. Main's origin is a folder holding only frog.png; a rule sends /red-frog* to an HTTP app that
 * serves both frogs.
 */
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createResource, type Resource } from "../../../../runner/resource";

const wasm = (p: string) => path.resolve(__dirname, "../../../../../wasm", p);
const cdnApp = (name: string) => wasm(`cdn-apps/rust/${name}/${name}.wasm`);
const fixtures = path.join(__dirname, "fixtures");
const browser = { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36" };

/** An AVIF file starts with an ISO-BMFF `ftyp` box whose brand is `avif`. */
const isAvif = (base64: string) => Buffer.from(base64, "base64").subarray(4, 12).toString("latin1") === "ftypavif";

describe("convert images (resource of three CDN apps)", () => {
  let resource: Resource;

  beforeAll(async () => {
    resource = await createResource({
      apps: {
        reqh: { wasm: cdnApp("convert-req-headers"), dotenv: { enabled: true, path: fixtures } },
        resph: { wasm: cdnApp("convert-resp-headers") },
        respb: { wasm: cdnApp("convert-resp-body") },
        assets: { wasm: wasm("http-apps/rust/wasi/serve-assets.wasm") },
      },
      main: {
        hooks: { onRequestHeaders: "reqh", onResponseHeaders: "resph", onResponseBody: "respb" },
        origin: { builtIn: { files: path.join(fixtures, "origin") } },
      },
      rules: [
        { name: "red frog from the app", match: "^/red-frog", origin: { app: "assets" } },
        { name: "never reached: the first match wins", match: "^/red", origin: { builtIn: { status: 410 } } },
      ],
    }, { stores: false });
  }, 30000);

  afterAll(() => resource.cleanup());

  it("converts a PNG from the folder origin to AVIF", async () => {
    const result = await resource.request({ url: "https://example.com/frog.png", headers: browser });
    expect(result.rule).toBeNull();
    expect(result.origin).toMatchObject({ kind: "built-in", response: { status: 200, contentType: "image/png" } });
    expect(result.finalResponse.status).toBe(200);
    expect(result.finalResponse.headers["content-type"]).toBe("image/avif");
    expect(result.finalResponse.headers.vary).toBe("Image-Format");
    expect(isAvif(result.finalResponse.body)).toBe(true);
  });

  it("a rule sends the request to the HTTP app origin, and its PNG is converted too", async () => {
    const result = await resource.request({ url: "https://example.com/red-frog.png", headers: browser });
    expect(result.rule).toEqual({ index: 0, name: "red frog from the app", match: "^/red-frog" });
    expect(result.origin).toMatchObject({ kind: "app", app: "assets" });
    expect(result.finalResponse.status).toBe(200);
    expect(isAvif(result.finalResponse.body)).toBe(true);
  }, 30000);

  it("a file the folder lacks is a 404, passed through unconverted", async () => {
    const result = await resource.request({ url: "https://example.com/missing.png", headers: browser });
    expect(result.origin?.kind).toBe("built-in");
    expect(result.finalResponse.status).toBe(404);
    expect(result.finalResponse.headers["content-type"]).not.toBe("image/avif");
  });

  it("an ignored User-Agent gets the original PNG", async () => {
    const result = await resource.request({ url: "https://example.com/frog.png", headers: { "user-agent": "Googlebot/2.1" } });
    expect(result.finalResponse.status).toBe(200);
    expect(result.finalResponse.headers["content-type"]).toBe("image/png");
    expect(Buffer.from(result.finalResponse.body, "base64").subarray(1, 4).toString()).toBe("PNG");
  });
});
