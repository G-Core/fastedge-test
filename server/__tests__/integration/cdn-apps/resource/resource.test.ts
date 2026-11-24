/**
 * A resource: one app per hook. As measured on the edge (resource probe): every hook starts with
 * fresh memory; a custom property written in onResponseHeaders reaches onResponseBody even on
 * another app; one written in onRequestHeaders never reaches a later hook.
 */
import path from "node:path";
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createResource, type Resource } from "../../../../runner/resource";
import { createRunner } from "../../../../runner/standalone";
import { runTestSuite } from "../../../../test-framework/suite-runner";
import { test as fastedgeTest } from "../../../../test-framework/vitest";

const wasm = path.resolve(__dirname, "../../../../../wasm/cdn-apps/rust/resource-probe/resource-probe.wasm");
const fixture = (app: string) => ({ wasm, dotenv: { enabled: true, path: path.join(__dirname, "fixtures", app) } });

describe("resource", () => {
  let resource: Resource;

  beforeAll(async () => {
    resource = await createResource({
      apps: { a: fixture("a"), b: fixture("b") },
      main: {
        hooks: { onRequestHeaders: "a", onResponseHeaders: "a", onResponseBody: "a" },
        origin: { url: "built-in" },
      },
      rules: [
        { name: "cross", match: "^/cross$", hooks: { onRequestHeaders: "a", onResponseHeaders: "a", onResponseBody: "b" } },
        { name: "body only", match: "^/body-only$", hooks: { onResponseBody: "b" } },
        { name: "origin only", match: "^/origin-only", origin: { url: "built-in" } },
      ],
      client: { preset: "de" },
      edge: { preset: "de" },
    }, { stores: false });
  });

  afterAll(() => resource.cleanup());

  it("main: one app on every hook, fresh memory per hook, onRequestHeaders properties not kept", async () => {
    const result = await resource.request({ url: "https://example.com/" });
    expect(result.rule).toBeNull();
    expect(result.origin?.kind).toBe("built-in");
    expect(Object.fromEntries(Object.entries(result.hooks).map(([hook, h]) => [hook, h!.app]))).toEqual({
      onRequestHeaders: "a", onResponseHeaders: "a", onResponseBody: "a",
    });
    expect(result.finalResponse.headers["x-probe-resph"]).toBe("app=a global=0 trail=[] reqh=<none> resph=<none> set=Ok(())");
    expect(result.finalResponse.body).toBe("respb: app=a global=0 trail=[] reqh=<none> resph=a\n");
  });

  it("a custom property one app writes is read by the next hook's app", async () => {
    const result = await resource.request({ url: "https://example.com/cross" });
    expect(result.rule).toEqual({ index: 0, name: "cross", match: "^/cross$" });
    expect(result.hooks.onResponseBody?.app).toBe("b");
    expect(result.finalResponse.body).toBe("respb: app=b global=0 trail=[] reqh=<none> resph=a\n");
  });

  it("a rule's hooks replace main's completely", async () => {
    const result = await resource.request({ url: "https://example.com/body-only" });
    expect(Object.keys(result.hooks)).toEqual(["onResponseBody"]);
    expect(result.finalResponse.headers["x-probe-resph"]).toBeUndefined();
    expect(result.finalResponse.body).toBe("respb: app=b global=0 trail=[] reqh=<none> resph=<none>\n");
  });

  it("a rule without hooks keeps main's", async () => {
    const result = await resource.request({ url: "https://example.com/origin-only?x=1" });
    expect(result.rule?.name).toBe("origin only");
    expect(result.hooks.onResponseBody?.app).toBe("a");
  });

  it("every app sees the resource's client", async () => {
    const result = await resource.request({ url: "https://example.com/" });
    expect(result.hooks.onRequestHeaders?.result.input.request.headers["geoip-city"]).toBe("Frankfurt am Main");
    expect(result.hooks.onResponseBody?.result.input.properties?.["request.city"]).toBe("Frankfurt am Main");
  });

  it("rejects unknown apps and nested resources", async () => {
    await expect(createResource({ apps: {}, main: { hooks: { onRequestHeaders: "x" }, origin: { url: "built-in" } } }))
      .rejects.toThrow('main.hooks.onRequestHeaders: unknown app "x"');
    await expect(createResource({ apps: { a: { wasm: "missing.wasm" } }, main: { origin: { url: "built-in" } } }))
      .rejects.toThrow("build a first");
  });
});

