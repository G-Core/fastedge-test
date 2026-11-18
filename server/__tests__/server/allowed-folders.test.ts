import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { copyFileSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startTestServer, authedFetch, type TestServer } from "./helpers.js";

const PROBE = resolve(process.cwd(), "wasm/cdn-apps/rust/resource-probe/resource-probe.wasm");

/** A folder outside the workspace holding the probe app. */
function folderWithProbe(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `allowed-${name}-`));
  copyFileSync(PROBE, join(dir, "probe.wasm"));
  return dir;
}

/**
 * Allowed folders, approved over the IPC channel as FastEdge for VS Code does. `approve` is
 * allowed and the test approves it; `refuse` is allowed and refused; `other` is not allowed.
 */
describe("debugger server — allowed folders", () => {
  let server: TestServer;
  const approve = folderWithProbe("approve");
  const refuse = folderWithProbe("refuse");
  const other = folderWithProbe("other");
  const asked: string[] = [];
  const post = (route: string, body: unknown) =>
    authedFetch(server.base, server.token, route, { method: "POST", body: JSON.stringify(body) });

  beforeAll(async () => {
    server = await startTestServer({
      env: { FASTEDGE_ALLOWED_FOLDERS: JSON.stringify([approve, refuse]) },
      onMessage: (message, reply) => {
        const m = message as { type: string; id: string; folder: string };
        if (m.type !== "fastedge:approve-folder") return;
        asked.push(m.folder);
        reply({ type: "fastedge:folder-approval", id: m.id, approved: m.folder.includes("allowed-approve-") });
      },
    });
    writeFileSync(join(approve, "resource.test.json"), JSON.stringify({
      apps: { a: { wasm: "probe.wasm" } },
      main: { hooks: { onResponseBody: "a" }, origin: { url: "built-in" } },
      stores: false,
    }));
  });

  afterAll(() => server.close());

  it("a folder that is not allowed is refused without asking", async () => {
    const res = await post("/api/load", { wasmPath: join(other, "probe.wasm") });
    expect(res.status).toBe(400);
    expect(asked).toEqual([]);
  });

  it("an allowed folder is read once the user approves it, and asked only once", async () => {
    expect((await post("/api/load", { wasmPath: join(approve, "probe.wasm") })).status).toBe(200);
    expect((await post("/api/load", { wasmPath: join(approve, "probe.wasm") })).status).toBe(200);
    expect(asked.filter((f) => f.includes("allowed-approve-"))).toHaveLength(1);
    const env = await (await authedFetch(server.base, server.token, "/api/environment")).json();
    expect(env.approvedFolders).toHaveLength(1);
  });

  it("a resource file and its apps load from an approved folder", async () => {
    const res = await post("/api/resource/load", { configPath: join(approve, "resource.test.json") });
    expect(res.status).toBe(200);
    expect((await res.json()).apps).toEqual([{ name: "a", wasmType: "proxy-wasm" }]);
  });

  it("a refused folder fails, and the refusal holds for the session", async () => {
    const first = await post("/api/load", { wasmPath: join(refuse, "probe.wasm") });
    expect(first.status).toBe(400);
    expect((await first.json()).error).toContain("not approved");
    const again = await post("/api/load", { wasmPath: join(refuse, "probe.wasm") });
    expect((await again.json()).error).toContain("refused");
    expect(asked.filter((f) => f.includes("allowed-refuse-"))).toHaveLength(1);
  });

  it("writes stay in the workspace, even to an approved folder", async () => {
    const save = await post("/api/resource/save", {
      configPath: join(approve, "written.json"),
      config: { apps: { a: { wasm: "probe.wasm" } }, main: { origin: { url: "built-in" } } },
    });
    expect(save.status).toBe(400);
    expect(existsSync(join(approve, "written.json"))).toBe(false);
  });

  it("a symlink from the workspace into an allowed folder is not a way in", async () => {
    const before = asked.length;
    symlinkSync(refuse, join(server.workspacePath, "linked"));
    const res = await post("/api/load", { wasmPath: join(server.workspacePath, "linked", "probe.wasm") });
    expect(res.status).toBe(400);
    expect(asked.length).toBe(before);
  });
});

describe("debugger server — allowed folders with no way to ask", () => {
  let server: TestServer;
  const folder = folderWithProbe("noask");

  beforeAll(async () => {
    // No IPC channel and no terminal: nobody can approve, so nothing outside the workspace is read.
    server = await startTestServer({ env: { FASTEDGE_ALLOWED_FOLDERS: JSON.stringify([folder]) } });
  });

  afterAll(() => server.close());

  it("refuses", async () => {
    const res = await authedFetch(server.base, server.token, "/api/load", {
      method: "POST",
      body: JSON.stringify({ wasmPath: join(folder, "probe.wasm") }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("not approved");
  });
});
