import fs from "fs/promises";
import { realpathSync } from "fs";
import { ApprovalNeeded, checkAllowedRead } from "./allowedFolders.js";
import path from "path";
import type { FastEdgeConfig, SecretWithTimestamp } from "../fastedge-host/types.js";

/**
 * Parse a .env file content into key-value pairs
 */
function parseDotenv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split("\n");

  for (const line of lines) {
    // Skip empty lines and comments
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    // Parse KEY=VALUE
    const equalIndex = trimmed.indexOf("=");
    if (equalIndex === -1) {
      continue;
    }

    const key = trimmed.substring(0, equalIndex).trim();
    let value = trimmed.substring(equalIndex + 1).trim();

    // Remove quotes if present
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.substring(1, value.length - 1);
    }

    result[key] = value;
  }

  return result;
}

/**
 * Load dotenv files and return FastEdge configuration.
 * Matches fastedge-run (FastEdge-lib src/dotenv.rs), which HTTP apps use:
 * - .env: FASTEDGE_VAR_SECRET_ -> secret, FASTEDGE_VAR_ENV_ -> env var,
 *   unprefixed -> env var, any other FASTEDGE_VAR_ key -> skipped. A repeated
 *   prefix is stripped in full, like Rust's trim_start_matches
 * - .env.secrets / .env.variables: no prefix; FASTEDGE_VAR_ keys are skipped
 * - .env is read first; later files only fill keys that are not set yet
 * - secret keys `NAME@SLOT` are slots of secret NAME (see secretSlots)
 */
function setIfAbsent(target: Record<string, string>, key: string, value: string): void {
  if (!Object.hasOwn(target, key)) target[key] = value;
}

function fillUnprefixed(target: Record<string, string>, parsed: Record<string, string>): void {
  for (const [key, value] of Object.entries(parsed)) {
    if (!key.startsWith("FASTEDGE_VAR_")) setIfAbsent(target, key, value);
  }
}

export async function loadDotenvFiles(
  dotenvPath: string = ".",
): Promise<FastEdgeConfig> {
  const secrets: Record<string, string> = {};
  const dictionary: Record<string, string> = {};

  // Resolve the directory's real path once to detect symlink escapes on individual
  // files below. A workspace can plant e.g. `.env.secrets -> ~/.aws/credentials`.
  let realBase: string | null = null;
  try { realBase = realpathSync(dotenvPath); } catch { /* base not yet created — OK */ }

  function fileContained(filePath: string): boolean {
    if (!realBase) return true; // base absent — file won't exist either
    try {
      const real = realpathSync(filePath);
      return real === realBase || real.startsWith(realBase + path.sep);
    } catch {
      return true; // file does not exist — caller's catch handles the read failure
    }
  }

  // Load .env with prefixes
  const envPath = path.join(dotenvPath, ".env");
  if (fileContained(envPath)) {
    try {
      const envContent = await fs.readFile(envPath, "utf-8");
      const parsed = parseDotenv(envContent);

      for (const [key, value] of Object.entries(parsed)) {
        if (key.startsWith("FASTEDGE_VAR_SECRET_")) {
          setIfAbsent(secrets, key.replace(/^(?:FASTEDGE_VAR_SECRET_)+/, ""), value);
        } else if (key.startsWith("FASTEDGE_VAR_ENV_")) {
          setIfAbsent(dictionary, key.replace(/^(?:FASTEDGE_VAR_ENV_)+/, ""), value);
        } else if (!key.startsWith("FASTEDGE_VAR_")) {
          setIfAbsent(dictionary, key, value);
        }
      }
    } catch (error) {
      // .env file not found or not readable - this is OK
    }
  }

  // Load .env.secrets (no prefix)
  const secretsPath = path.join(dotenvPath, ".env.secrets");
  if (fileContained(secretsPath)) {
    try {
      const secretsContent = await fs.readFile(secretsPath, "utf-8");
      fillUnprefixed(secrets, parseDotenv(secretsContent));
    } catch (error) {
      // .env.secrets not found - this is OK
    }
  }

  // Load .env.variables (no prefix)
  const variablesPath = path.join(dotenvPath, ".env.variables");
  if (fileContained(variablesPath)) {
    try {
      const variablesContent = await fs.readFile(variablesPath, "utf-8");
      fillUnprefixed(dictionary, parseDotenv(variablesContent));
    } catch (error) {
      // .env.variables not found - this is OK
    }
  }

  return { secrets: secretSlots(secrets), dictionary };
}

/** A secret key that is not a valid slot: the app does not load, as fastedge-run does not start. */
export class SecretSlotError extends Error {}

const MAX_SLOT = 2n ** 64n - 1n;

/**
 * Secret slots, as on the edge (`secret_slots` in the API) and in fastedge-run: `NAME@SLOT` is slot
 * SLOT of secret NAME, a positive integer in plain digits; a bare `NAME` is slot 0. Each slot has
 * one spelling (no `@0`, no leading zeros), so the files' per-key precedence is per-slot
 * precedence; any other form throws. A name without slots stays a plain value (slot 0 is
 * effective at every time).
 */