describe("resource test APIs", () => {
  const config = { apps: { a: fixture("a") }, main: { hooks: { onResponseBody: "a" }, origin: { url: "built-in" } } };

  it("runTestSuite runs a resource suite, one fresh resource per test", async () => {
    const suite = await runTestSuite({
      resource: config,
      tests: [
        { name: "body", run: async (r) => expect((await r.request({ url: "https://example.com/" })).finalResponse.body).toContain("app=a") },
        { name: "fails", run: async () => { throw new Error("nope"); } },
      ],
    });
    expect(suite.passed).toBe(1);
    expect(suite.results[1].error).toBe("nope");
  });

  it("a resource suite's own stores use the resource's bucket", async () => {
    const suite = await runTestSuite({
      resource: { ...config, dc: "fr5" },
      tests: [{ name: "dc", run: async (_r, { stores }) => expect(stores!.dc).toBe("fr5") }],
    });
    expect(suite.failed).toBe(0);
  });

  it("a missing resource file fails each test instead of the suite", async () => {
    const suite = await runTestSuite({ resource: "/no/such/resource.json", tests: [{ name: "t", run: async () => {} }] });
    expect(suite.failed).toBe(1);
    expect(suite.results[0].error).toContain("ENOENT");
  });

  fastedgeTest("the vitest resource fixture loads on the test's stores", async ({ resource }) => {
    const r = await resource(config);
    expect((await r.request({ url: "https://example.com/" })).hooks.onResponseBody?.app).toBe("a");
  });
});

