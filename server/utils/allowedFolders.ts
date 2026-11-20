import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

/**
 * Allowed folders: folders outside the workspace the user lets the debugger read (never write),
 * each approved by the user once per server session. Configured only by the user
 * (`fastedge-debug --allow <dir>`, or the VS Code user setting the extension passes as
 * `FASTEDGE_ALLOWED_FOLDERS`); approved only through `requestApproval()` (utils/approval.ts),
 * never through the HTTP API.
 */

/** The error for a path outside the workspace and every allowed folder (names no path). */
export const OUTSIDE =
  "Path is outside the workspace root: move it inside, start the debugger for a folder that contains it, or add its folder to your allowed folders (VS Code setting fastedge.debugger.allowedFolders, or fastedge-debug --allow <dir>).";

/** A read needs the user's approval of `folder` first. */
export class ApprovalNeeded extends Error {
  constructor(readonly folder: string) {
    super(`Reading ${folder} (an allowed folder) needs your approval for this session.`);
  }
}

/** A configured folder as the user wrote it and as its real path (one folder, two spellings). */
type Folder = { given: string; real: string };
let configured: { from: string | undefined; folders: Folder[] } | null = null;
const approved = new Set<string>();
const refused = new Set<string>();

/** The configured folders; missing or relative entries are dropped. */
function allowedFolders(): Folder[] {
  const from = process.env.FASTEDGE_ALLOWED_FOLDERS;
  if (!configured || configured.from !== from) configured = { from, folders: parse(from) };
  return configured.folders;
}

function parse(value: string | undefined): Folder[] {
  if (!value) return [];
  let list: unknown;
  try {
    list = JSON.parse(value);
  } catch {
    console.warn("FASTEDGE_ALLOWED_FOLDERS is not a JSON array of folders: ignored");
    return [];
  }
  if (!Array.isArray(list)) return [];
  const folders: Folder[] = [];
  for (const entry of list) {
    if (typeof entry !== "string" || !path.isAbsolute(entry) || !existsSync(entry)) {
      console.warn(`Allowed folder ignored (not an existing absolute path): ${String(entry)}`);
      continue;
    }
    folders.push({ given: path.resolve(entry), real: realpathSync(entry) });
  }
  return folders;
}

function inside(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  return !(rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel));
}

/** The real path of `absolute`, or of its nearest existing ancestor (for a path not created yet). */
function realOrNearest(absolute: string): string {
  let probe = absolute;
  while (!existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) return absolute;
    probe = parent;
  }
  const real = realpathSync(probe);
  return probe === absolute ? real : path.join(real, path.relative(probe, absolute));
}

/**
 * The allowed folder holding `absolute` both as written and through symlinks (the same folder:
 * a link from the workspace into an allowed folder does not count), or null.
 */
export function allowedFolderOf(absolute: string): string | null {
  const real = realOrNearest(absolute);
  const matches = allowedFolders().filter(
    (f) => (inside(f.given, absolute) || inside(f.real, absolute)) && inside(f.real, real),
  );
  // Overlapping folders: an approved one, else one not refused, else any (its refusal is the answer).
  const folder = matches.find((f) => approved.has(f.real)) ?? matches.find((f) => !refused.has(f.real)) ?? matches[0];
  return folder?.real ?? null;
}

/** Throws unless `absolute` lies in an allowed folder the user approved this session. */
export function checkAllowedRead(absolute: string): void {
  const folder = allowedFolderOf(absolute);
  if (!folder) throw new Error(OUTSIDE);
  if (approved.has(folder)) return;
  if (refused.has(folder)) throw new Error(`Reading ${folder} was refused for this session.`);
  throw new ApprovalNeeded(folder);
}

let approvedListener: ((folder: string) => void) | null = null;

/** Called once for each folder the user approves (the server broadcasts it to the page). */
export function onFolderApproved(listener: (folder: string) => void): void {
  approvedListener = listener;
}

export function recordApproval(folder: string, granted: boolean): void {
  (granted ? approved : refused).add(folder);
  if (granted) approvedListener?.(folder);
}

/** The folders approved this session (shown on the page). */
export function approvedFolders(): string[] {
  return [...approved];
}

export type FolderState = "approved" | "refused" | "not asked";

/**
 * The configured allowed folders (real paths) outside `workspaceRoot`, and whether the user
 * approved each this session. One in the workspace is not listed: the workspace is readable anyway.
 */
export function allowedFolderStates(workspaceRoot: string): { folder: string; state: FolderState }[] {
  const root = existsSync(workspaceRoot) ? realpathSync(workspaceRoot) : workspaceRoot;
  return allowedFolders().filter(({ real }) => !inside(root, real)).map(({ real }) => ({
    folder: real,
    state: approved.has(real) ? "approved" : refused.has(real) ? "refused" : "not asked",
  }));
}