export function secretSlots(raw: Record<string, string>): Record<string, string | SecretWithTimestamp[]> {
  const slots: Record<string, SecretWithTimestamp[]> = {};
  for (const [key, value] of Object.entries(raw)) {
    const at = key.indexOf("@");
    const name = at === -1 ? key : key.slice(0, at);
    const digits = at === -1 ? "0" : key.slice(at + 1);
    if (!name) throw new SecretSlotError(`secret ${key}: no name before '@'`);
    if (at !== -1 && !(/^[1-9][0-9]*$/.test(digits) && BigInt(digits) <= MAX_SLOT)) {
      throw new SecretSlotError(
        `secret ${key}: write slot 0 as a bare \`${name}\`, and other slots as \`${name}@N\` with N a positive integer`,
      );
    }
    // ponytail: Number() rounds slots above 2^53, but a lookup's time is a u32, so such a slot is
    // never effective anyway; keep them as BigInt if slots ever become readable by the app.
    (slots[name] ??= []).push({ value, effectiveAt: Number(digits) });
  }
  return Object.fromEntries(
    Object.entries(slots).map(([name, list]) => [name, list.length === 1 && list[0].effectiveAt === 0 ? list[0].value : list]),
  );
}

/**
 * Check if any dotenv files exist in the specified path
 */
export async function hasDotenvFiles(
  dotenvPath: string = ".",
): Promise<boolean> {
  const files = [".env", ".env.secrets", ".env.variables"];

  for (const file of files) {
    try {
      await fs.access(path.join(dotenvPath, file));
      return true;
    } catch {
      // File doesn't exist, continue
    }
  }

  return false;
}

/** Thrown when a dotenv path escapes the workspace root. Routes catch this to return 400. */
export class DotenvPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DotenvPathError";
  }
}

/** Walk up to the nearest existing ancestor to get a real path we can compare. */
function realpathOrNearest(p: string): string {
  let dir = p;
  while (true) {
    try {
      return realpathSync(dir);
    } catch {
      const parent = path.dirname(dir);
      if (parent === dir) throw new Error(`Cannot resolve real path for: ${p}`);
      dir = parent;
    }
  }
}

/**
 * Check that none of the expected dotenv files inside dotenvPath are symlinks
 * pointing outside the directory. Throws DotenvPathError if one escapes.
 * Called before passing the directory to an external runner (e.g. fastedge-run)
 * that reads the files itself without going through loadDotenvFiles().
 */
export function validateDotenvLeafs(dotenvPath: string): void {
  let realBase: string;
  try { realBase = realpathSync(dotenvPath); } catch { return; } // directory absent — nothing to load

  // Full set consumed by fastedge-run (its dotenv loader)
  for (const name of [".env", ".env.secrets", ".env.variables", ".env.req_headers", ".env.rsp_headers", ".env.kv_stores"]) {
    const filePath = path.join(dotenvPath, name);
    try {
      const real = realpathSync(filePath);
      if (real !== realBase && !real.startsWith(realBase + path.sep)) {
        throw new DotenvPathError(
          `dotenv file '${name}' is a symlink outside the server workspace (${dotenvPath}). ` +
          `Start the server from your project directory, or use --project-dir <path>.`,
        );
      }
    } catch (e) {
      if (e instanceof DotenvPathError) throw e;
      // File does not exist — OK
    }
  }
}

/**
 * Resolve a potentially relative dotenv path against `base` to an absolute path, and verify it
 * is contained under `limit` (the workspace root; default `base`). Throws DotenvPathError if the
 * resolved path escapes it — this includes symlinks that point outside.
 * Returns undefined for falsy input.
 */
export function resolveDotenvPath(
  dotenvPath: string | undefined,
  base: string,
  limit: string = base,
  allowedFolders = false,
): string | undefined {
  if (!dotenvPath) return undefined;
  const resolved = path.isAbsolute(dotenvPath)
    ? dotenvPath
    : path.resolve(base, dotenvPath);
  try {
    return checkDotenvContainment(resolved, limit);
  } catch (error) {
    if (!(error instanceof DotenvPathError) || !allowedFolders) throw error;
    // Outside the workspace: an approved allowed folder may still be read.
    try {
      checkAllowedRead(resolved);
    } catch (allowedError) {
      if (allowedError instanceof ApprovalNeeded) throw allowedError;
      throw new DotenvPathError((allowedError as Error).message);
    }
    return resolved;
  }
}

function checkDotenvContainment(resolved: string, limit: string): string {

  // Lexical containment check (fast path, handles .. traversal)
  const rel = path.relative(limit, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new DotenvPathError(
      `dotenv path is outside the server workspace (${limit}). ` +
      `Start the server from your project directory, or use --project-dir <path>.`,
    );
  }

  // Realpath check: resolve symlinks to detect escapes through links inside the workspace
  try {
    const realBase = realpathSync(limit);
    const realResolved = realpathOrNearest(resolved);
    if (realResolved !== realBase && !realResolved.startsWith(realBase + path.sep)) {
      throw new DotenvPathError(
      `dotenv path is outside the server workspace (${limit}). ` +
      `Start the server from your project directory, or use --project-dir <path>.`,
    );
    }
  } catch (e) {
    if (e instanceof DotenvPathError) throw e;
    // base doesn't exist (fresh workspace) — lexical check above is sufficient
  }

  return resolved;
}
