import { dirname, join } from "node:path";
import { statSync, existsSync } from "node:fs";

function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The app root for a start path: the nearest folder that is an app of its own (it has
 * `.fastedge-debug/`, `package.json` or `Cargo.toml`, whichever is nearest), else the start
 * folder. A `.fastedge-debug/` in a parent folder does not capture a project below it. The VS Code
 * extension finds its debugger root the same way, within the folder the user opened.
 */
export function resolveAppRoot(startPath) {
  const start = isDir(startPath) ? startPath : dirname(startPath);
  for (let d = start; ; d = dirname(d)) {
    if (isDir(join(d, ".fastedge-debug")) || existsSync(join(d, "package.json")) || existsSync(join(d, "Cargo.toml"))) {
      return d;
    }
    if (dirname(d) === d) return start;
  }
}
