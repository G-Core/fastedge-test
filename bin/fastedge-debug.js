#!/usr/bin/env node
import { resolve } from "node:path";
import { resolveAppRoot } from "./app-root.mjs";

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

// --allow <dir> (repeatable): a folder outside the workspace the debugger may read once you
// approve it in this terminal (allowed folders). Removed from argv like --project-dir.
function extractAllowFlags(argv) {
  const folders = [];
  for (let i = 2; i < argv.length; ) {
    const a = argv[i];
    if (a === "--allow") {
      const value = argv[i + 1];
      if (!value) {
        console.error("Error: --allow requires a folder argument.");
        process.exit(2);
      }
      folders.push(resolve(value));
      argv.splice(i, 2);
    } else if (a.startsWith("--allow=")) {
      folders.push(resolve(a.slice("--allow=".length)));
      argv.splice(i, 1);
    } else {
      i++;
    }
  }
  return folders;
}

const allowFlags = extractAllowFlags(process.argv);
if (allowFlags.length) process.env.FASTEDGE_ALLOWED_FOLDERS = JSON.stringify(allowFlags);

const projectDirFlag = extractProjectDirFlag(process.argv);
const startPath = projectDirFlag
  ? resolve(projectDirFlag)
  : process.argv[2]
    ? resolve(process.argv[2])
    : process.cwd();

process.env.WORKSPACE_PATH = resolveAppRoot(startPath);

import("../dist/server.js");
