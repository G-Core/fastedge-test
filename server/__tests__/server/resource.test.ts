import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import WebSocket from "ws";
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

  it("a named file that fails to load is broadcast with its error", async () => {
    writeFileSync(join(server.workspacePath, ".fastedge-debug", "outside.test.json"), JSON.stringify({
      apps: { a: { wasm: PROBE } },
      main: { origin: { url: "built-in" } },
    }));
    const ws = new WebSocket(`ws://127.0.0.1:${new URL(server.base).port}/ws?token=${server.token}`, { origin: server.base });
    const events: { type: string; data: Record<string, unknown> }[] = [];
    ws.on("message", (m) => events.push(JSON.parse(m.toString())));
    await new Promise((ok) => ws.once("open", ok));

    const res = await post("/api/resource/load", { configPath: ".fastedge-debug/outside.test.json" });
    rmSync(join(server.workspacePath, ".fastedge-debug", "outside.test.json")); // other tests list the workspace's configs
    expect(res.status).toBe(400);
    const { error } = await res.json();
    expect(error).toContain("outside the workspace root");
    expect(error).not.toContain("--project-dir");

    await new Promise((ok) => setTimeout(ok, 100));
    ws.close();
    expect(events.find((e) => e.type === "resource_load_failed")?.data).toEqual({
      configPath: join(server.workspacePath, ".fastedge-debug", "outside.test.json"),
      error,
    });
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

  it("lists workspace wasm, test configs and .env folders for the page's suggestions", async () => {
    const ws = server.workspacePath;
    mkdirSync(join(ws, "app", "target", "wasm32-wasip1", "release", "deps"), { recursive: true });
    mkdirSync(join(ws, "app", "fixtures"), { recursive: true });
    mkdirSync(join(ws, "node_modules", "x"), { recursive: true });
    writeFileSync(join(ws, "app", "target", "wasm32-wasip1", "release", "app.wasm"), "");
    writeFileSync(join(ws, "app", "target", "wasm32-wasip1", "release", "deps", "app.wasm"), "");
    writeFileSync(join(ws, "node_modules", "x", "x.wasm"), "");
    writeFileSync(join(ws, "app", "fixtures", "one.test.json"), "{}");
    writeFileSync(join(ws, "app", "fixtures", ".env"), "");
    symlinkSync(join(ws, "app"), join(ws, "link"));

    const res = await authedFetch(server.base, server.token, "/api/workspace/files", {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.root).toBe(ws);
    expect(body.wasm).toEqual(["app/target/wasm32-wasip1/release/app.wasm", "apps/probe.wasm"]);
    expect(body.configs).toEqual([".fastedge-debug/fastedge-cdn-resource.test.json", "app/fixtures/one.test.json"]);
    expect(body.dotenvDirs).toEqual(["app/fixtures"]);
    // Servable by a built-in origin: no dot folders or files, no build output.
    expect(body.folders).toEqual(expect.arrayContaining(["app", "app/fixtures", "apps"]));
    expect(body.folders.some((f: string) => f.includes("target") || f.startsWith("."))).toBe(false);
    expect(body.files).toContain("app/fixtures/one.test.json");
    expect(body.files.some((f: string) => f.endsWith(".env") || f.includes("target/") || f.startsWith("."))).toBe(false);
    expect(body.truncated).toBe(false);
  });

  it("/api/send takes a single app's origin: workspace-relative files, nothing outside", async () => {
    mkdirSync(join(server.workspacePath, "site"), { recursive: true });
    writeFileSync(join(server.workspacePath, "site", "hello.txt"), "hello");
    const load = await post("/api/load", { wasmPath: join(server.workspacePath, "apps", "probe.wasm") });
    expect(load.status).toBe(200);

    const send = (origin: unknown) => post("/api/send", { url: "https://example.com/hello.txt", origin });
    const served = await send({ builtIn: { files: "site" } });
    expect(served.status).toBe(200);
    expect((await served.json()).finalResponse.status).toBe(200);
    expect((await send({ builtIn: { files: ".." } })).status).toBe(400);
    expect((await send({ builtIn: { bodyFile: "/etc/hostname" } })).status).toBe(400);
    expect((await send({ builtIn: { files: "site", body: "x" } })).status).toBe(400);

    // A resource sets its origins in its file.
    expect((await post("/api/resource/load", {})).status).toBe(200);
    expect((await send({ builtIn: { files: "site" } })).status).toBe(400);
  });

  it("refuses to overwrite a resource file changed since it was read, unless forced", async () => {
    const get = async () => (await authedFetch(server.base, server.token, "/api/resource/config?path=v%2Fres.json", {})).json();
    const config = { apps: { a: { wasm: "../apps/probe.wasm" } }, main: { origin: { url: "built-in" } } };
    expect((await get()).version).toBeNull();

    // First save: the caller saw no file (null).
    const first = await post("/api/resource/save", { configPath: "v/res.json", config, expectedVersion: null });
    expect(first.status).toBe(200);
    const { version } = await first.json();
    expect((await get()).version).toBe(version);

    // Someone else writes it; a save based on the old version is refused.
    writeFileSync(join(server.workspacePath, "v", "res.json"), JSON.stringify({ ...config, description: "agent" }));
    const stale = await post("/api/resource/save", { configPath: "v/res.json", config, expectedVersion: version });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ conflict: true, version: (await get()).version });

    expect((await post("/api/resource/save", { configPath: "v/res.json", config, expectedVersion: version, force: true })).status).toBe(200);
    // No expectedVersion: no check (agents that do not read first).
    expect((await post("/api/resource/save", { configPath: "v/res.json", config })).status).toBe(200);
  });
});

describe("debugger server — GET /api/config", () => {
  let server: TestServer;
  beforeAll(async () => {
    server = await startTestServer();
    mkdirSync(join(server.workspacePath, ".fastedge-debug"), { recursive: true });
    writeFileSync(join(server.workspacePath, ".fastedge-debug", "fastedge-config.test.json"), JSON.stringify({
      request: { url: "https://example.com/a.png" },
      origin: { builtIn: { files: "assets" } },
      dotenv: { enabled: true, path: "." },
    }));
  });
  afterAll(() => server.close());

  it("refuses to read or write the config through a symlink out of the workspace", async () => {
    const outside = mkdtempSync(join(tmpdir(), "fastedge-outside-"));
    const target = join(outside, "victim.json");
    writeFileSync(target, JSON.stringify({ secret: "keep" }));
    const other = await startTestServer();
    try {
      mkdirSync(join(other.workspacePath, ".fastedge-debug"), { recursive: true });
      symlinkSync(target, join(other.workspacePath, ".fastedge-debug", "fastedge-config.test.json"));
      const get = await authedFetch(other.base, other.token, "/api/config");
      expect((await get.json()).ok).toBe(false);
      const save = await authedFetch(other.base, other.token, "/api/config", { method: "POST", body: JSON.stringify({ config: { properties: {} } }) });
      expect(save.status).toBeGreaterThanOrEqual(400);
      expect(JSON.parse(readFileSync(target, "utf8"))).toEqual({ secret: "keep" });
    } finally {
      await other.close();
    }
  });

  it("returns the config's relative paths resolved against the config's folder", async () => {
    const { config } = await (await authedFetch(server.base, server.token, "/api/config")).json();
    const dir = join(server.workspacePath, ".fastedge-debug");
    expect(config.origin.builtIn.files).toBe(join(dir, "assets"));
    expect(config.dotenv.path).toBe(dir);
  });
});
