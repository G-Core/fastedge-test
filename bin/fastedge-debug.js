#!/usr/bin/env node
import { resolve, dirname, join } from "node:path";
import { statSync, existsSync } from "node:fs";

// Resolve the app root: the directory where .fastedge-debug/ artifacts belong.
// Priority: existing .fastedge-debug/ > package.json/Cargo.toml dir > start path.
// Aligns with the VSCode extension so CLI and editor produce the same layout.
function resolveAppRoot(startPath) {
  let dir;
  try {
    dir = statSync(startPath).isDirectory() ? startPath : dirname(startPath);
  } catch {
    dir = dirname(startPath);
  }

  // Walk up looking for existing .fastedge-debug/ (explicit user anchor)
  for (let d = dir; ; ) {
    try {
      if (statSync(join(d, ".fastedge-debug")).isDirectory()) return d;
    } catch {}
    const parent = dirname(d);
    if (parent === d) break;
    d = parent;
  }

  // Walk up looking for build manifest (app identity)
  for (let d = dir; ; ) {
    if (existsSync(join(d, "package.json")) || existsSync(join(d, "Cargo.toml"))) return d;
    const parent = dirname(d);
    if (parent === d) break;
    d = parent;
  }

  return dir;
}

process.env.WORKSPACE_PATH = resolveAppRoot(
  process.argv[2] ? resolve(process.argv[2]) : process.cwd()
);

import("../dist/server.js");
