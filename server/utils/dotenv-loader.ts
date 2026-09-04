import fs from "fs/promises";
import { realpathSync } from "fs";
import path from "path";
import type { FastEdgeConfig } from "../fastedge-host/types.js";

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
 * Load dotenv files and return FastEdge configuration
 * Supports:
 * - .env with FASTEDGE_VAR_SECRET_ and FASTEDGE_VAR_ENV_ prefixes
 * - .env.secrets (no prefix needed)
 * - .env.variables (no prefix needed)
 */
export async function loadDotenvFiles(
  dotenvPath: string = ".",
): Promise<FastEdgeConfig> {
  const secrets: Record<string, string> = {};
  const dictionary: Record<string, string> = {};

  // Load .env with prefixes
  const envPath = path.join(dotenvPath, ".env");
  try {
    const envContent = await fs.readFile(envPath, "utf-8");
    const parsed = parseDotenv(envContent);

    for (const [key, value] of Object.entries(parsed)) {
      if (key.startsWith("FASTEDGE_VAR_SECRET_")) {
        const secretKey = key.replace("FASTEDGE_VAR_SECRET_", "");
        secrets[secretKey] = value;
      } else if (key.startsWith("FASTEDGE_VAR_ENV_")) {
        const dictKey = key.replace("FASTEDGE_VAR_ENV_", "");
        dictionary[dictKey] = value;
      }
    }
  } catch (error) {
    // .env file not found or not readable - this is OK
  }

  // Load .env.secrets (no prefix)
  const secretsPath = path.join(dotenvPath, ".env.secrets");
  try {
    const secretsContent = await fs.readFile(secretsPath, "utf-8");
    const parsed = parseDotenv(secretsContent);
    Object.assign(secrets, parsed);
  } catch (error) {
    // .env.secrets not found - this is OK
  }

  // Load .env.variables (no prefix)
  const variablesPath = path.join(dotenvPath, ".env.variables");
  try {
    const variablesContent = await fs.readFile(variablesPath, "utf-8");
    const parsed = parseDotenv(variablesContent);
    Object.assign(dictionary, parsed);
  } catch (error) {
    // .env.variables not found - this is OK
  }

  return { secrets, dictionary };
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
 * Resolve a potentially relative dotenv path to an absolute path, and verify it
 * is contained under `base` (the workspace root). Throws DotenvPathError if the
 * resolved path escapes the workspace — this includes symlinks that point outside.
 * Returns undefined for falsy input.
 */
export function resolveDotenvPath(
  dotenvPath: string | undefined,
  base: string,
): string | undefined {
  if (!dotenvPath) return undefined;
  const resolved = path.isAbsolute(dotenvPath)
    ? dotenvPath
    : path.resolve(base, dotenvPath);

  // Lexical containment check (fast path, handles .. traversal)
  const rel = path.relative(base, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new DotenvPathError(`dotenv path must be within workspace`);
  }

  // Realpath check: resolve symlinks to detect escapes through links inside the workspace
  try {
    const realBase = realpathSync(base);
    const realResolved = realpathOrNearest(resolved);
    if (realResolved !== realBase && !realResolved.startsWith(realBase + path.sep)) {
      throw new DotenvPathError(`dotenv path must be within workspace`);
    }
  } catch (e) {
    if (e instanceof DotenvPathError) throw e;
    // base doesn't exist (fresh workspace) — lexical check above is sufficient
  }

  return resolved;
}
