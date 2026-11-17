import { readdirSync } from "node:fs";
import path from "node:path";

/** Paths relative to the workspace root, "/"-separated, sorted. */
export interface WorkspaceFiles {
  /** Built `.wasm` files (cargo's `deps` copies left out). */
  wasm: string[];
  /** `*.test.json` files: app configs and resource files. */
  configs: string[];
  /** Folders holding a `.env` or `.env.*` file ("." for the root). */
  dotenvDirs: string[];
  /** True when the walk stopped at `limit` entries in a list. */
  truncated: boolean;
}

const SKIP = new Set(["node_modules", ".git"]);
// Cargo build internals: copies of the same wasm, and nothing a resource points at.
const SKIP_IN_TARGET = new Set(["deps", "build", "incremental", ".fingerprint", "examples"]);

/**
 * Lists the files the Resource page offers as suggestions. Does not follow symlinks, so it never
 * leaves the workspace.
 */
export function listWorkspaceFiles(root: string, limit = 500): WorkspaceFiles {
  const out: WorkspaceFiles = { wasm: [], configs: [], dotenvDirs: [], truncated: false };
  const add = (list: string[], value: string) => {
    if (list.length < limit) list.push(value);
    else out.truncated = true;
  };
  const walk = (dir: string, rel: string, inTarget: boolean) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // unreadable: skip
    }
    let hasDotenv = false;
    for (const entry of entries) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (SKIP.has(entry.name) || (inTarget && SKIP_IN_TARGET.has(entry.name))) continue;
        walk(path.join(dir, entry.name), relPath, inTarget || entry.name === "target");
      } else if (entry.isFile()) {
        if (entry.name.endsWith(".wasm")) add(out.wasm, relPath);
        else if (entry.name.endsWith(".test.json")) add(out.configs, relPath);
        else if (entry.name === ".env" || entry.name.startsWith(".env.")) hasDotenv = true;
      }
    }
    if (hasDotenv) add(out.dotenvDirs, rel || ".");
  };
  walk(root, "", false);
  out.wasm.sort();
  out.configs.sort();
  out.dotenvDirs.sort();
  return out;
}
