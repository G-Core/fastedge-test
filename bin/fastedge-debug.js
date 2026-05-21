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

// Parse `--project-dir <path>` / `--project-dir=<path>` and strip it from argv
// before the server import, so the server's own arg handling doesn't see it.
// When set, it overrides the positional fallback for resolveAppRoot — useful
// when running from a nested sandbox (e.g. `cd fastedge-test && npm run debug`
// with the project root one directory up).
function extractProjectDirFlag(argv) {
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project-dir" || a === "-C") {
      const value = argv[i + 1];
      if (!value) {
        console.error(`Error: ${a} requires a path argument.`);
        process.exit(2);
      }
      argv.splice(i, 2);
      return value;
    }
    const eq = a.startsWith("--project-dir=")
      ? a.slice("--project-dir=".length)
      : a.startsWith("-C=")
        ? a.slice("-C=".length)
        : null;
    if (eq !== null) {
      argv.splice(i, 1);
      return eq;
    }
  }
  return null;
}

const projectDirFlag = extractProjectDirFlag(process.argv);
const startPath = projectDirFlag
  ? resolve(projectDirFlag)
  : process.argv[2]
    ? resolve(process.argv[2])
    : process.cwd();

process.env.WORKSPACE_PATH = resolveAppRoot(startPath);

import("../dist/server.js");
