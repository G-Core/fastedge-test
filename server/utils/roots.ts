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
 * workspace root is ignored.
 */
export function appRoot(): string {
  const workspace = workspaceRoot();
  const app = process.env.FASTEDGE_APP_ROOT;
  if (!app) return workspace;
  const rel = path.relative(path.resolve(workspace), path.resolve(app));
  return rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel) ? workspace : path.resolve(app);
}
