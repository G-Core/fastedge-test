/** runConfig on an HTTP app fixture: its own dotenv, its request path. */
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { describe, it, expect, afterAll } from "vitest";
import { runConfig, assertHttpStatus, assertHttpBody } from "../../../../test-framework";

describe("runConfig (HTTP)", () => {
  let dir: string;
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it("runs the fixture's request with its own dotenv", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "run-config-http-"));
    await writeFile(path.join(dir, ".env"), "FASTEDGE_VAR_ENV_USERNAME=u1\nFASTEDGE_VAR_SECRET_PASSWORD=p1\n");
    const file = path.join(dir, "app.test.json");
    await writeFile(file, JSON.stringify({
      appType: "http-wasm",
      wasm: { path: path.resolve("wasm/http-apps/rust/wasi/variables-and-secrets.wasm") },
      request: { path: "/" },
      dotenv: { enabled: true, path: "." },
    }));
    const response = await runConfig(file, { appType: "http-wasm" });
    assertHttpStatus(response, 200);
    assertHttpBody(response, "Username: u1, Password: p1");
  }, 30000);

  it("a path without its leading slash still reaches the app, as in the debugger", async () => {
    const file = path.join(dir, "no-slash.test.json");
    await writeFile(file, JSON.stringify({
      appType: "http-wasm",
      wasm: { path: path.resolve("wasm/http-apps/rust/wasi/variables-and-secrets.wasm") },
      request: { path: "hello" },
    }));
    assertHttpStatus(await runConfig(file, { appType: "http-wasm" }), 200);
  }, 30000);
});
