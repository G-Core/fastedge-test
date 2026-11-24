/**
 * runConfig runs a debugger fixture as the debugger does: the fixture's own wasm (relative to the
 * project root, or `<workspace>/…`), dotenv, client and edge.
 */
import path from "node:path";
import { copyFile, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { runConfig, logsContain } from "../../../../test-framework";

const wasm = (p: string) => path.resolve("wasm/cdn-apps", p);

describe("runConfig (CDN)", () => {
  let project: string;
  const fixture = async (name: string, config: object) => {
    const file = path.join(project, "fixtures", `${name}.test.json`);
    await writeFile(file, JSON.stringify(config));
    return file;
  };

  beforeAll(async () => {
    project = await mkdtemp(path.join(tmpdir(), "run-config-"));
    await mkdir(path.join(project, "fixtures"));
    await writeFile(path.join(project, "package.json"), "{}");
    await copyFile(wasm("rust/variables-and-secrets/variables-and-secrets.wasm"), path.join(project, "env.wasm"));
    await writeFile(path.join(project, "fixtures", ".env"), "FASTEDGE_VAR_ENV_USERNAME=from-fixture\n");
  });
  afterAll(() => rm(project, { recursive: true, force: true }));

  it("uses the fixture's wasm (relative to the project root) and its own dotenv", async () => {
    const file = await fixture("env", {
      wasm: { path: "env.wasm" },
      request: { url: "built-in" },
      dotenv: { enabled: true, path: "." },
    });
    const result = await runConfig(file, { appType: "proxy-wasm" });
    expect(logsContain(result.hookResults.onRequestHeaders, "USERNAME: from-fixture")).toBe(true);
  }, 30000);

  it("a dotenv without a path reads the app root, as in the debugger", async () => {
    await writeFile(path.join(project, ".env"), "FASTEDGE_VAR_ENV_USERNAME=from-root\n");
    try {
      const file = await fixture("env-root", { wasm: { path: "env.wasm" }, request: { url: "built-in" }, dotenv: { enabled: true } });
      const result = await runConfig(file, { appType: "proxy-wasm" });
      expect(logsContain(result.hookResults.onRequestHeaders, "USERNAME: from-root")).toBe(true);
    } finally {
      await rm(path.join(project, ".env"));
    }
  }, 30000);

  it("seeds the stores from the fixture's project, not the current directory", async () => {
    await mkdir(path.join(project, "fixtures", "stores", "kv"), { recursive: true });
    await writeFile(path.join(project, "fixtures", "stores", "kv", "users.json"), JSON.stringify({ strings: { "user:1": "alice" } }));
    await copyFile(wasm("rust/stores/stores.wasm"), path.join(project, "stores.wasm"));
    const file = await fixture("kv", {
      wasm: { path: "stores.wasm" },
      request: { url: "built-in", headers: { "x-op": "kv-get", "x-store": "users", "x-key": "user:1" } },
    });
    const result = await runConfig(file, { appType: "proxy-wasm" });
    expect(result.finalResponse.body).toBe("alice");
  }, 30000);

  it("reads <workspace> as the project root; no dotenv means no variables", async () => {
    const file = await fixture("no-env", { wasm: { path: "<workspace>/env.wasm" }, request: { url: "built-in" } });
    const result = await runConfig(file, { appType: "proxy-wasm" });
    expect(logsContain(result.hookResults.onRequestHeaders, "USERNAME: from-fixture")).toBe(false);
  }, 30000);

  it("a nearer .fastedge-debug/ is the app root, as in the debugger", async () => {
    const app = path.join(project, "nested");
    await mkdir(path.join(app, ".fastedge-debug"), { recursive: true });
    await copyFile(path.join(project, "env.wasm"), path.join(app, ".fastedge-debug", "app.wasm"));
    const file = path.join(app, ".fastedge-debug", "app.test.json");
    await writeFile(file, JSON.stringify({ wasm: { path: "<workspace>/.fastedge-debug/app.wasm" }, request: { url: "built-in" } }));
    const result = await runConfig(file, { appType: "proxy-wasm" });
    expect(result.finalResponse.status).toBe(200);
  }, 30000);

  it("sends only the fixture's headers, as the debugger does (no pseudo-headers added)", async () => {
    const file = await fixture("headers", {
      wasm: { path: "env.wasm" },
      request: { url: "built-in", headers: { "x-test": "1" } },
    });
    const result = await runConfig(file, { appType: "proxy-wasm" });
    const headers = result.hookResults.onRequestHeaders.input.request.headers;
    expect(headers["x-test"]).toBe("1");
    expect(Object.keys(headers).filter((name) => name.startsWith(":"))).toEqual([]);
  }, 30000);

  it("applies the fixture's client and edge", async () => {
    const file = await fixture("geo", {
      wasm: { path: wasm("as/properties/valid-readonly-read.wasm") },
      request: { url: "built-in" },
      client: { preset: "nl" },
    });
    const result = await runConfig(file, { appType: "proxy-wasm" });
    expect(logsContain(result.hookResults.onRequestHeaders, "Request City: Amsterdam")).toBe(true);
  }, 30000);

  it("throws when the config is not the expected kind, or its wasm is not the kind it describes", async () => {
    const file = await fixture("kind", { wasm: { path: "env.wasm" }, request: { url: "built-in" } });
    await expect(runConfig(file, { appType: "http-wasm" })).rejects.toThrow("is proxy-wasm, expected http-wasm");
    const http = await fixture("http-wasm-as-cdn", {
      wasm: { path: path.resolve("wasm/http-apps/rust/wasi/variables-and-secrets.wasm") },
      request: { url: "built-in" },
    });
    await expect(runConfig(http)).rejects.toThrow("is proxy-wasm, but its wasm is http-wasm");
  }, 30000);

  it("fails on a config without a wasm", async () => {
    const file = await fixture("no-wasm", { request: { url: "built-in" } });
    await expect(runConfig(file)).rejects.toThrow("has no wasm.path");
  });
});
