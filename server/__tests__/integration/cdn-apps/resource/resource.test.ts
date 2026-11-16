/**
 * A resource: one app per hook. As measured on the edge (resource probe): every hook starts with
 * fresh memory; a custom property written in onResponseHeaders reaches onResponseBody even on
 * another app; one written in onRequestHeaders never reaches a later hook.
 */
import path from "node:path";
import { copyFileSync, mkdtempSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createResource, type Resource } from "../../../../runner/resource";
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
