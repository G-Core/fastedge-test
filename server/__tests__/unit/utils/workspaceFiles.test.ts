import { describe, it, expect } from "vitest";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listWorkspaceFiles } from "../../../utils/workspaceFiles";

describe("listWorkspaceFiles with approved allowed folders", () => {
  it("lists them after the workspace, absolute, each file once, even when a folder holds the workspace", () => {
    const parent = realpathSync(mkdtempSync(join(tmpdir(), "wsfiles-")));
    mkdirSync(join(parent, "ws"));
    mkdirSync(join(parent, "lib"));
    writeFileSync(join(parent, "ws", "a.wasm"), "");
    writeFileSync(join(parent, "lib", "b.wasm"), "");

    const { wasm } = listWorkspaceFiles(join(parent, "ws"), 500, [parent, join(parent, "lib"), join(parent, "ws")]);
    expect(wasm).toEqual(["a.wasm", `${parent}/lib/b.wasm`]);
  });
});
