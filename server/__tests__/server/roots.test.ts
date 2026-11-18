import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startTestServer, authedFetch, type TestServer } from "./helpers.js";

const PROBE = resolve(process.cwd(), "wasm/cdn-apps/rust/resource-probe/resource-probe.wasm");

/**
 * Two roots (FastEdge for VS Code): the workspace is the opened folder, the app root an app's
 * folder inside it.
 *
 *   <workspace>/
 *   ├── shared/probe.wasm                      a sibling app, outside the app root
 *   ├── .fastedge-debug/fastedge-cdn-resource.test.json   the default resource file
 *   └── apps/convert/                           the app root
 *       └── .fastedge-debug/  (port file, app.wasm, the single-app config, a resource file)
 */
describe("debugger server — app root and workspace root", () => {
  let server: TestServer;
  const post = (route: string, body: unknown) =>
    authedFetch(server.base, server.token, route, { method: "POST", body: JSON.stringify(body) });

  beforeAll(async () => {
    server = await startTestServer({ appFolder: "apps/convert" });
    const debug = join(server.appPath, ".fastedge-debug");
    mkdirSync(join(server.workspacePath, "shared"));
    copyFileSync(PROBE, join(server.workspacePath, "shared", "probe.wasm"));
    copyFileSync(PROBE, join(debug, "app.wasm"));
    writeFileSync(join(debug, "sibling.test.json"), JSON.stringify({
      apps: { a: { wasm: "../../../shared/probe.wasm" } },
      main: { hooks: { onResponseBody: "a" }, origin: { url: "built-in" } },
      stores: false,
    }));
    mkdirSync(join(server.workspacePath, ".fastedge-debug"));
    writeFileSync(join(server.workspacePath, ".fastedge-debug", "fastedge-cdn-resource.test.json"), JSON.stringify({
      apps: { b: { wasm: "../shared/probe.wasm" } },
      main: { origin: { url: "built-in" } },
      stores: false,
    }));
  });

  afterAll(() => server.close());

  it("reports both roots", async () => {
    const env = await (await authedFetch(server.base, server.token, "/api/environment")).json();
    expect(env).toMatchObject({ workspaceRoot: server.workspacePath, appRoot: server.appPath });
  });

  it("keeps the port file in the app root", () => {
    expect(existsSync(join(server.appPath, ".fastedge-debug", ".debug-port"))).toBe(true);
    expect(existsSync(join(server.workspacePath, ".fastedge-debug", ".debug-port"))).toBe(false);
  });

  it("a resource in the app's folder loads a sibling app from the workspace", async () => {
    const res = await post("/api/resource/load", { configPath: join(server.appPath, ".fastedge-debug", "sibling.test.json") });
    expect(res.status).toBe(200);
    expect((await res.json()).apps).toEqual([{ name: "a", wasmType: "proxy-wasm" }]);
  });

  it("the default resource file is the workspace's", async () => {
    const res = await post("/api/resource/load", {});
    expect(res.status).toBe(200);
    expect((await res.json()).apps).toEqual([{ name: "b", wasmType: "proxy-wasm" }]);
  });

  it("still refuses a file outside the workspace", async () => {
    const outside = mkdtempSync(join(tmpdir(), "fastedge-outside-"));
    copyFileSync(PROBE, join(outside, "probe.wasm"));
    const res = await post("/api/resource/load", {
      config: { apps: { a: { wasm: join(outside, "probe.wasm") } }, main: { origin: { url: "built-in" } }, stores: false },
    });
    expect(res.status).toBe(400);
  });

  it("<workspace> paths and the single-app config mean the app root", async () => {
    const load = await post("/api/load", { wasmPath: "<workspace>/.fastedge-debug/app.wasm" });
    expect(load.status).toBe(200);
    expect((await post("/api/config", { config: { request: { method: "GET", url: "https://example.com/", headers: {} } } })).status).toBe(200);
    expect(existsSync(join(server.appPath, ".fastedge-debug", "fastedge-config.test.json"))).toBe(true);
  });
});
