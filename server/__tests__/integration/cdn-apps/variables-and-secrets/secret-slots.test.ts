/** Secret slots from dotenv on a real CDN app: `getSecret` reads the slot effective now; a bad slot fails the load. */
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { readFile } from "node:fs/promises";
import { describe, it, expect, afterAll } from "vitest";
import { createTestRunnerWithDotenv, createHookCall, logsContain } from "../../utils/test-helpers";
import { CDN_APP_VARIANTS, cdnWasmExists, resolveCdnWasmPath } from "../shared/variants";

const rust = CDN_APP_VARIANTS.find((variant) => variant.name === "rust")!;
const wasm = resolveCdnWasmPath(rust, "variables-and-secrets", "variables-and-secrets.wasm");
const describeFn = cdnWasmExists(rust, "variables-and-secrets", "variables-and-secrets.wasm") ? describe : describe.skip;

describeFn("CDN secret slots from dotenv", () => {
  const dirs: string[] = [];
  const dotenv = async (secrets: string) => {
    const dir = await mkdtemp(path.join(tmpdir(), "secret-slots-"));
    dirs.push(dir);
    await writeFile(path.join(dir, ".env.secrets"), secrets);
    return dir;
  };
  afterAll(() => Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true }))));

  it("getSecret returns the highest slot effective now", async () => {
    const runner = createTestRunnerWithDotenv();
    await runner.load(await readFile(wasm), { dotenv: { path: await dotenv("PASSWORD=old\nPASSWORD@5=new\n") } });
    const result = await runner.callHook(createHookCall("onRequestHeaders"));
    expect(logsContain(result, "PASSWORD: new")).toBe(true);
    await runner.cleanup();
  }, 30000);

  it("a bad slot fails the load", async () => {
    const runner = createTestRunnerWithDotenv();
    await expect(
      runner.load(await readFile(wasm), { dotenv: { path: await dotenv("PASSWORD@0=x\n") } }),
    ).rejects.toThrow("write slot 0 as a bare `PASSWORD`");
    // Nothing runs on half-applied stores: hooks fail with the slot error...
    await expect(runner.callHook(createHookCall("onRequestHeaders"))).rejects.toThrow("write slot 0");
    // ...until a corrected dotenv applies; the app does not need loading again.
    await runner.applyDotenv(true, await dotenv("PASSWORD=fixed\n"));
    const result = await runner.callHook(createHookCall("onRequestHeaders"));
    expect(logsContain(result, "PASSWORD: fixed")).toBe(true);
    await runner.cleanup();
  }, 30000);

  it("an older failing dotenv apply cannot undo a newer load", async () => {
    const runner = createTestRunnerWithDotenv();
    const bad = await dotenv("PASSWORD@0=x\n");
    const good = await dotenv("PASSWORD=ok\n");
    const applying = runner.applyDotenv(true, bad);
    const loading = runner.load(await readFile(wasm), { dotenv: { enabled: true, path: good } });
    await expect(applying).rejects.toThrow("write slot 0");
    await loading;
    const result = await runner.callHook(createHookCall("onRequestHeaders"));
    expect(logsContain(result, "PASSWORD: ok")).toBe(true);
    await runner.cleanup();
  }, 30000);
});
