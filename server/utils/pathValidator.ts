import { resolve, normalize, relative, isAbsolute, sep } from "path";
import { existsSync, statSync, realpathSync, lstatSync } from "fs";
import { ApprovalNeeded, checkAllowedRead } from "./allowedFolders.js";

/**
 * Options for path validation
 */
export interface PathValidationOptions {
  /**
   * Restrict paths to within this workspace root directory.
   * If provided, paths outside this directory will be rejected.
   */
  workspaceRoot?: string;

  /**
   * Allow absolute paths. Default: true
   */
  allowAbsolute?: boolean;

  /**
   * Require .wasm extension. Default: true
   */
  requireWasmExtension?: boolean;

  /**
   * Check if file exists. Default: true
   */
  checkExists?: boolean;

  /**
   * A read: a path outside `workspaceRoot` may lie in an allowed folder the user approved
   * (utils/allowedFolders.ts). Never set it for a write. Default: false
   */
  allowedFolders?: boolean;
}

/**
 * Result of path validation
 */
export interface PathValidationResult {
  valid: boolean;
  error?: string;
  /** The allowed folder the user must approve before this read. */
  approvalNeeded?: string;
  normalizedPath?: string;
}

/**
 * Dangerous system paths to block access to
 */
const DANGEROUS_PATHS = [
  // Unix system directories
  "/etc",
  "/sys",
  "/proc",
  "/dev",
  "/boot",
  "/root",
  // Windows system directories
  "C:\\Windows",
  "C:\\Program Files",
  "C:\\Program Files (x86)",
  "C:\\ProgramData",
  // Common sensitive directories
  ".ssh",
  ".aws",
  ".kube",
  "node_modules",
];

const OUTSIDE =
  "Path is outside the workspace root: move it inside, or start the debugger for a folder that contains it.";

/**
 * Inside the workspace root both as written and through symlinks (for a path not created yet, its
 * nearest existing ancestor). A dangling symlink counts as outside: writing it creates its target,
 * wherever that is. If real paths can't be resolved (e.g. a missing root), the lexical check decides.
 */
function insideWorkspace(absolutePath: string, workspaceRoot: string): boolean {
  const resolvedWorkspaceRoot = resolve(workspaceRoot);
  const relativePath = relative(resolvedWorkspaceRoot, absolutePath);
  if (relativePath === ".." || relativePath.startsWith(".." + sep) || isAbsolute(relativePath)) return false;
  try {
    const realRoot = realpathSync(resolvedWorkspaceRoot);
    let probe = absolutePath;
    while (!existsSync(probe)) {
      if (lstatSync(probe, { throwIfNoEntry: false })?.isSymbolicLink()) return false;
      const parent = resolve(probe, "..");
      if (parent === probe) break;
      probe = parent;
    }
    const realProbe = realpathSync(probe);
    return realProbe === realRoot || realProbe.startsWith(realRoot + sep);
  } catch {
    return true;
  }
}

/**
 * Validates a file path for security and accessibility.
 * Prevents path traversal attacks and access to sensitive system files.
 *
 * @param inputPath - The path to validate
 * @param options - Validation options
 * @returns Validation result with normalized path if valid
 */
export function validatePath(
  inputPath: string,
  options: PathValidationOptions = {},
): PathValidationResult {
  const {
    workspaceRoot,
    allowAbsolute = true,
    requireWasmExtension = true,
    checkExists = true,
  } = options;

  // Check for null/undefined/empty
  if (!inputPath || typeof inputPath !== "string") {
    return {
      valid: false,
      error: "Path is required and must be a string",
    };
  }

  // Normalize to handle ../, ./, etc and resolve to absolute path
  const normalizedPath = normalize(inputPath);
  const absolutePath = resolve(normalizedPath);

  // Check absolute path restriction
  if (!allowAbsolute && isAbsolute(inputPath)) {
    return {
      valid: false,
      error: "Absolute paths are not allowed",
    };
  }

  // Check workspace root restriction
  if (workspaceRoot && !insideWorkspace(absolutePath, workspaceRoot)) {
    if (!options.allowedFolders) return { valid: false, error: OUTSIDE };
    try {
      checkAllowedRead(absolutePath);
    } catch (error) {
      return error instanceof ApprovalNeeded
        ? { valid: false, error: error.message, approvalNeeded: error.folder }
        : { valid: false, error: (error as Error).message };
    }
  }

  // Check for dangerous paths. Matching is segment-aware: an absolute dangerous
  // path must equal or be a prefix of the candidate (with a separator boundary);
  // a relative segment must appear as a complete path component, not a substring.
  // This prevents both false positives (/etcetera matching /etc) and bypasses.
  for (const dangerousPath of DANGEROUS_PATHS) {
    const normalizedDangerous = normalize(dangerousPath);
    if (isAbsolute(normalizedDangerous)) {
      if (
        absolutePath === normalizedDangerous ||
        absolutePath.startsWith(normalizedDangerous + sep)
      ) {
        return {
          valid: false,
          error: `Access to system path '${dangerousPath}' is not allowed`,
        };
      }
    } else if (normalizedDangerous.includes("\\")) {
      // Windows-style path in the list (backslash separator): on Linux these
      // resolve to literal filenames, so use a simple substring check.
      if (absolutePath.includes(normalizedDangerous)) {
        return {
          valid: false,
          error: `Access to system path '${dangerousPath}' is not allowed`,
        };
      }
    } else {
      if (
        absolutePath.includes(sep + normalizedDangerous + sep) ||
        absolutePath.endsWith(sep + normalizedDangerous)
      ) {
        return {
          valid: false,
          error: `Access to system path '${dangerousPath}' is not allowed`,
        };
      }
    }
  }

  // Check .wasm extension
  if (requireWasmExtension && !normalizedPath.toLowerCase().endsWith(".wasm")) {
    return {
      valid: false,
      error: "File must have .wasm extension",
    };
  }

  // Check if file exists
  if (checkExists) {
    if (!existsSync(absolutePath)) {
      return {
        valid: false,
        error: "File not found",
      };
    }

    // Check if it's actually a file (not a directory)
    try {
      const stats = statSync(absolutePath);
      if (!stats.isFile()) {
        return {
          valid: false,
          error: "Path is not a file",
        };
      }
    } catch (error) {
      return {
        valid: false,
        error: `Cannot access file: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  return {
    valid: true,
    normalizedPath: absolutePath,
  };
}

/**
 * Convenience function that throws an error if path is invalid.
 * Use this when you want to fail fast on invalid paths.
 *
 * @param inputPath - The path to validate
 * @param options - Validation options
 * @returns The normalized absolute path
 * @throws Error if path is invalid
 */
export function validatePathOrThrow(
  inputPath: string,
  options: PathValidationOptions = {},
): string {
  const result = validatePath(inputPath, options);

  if (result.approvalNeeded) throw new ApprovalNeeded(result.approvalNeeded);
  if (!result.valid) {
    throw new Error(result.error || "Invalid path");
  }

  return result.normalizedPath!;
}

/**
 * Checks if a path is safe without throwing.
 * Useful for quick validation checks.
 *
 * @param inputPath - The path to check
 * @param options - Validation options
 * @returns true if path is safe, false otherwise
 */
export function isPathSafe(
  inputPath: string,
  options: PathValidationOptions = {},
): boolean {
  return validatePath(inputPath, options).valid;
}
