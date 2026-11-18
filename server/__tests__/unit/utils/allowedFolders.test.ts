import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { allowedFolderOf, checkAllowedRead, recordApproval, ApprovalNeeded } from "../../../utils/allowedFolders";

const saved = process.env.FASTEDGE_ALLOWED_FOLDERS;
afterEach(() => {
  if (saved === undefined) delete process.env.FASTEDGE_ALLOWED_FOLDERS;
  else process.env.FASTEDGE_ALLOWED_FOLDERS = saved;
});

describe("allowed folders", () => {
  it("matches a path in a configured folder, written either way", () => {
    const real = mkdtempSync(join(tmpdir(), "allowed-"));
    const alias = join(mkdtempSync(join(tmpdir(), "alias-")), "site");
    symlinkSync(real, alias);
    mkdirSync(join(real, "public"));
    process.env.FASTEDGE_ALLOWED_FOLDERS = JSON.stringify([alias]);

    expect(allowedFolderOf(join(alias, "public", "index.html"))).toBe(realpathSync(real));
    expect(allowedFolderOf(join(real, "public", "index.html"))).toBe(realpathSync(real));
  });

  it("does not match a link elsewhere that points into it", () => {
    const folder = mkdtempSync(join(tmpdir(), "allowed-"));
    const elsewhere = mkdtempSync(join(tmpdir(), "elsewhere-"));
    symlinkSync(folder, join(elsewhere, "link"));
    process.env.FASTEDGE_ALLOWED_FOLDERS = JSON.stringify([folder]);

    expect(allowedFolderOf(join(elsewhere, "link", "a.wasm"))).toBeNull();
  });

  it("does not match a link inside it that points out", () => {
    const folder = mkdtempSync(join(tmpdir(), "allowed-"));
    const outside = mkdtempSync(join(tmpdir(), "outside-"));
    symlinkSync(outside, join(folder, "out"));
    process.env.FASTEDGE_ALLOWED_FOLDERS = JSON.stringify([folder]);

    expect(allowedFolderOf(join(folder, "out", "secret.json"))).toBeNull();
  });

  it("asks once, then follows the answer; ignores relative and missing entries", () => {
    const folder = mkdtempSync(join(tmpdir(), "allowed-"));
    process.env.FASTEDGE_ALLOWED_FOLDERS = JSON.stringify(["relative/dir", join(folder, "missing"), folder]);
    const file = join(folder, "app.wasm");

    expect(() => checkAllowedRead(file)).toThrow(ApprovalNeeded);
    recordApproval(realpathSync(folder), false);
    expect(() => checkAllowedRead(file)).toThrow("refused");
    expect(() => checkAllowedRead(join(tmpdir(), "x.wasm"))).toThrow("outside the workspace root");
  });
});
