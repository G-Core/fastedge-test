import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { copyFileSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { startTestServer, authedFetch, type TestServer } from "./helpers.js";

const PROBE = resolve(process.cwd(), "wasm/cdn-apps/rust/resource-probe/resource-probe.wasm");

describe("debugger server — resources", () => {
  let server: TestServer;
  const post = (route: string, body: unknown) =>
    authedFetch(server.base, server.token, route, { method: "POST", body: JSON.stringify(body) });

  beforeAll(async () => {
    server = await startTestServer();
    mkdirSync(join(server.workspacePath, "apps"));
    copyFileSync(PROBE, join(server.workspacePath, "apps", "probe.wasm"));
    mkdirSync(join(server.workspacePath, ".fastedge-debug"), { recursive: true });
    writeFileSync(join(server.workspacePath, ".fastedge-debug", "fastedge-cdn-resource.test.json"), JSON.stringify({
      apps: { a: { wasm: "../apps/probe.wasm" }, b: { wasm: "../apps/probe.wasm" } },
      main: { hooks: { onResponseHeaders: "a", onResponseBody: "b" }, origin: { url: "built-in" } },
      stores: false,
    }));
  });

  afterAll(async () => {
    await server.close();
  });

  it("loads the default resource file and /api/send runs it", async () => {
    const load = await post("/api/resource/load", {});
    expect(load.status).toBe(200);
    expect((await load.json()).apps).toEqual([
      { name: "a", wasmType: "proxy-wasm" },
      { name: "b", wasmType: "proxy-wasm" },
    ]);

    const send = await post("/api/send", { url: "https://example.com/" });
    expect(send.status).toBe(200);
    const body = await send.json();
    expect(body.rule).toBeNull();
    expect(body.hooks.onResponseBody.app).toBe("b");
    // b reads the custom property a wrote: properties belong to the request.
    expect(body.finalResponse.body).toBe("respb: app=? global=0 trail=[] reqh=<none> resph=?\n");
  });

  it("refuses files outside the workspace", async () => {
    const res = await post("/api/resource/load", {
      config: { apps: { a: { wasm: PROBE } }, main: { origin: { url: "built-in" } } },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("outside the workspace root");
  });

  it("loads a named file, and refuses both configPath and config", async () => {
    expect((await post("/api/resource/load", { configPath: ".fastedge-debug/fastedge-cdn-resource.test.json" })).status).toBe(200);
    expect((await post("/api/resource/load", { configPath: "x", config: {} })).status).toBe(400);
  });

  it("reads and saves a resource file as written; refuses bad configs and paths", async () => {
    const get = (p: string) => authedFetch(server.base, server.token, `/api/resource/config?path=${encodeURIComponent(p)}`, {});
    expect(await (await get("new/resource.json")).json()).toMatchObject({ ok: true, config: null });

    const config = { apps: { a: { wasm: "../apps/probe.wasm" } }, main: { hooks: { onResponseBody: "a" }, origin: { url: "built-in" } } };
    const save = await post("/api/resource/save", { configPath: "new/resource.json", config });
    expect(save.status).toBe(200);
    // No defaults (rules, properties) written in.
    expect(JSON.parse(readFileSync(join(server.workspacePath, "new", "resource.json"), "utf8"))).toEqual(config);
    expect((await (await get("new/resource.json")).json()).config).toEqual(config);

    expect((await post("/api/resource/save", { configPath: "new/bad.json", config: { apps: {} } })).status).toBe(400);
    expect((await post("/api/resource/save", { configPath: "../outside.json", config })).status).toBe(400);
    expect((await post("/api/resource/save", { configPath: "new/resource.txt", config })).status).toBe(400);
    symlinkSync("/tmp/fastedge-test-dangling-target.json", join(server.workspacePath, "new", "link.json"));
    expect((await post("/api/resource/save", { configPath: "new/link.json", config })).status).toBe(400);
  });
});
