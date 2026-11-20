import { realpathSync } from "node:fs";
import path from "node:path";

/**
 * The debugger's two roots. The CLI sets both to one folder; FastEdge for VS Code sets the
 * workspace root to the opened folder and the app root to the app's own folder inside it.
 */

/** The workspace root (`WORKSPACE_PATH`): the limit on every path the debugger reads, and where resource files live. */
export function workspaceRoot(): string {
  return process.env.WORKSPACE_PATH || process.cwd();
}

/**
 * The app root (`FASTEDGE_APP_ROOT`, default the workspace root): home of `.fastedge-debug/`
 * (port file, F5's `app.wasm`, the single-app config), the base of `<workspace>` paths and of the
 * default dotenv folder, and where the stores root search starts. An app root outside the
 * workspace root (as written or through a symlink) is ignored.
 */
export function appRoot(): string {
  const workspace = workspaceRoot();
  const app = process.env.FASTEDGE_APP_ROOT;
  if (!app) return workspace;
  // Inside both as written and through symlinks; a path that can't be resolved counts as outside.
  try {
    return inside(path.resolve(workspace), path.resolve(app)) && inside(realpathSync(workspace), realpathSync(app))
      ? path.resolve(app)
      : workspace;
  } catch {
    return workspace;
  }
}

function inside(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  return !(rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel));
}
