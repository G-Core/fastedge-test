import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, realpathSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appRoot, workspaceRoot } from "../../../utils/roots";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("appRoot", () => {
  it("is FASTEDGE_APP_ROOT when it lies inside the workspace", () => {
    const ws = mkdtempSync(join(tmpdir(), "roots-"));
    mkdirSync(join(ws, "apps", "a"), { recursive: true });
    process.env.WORKSPACE_PATH = ws;
    process.env.FASTEDGE_APP_ROOT = join(ws, "apps", "a");
    expect(appRoot()).toBe(join(ws, "apps", "a"));
  });

  it("is the workspace root when FASTEDGE_APP_ROOT is outside it, or unset", () => {
    const ws = mkdtempSync(join(tmpdir(), "roots-"));
    process.env.WORKSPACE_PATH = ws;
    process.env.FASTEDGE_APP_ROOT = tmpdir();
    expect(appRoot()).toBe(workspaceRoot());
    delete process.env.FASTEDGE_APP_ROOT;
    expect(appRoot()).toBe(ws);
  });

  it("is the workspace root when FASTEDGE_APP_ROOT is a symlink out of it", () => {
    const ws = mkdtempSync(join(tmpdir(), "roots-"));
    const outside = mkdtempSync(join(tmpdir(), "outside-"));
    symlinkSync(outside, join(ws, "linked"));
    process.env.WORKSPACE_PATH = ws;
    process.env.FASTEDGE_APP_ROOT = join(ws, "linked");
    expect(appRoot()).toBe(ws);
    expect(realpathSync(appRoot())).not.toBe(realpathSync(outside));
  });
});
