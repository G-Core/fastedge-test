import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error: plain JS module of the CLI, no type declarations
import { resolveAppRoot } from "../../../../bin/app-root.mjs";

let tmp: string;
const touch = (p: string) => {
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, "");
};

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "app-root-"));
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("resolveAppRoot (CLI)", () => {
  it("a package.json / Cargo.toml nearer than a .fastedge-debug/ further up wins", () => {
    mkdirSync(join(tmp, ".fastedge-debug"));
    touch(join(tmp, "crate", "Cargo.toml"));
    touch(join(tmp, "other", "hello", "package.json"));

    expect(resolveAppRoot(join(tmp, "crate", "src"))).toBe(join(tmp, "crate"));
    expect(resolveAppRoot(join(tmp, "other", "hello"))).toBe(join(tmp, "other", "hello"));
  });

  it("a .fastedge-debug/ nearer than a package.json further up wins", () => {
    touch(join(tmp, "package.json"));
    mkdirSync(join(tmp, "app", ".fastedge-debug"), { recursive: true });

    expect(resolveAppRoot(join(tmp, "app", "index.js"))).toBe(join(tmp, "app"));
  });

  it("a file inside .fastedge-debug/ belongs to the folder holding it", () => {
    touch(join(tmp, "flows", ".fastedge-debug", "resource.test.json"));

    expect(resolveAppRoot(join(tmp, "flows", ".fastedge-debug", "resource.test.json"))).toBe(join(tmp, "flows"));
  });
});