describe("resource reload", () => {
  it("reloads an app whose wasm was rebuilt before the next request", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "resource-reload-"));
    const app = path.join(dir, "app.wasm");
    copyFileSync(wasm, app);
    const r = await createResource({ apps: { a: { wasm: app } }, main: { hooks: { onResponseBody: "a" }, origin: { url: "built-in" } } }, { stores: false });
    try {
      expect((await r.request({ url: "https://example.com/" })).finalResponse.body).toContain("respb:");
      // "Rebuild" a as an app that does not touch the body: the echo comes through.
      copyFileSync(path.resolve(__dirname, "../../../../../wasm/cdn-apps/as/headers/headers.wasm"), app);
      utimesSync(app, new Date(), new Date(Date.now() + 5000));
      expect((await r.request({ url: "https://example.com/" })).finalResponse.body).not.toContain("respb:");
    } finally {
      await r.cleanup();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("resource request URL", () => {
  const readonlyRead = path.resolve(__dirname, "../../../../../wasm/cdn-apps/as/properties/valid-readonly-read.wasm");
  let origin: Server;
  let seen: string[] = [];
  beforeAll(async () => {
    origin = createServer((req, res) => { seen.push(`${req.headers["x-forwarded-host"]} ${req.url}`); res.end("origin"); });
    await new Promise<void>((done) => origin.listen(0, "127.0.0.1", done));
  });
  afterAll(() => new Promise<void>((done) => origin.close(() => done())));

  it("gives the first hook the request's URL properties", async () => {
    const r = await createResource({ apps: { p: { wasm: readonlyRead } }, main: { hooks: { onRequestHeaders: "p" }, origin: { url: "built-in" } } }, { stores: false });
    try {
      const result = await r.request({ url: "https://example.com/img/cat.png?x=1" });
      const logs = result.hooks.onRequestHeaders!.result.logs.map((l) => l.message);
      expect(logs.some((m) => m.endsWith("Request Extension: png"))).toBe(true);
      expect(JSON.parse(result.finalResponse.body).requestUrl).toBe("https://example.com/img/cat.png?x=1");
    } finally {
      await r.cleanup();
    }
  });

  it("sends the request's path and query to a URL origin, as a CDN forwards it", async () => {
    const port = (origin.address() as AddressInfo).port;
    const r = await createResource({ apps: { a: fixture("a") }, main: { hooks: {}, origin: { url: `http://127.0.0.1:${port}` } } }, { stores: false });
    try {
      seen = [];
      const result = await r.request({ url: "https://shop.example/account?id=7" });
      expect(seen).toEqual(["shop.example /account?id=7"]);
      expect(result.origin?.kind).toBe("url");
      expect(result.finalResponse.body).toBe("origin");
    } finally {
      await r.cleanup();
    }
  });
});

/** As on the edge, hooks get a body's raw bytes, whether or not it is text (an image). */
describe("binary bodies", () => {
  const image = Buffer.from(Array.from({ length: 256 }, (_, i) => i)); // not valid UTF-8
  const inverted = Buffer.from(image.map((b) => 255 - b));
  let origin: Server;
  let url: string;
  beforeAll(async () => {
    origin = createServer((req, res) => {
      if (req.url === "/text") return void res.end("origin");
      res.writeHead(200, { "content-type": "image/png" }).end(image);
    });
    await new Promise<void>((done) => origin.listen(0, "127.0.0.1", done));
    url = `http://127.0.0.1:${(origin.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((done) => origin.close(() => done())));

  it("onResponseBody gets an image's bytes and the client gets the bytes it wrote", async () => {
    const r = await createResource({ apps: { a: fixture("a") }, main: { hooks: { onResponseBody: "a" }, origin: { url } } }, { stores: false });
    try {
      const result = await r.request({ url: "https://example.com/photo.png", headers: { "x-probe-invert": "1" } });
      const hook = result.hooks.onResponseBody!.result;
      expect(hook.input.response).toMatchObject({ isBase64: true, body: image.toString("base64") });
      expect(result.finalResponse.isBase64).toBe(true);
      expect(Buffer.from(result.finalResponse.body, "base64")).toEqual(inverted);
    } finally {
      await r.cleanup();
    }
  });

  it("a single app (the debugger's full flow) does the same", async () => {
    const runner = await createRunner(wasm, { stores: false });
    try {
      const result = await runner.callFullFlow(`${url}/photo.png`, "GET", { "x-probe-invert": "1" }, "", {}, true);
      expect(result.finalResponse.isBase64).toBe(true);
      expect(Buffer.from(result.finalResponse.body, "base64")).toEqual(inverted);
    } finally {
      await runner.cleanup();
    }
  });

  it("a text body a hook makes binary comes back as base64", async () => {
    const r = await createResource({ apps: { a: fixture("a") }, main: { hooks: { onResponseBody: "a" }, origin: { url } } }, { stores: false });
    try {
      const result = await r.request({ url: "https://example.com/text", headers: { "x-probe-invert": "1" } });
      expect(result.hooks.onResponseBody!.result.input.response.isBase64).toBeUndefined();
      expect(result.finalResponse.isBase64).toBe(true);
      expect(Buffer.from(result.finalResponse.body, "base64")).toEqual(Buffer.from(Buffer.from("origin").map((b) => 255 - b)));
    } finally {
      await r.cleanup();
    }
  });
});

describe("built-in origin from the config", () => {
  const image = Buffer.from(Array.from({ length: 256 }, (_, i) => i)); // not valid UTF-8
  const inverted = Buffer.from(image.map((b) => 255 - b));
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), "builtin-origin-"));
    mkdirSync(path.join(dir, "assets"));
    writeFileSync(path.join(dir, "assets", "photo.png"), image);
    writeFileSync(path.join(dir, "assets", ".env"), "SECRET=1");
    writeFileSync(path.join(dir, "outside.txt"), "outside");
    copyFileSync(wasm, path.join(dir, "probe.wasm"));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("a resource serves files from a folder, and a rule answers with a fixed response", async () => {
    const file = path.join(dir, "resource.json");
    writeFileSync(file, JSON.stringify({
      apps: { a: { wasm: "probe.wasm" } },
      main: { hooks: { onResponseBody: "a" }, origin: { builtIn: { files: "assets" } } },
      rules: [{ match: "^/gone", origin: { builtIn: { status: 410, body: "gone" } } }],
    }));
    const r = await createResource(file, { stores: false, root: dir });
    try {
      const served = await r.request({ url: "https://example.com/photo.png", headers: { "x-probe-invert": "1" } });
      expect(served.origin).toMatchObject({ kind: "built-in", response: { status: 200, contentType: "image/png" } });
      expect(Buffer.from(served.finalResponse.body, "base64")).toEqual(inverted);
      expect((await r.request({ url: "https://example.com/.env" })).finalResponse.status).toBe(404);
      expect((await r.request({ url: "https://example.com/gone" })).origin!.response).toMatchObject({ status: 410, body: "gone" });
    } finally {
      await r.cleanup();
    }
  });

  it("a resource's origin folder must be inside its root", async () => {
    const file = path.join(dir, "assets-outside.json");
    writeFileSync(file, JSON.stringify({ apps: { a: { wasm: "probe.wasm" } }, main: { origin: { builtIn: { files: ".." } } } }));
    await expect(createResource(file, { stores: false, root: dir })).rejects.toThrow(/outside the workspace/);
  });

  it("a single app takes the origin too: the request URL is then only the client's", async () => {
    const runner = await createRunner(wasm, { stores: false });
    try {
      const result = await runner.callFullFlow("https://example.com/photo.png", "GET", { "x-probe-invert": "1" }, "", {}, true, undefined, {
        builtIn: { files: realpathSync(path.join(dir, "assets")) },
      });
      expect(result.finalResponse.status).toBe(200);
      expect(Buffer.from(result.finalResponse.body, "base64")).toEqual(inverted);
    } finally {
      await runner.cleanup();
    }
  });
});

describe("an app from its project's config", () => {
  it("reads wasm.path as the debugger does: relative to the project root, or <workspace>", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "resource-config-"));
    try {
      const app = path.join(dir, "my_app");
      mkdirSync(path.join(app, "target"), { recursive: true });
      mkdirSync(path.join(app, "fixtures"));
      writeFileSync(path.join(app, "Cargo.toml"), "[package]\n");
      copyFileSync(wasm, path.join(app, "target", "app.wasm"));
      const config = (wasmPath: string) => JSON.stringify({ wasm: { path: wasmPath }, request: { url: "built-in" } });
      writeFileSync(path.join(app, "fixtures", "relative.test.json"), config("target/app.wasm"));
      writeFileSync(path.join(app, "fixtures", "workspace.test.json"), config("<workspace>/target/app.wasm"));
      const r = await createResource({
        apps: { a: { config: path.join(app, "fixtures", "relative.test.json") }, b: { config: path.join(app, "fixtures", "workspace.test.json") } },
        main: { hooks: { onRequestHeaders: "a", onResponseHeaders: "b" }, origin: { url: "built-in" } },
      }, { stores: false });
      await r.cleanup();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("searches for the project root no higher than the workspace", async () => {
    // A package.json above the workspace must not become the app's root.
    const dir = mkdtempSync(path.join(tmpdir(), "resource-bound-"));
    try {
      writeFileSync(path.join(dir, "package.json"), "{}");
      const app = path.join(dir, "workspace", "app");
      mkdirSync(app, { recursive: true });
      copyFileSync(wasm, path.join(app, "app.wasm"));
      writeFileSync(path.join(app, "app.test.json"), JSON.stringify({ wasm: { path: "<workspace>/app.wasm" }, request: { url: "built-in" } }));
      const r = await createResource({
        apps: { a: { config: "app/app.test.json" } },
        main: { hooks: { onRequestHeaders: "a" }, origin: { url: "built-in" } },
      }, { stores: false, root: path.join(dir, "workspace") });
      await r.cleanup();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
