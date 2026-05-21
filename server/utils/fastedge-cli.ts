/**
 * FastEdge CLI Discovery Utility
 *
 * Discovers the FastEdge-run CLI binary in the following order:
 * 1. FASTEDGE_RUN_PATH environment variable
 * 2. Bundled binary inside the @gcoredev/fastedge-test package, anchored on
 *    the package root (see getPackageRoot):
 *      • dist/fastedge-cli/<binary>   — published npm layout
 *      • fastedge-run/<binary>        — in-repo source/dev layout
 * 3. PATH (using 'which' or 'where' command)
 */

import { execSync } from "child_process";
import { existsSync, chmodSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import os from "os";

// ESM-compatible equivalent of __dirname.
// esbuild transforms import.meta.url correctly for both ESM and CJS output
// via a banner shim (__importMetaUrl). `tsc` type-checks under CommonJS and
// doesn't know about the esbuild transform, so suppress the TS1343 error here.
// @ts-ignore TS1343 — import.meta.url is handled by esbuild, not tsc.
const _currentDir = dirname(fileURLToPath(import.meta.url));

/**
 * Get the CLI binary filename for the current platform
 */
function getCliBinaryName(): string {
  switch (os.platform()) {
    case "win32":
      return "fastedge-run.exe";
    case "darwin":
      return "fastedge-run-darwin-arm64";
    case "linux":
      return "fastedge-run-linux-x64";
    default:
      throw new Error(`Unsupported platform: ${os.platform()}`);
  }
}

/**
 * Walk up from `startDir` until a package.json with name "@gcoredev/fastedge-test"
 * is found. Anchoring on the package name (rather than hardcoded depths or an
 * unbounded walk) keeps the search robust across bundle layouts and avoids
 * climbing into a sibling package in workspace/monorepo installs.
 *
 * `startDir` defaults to the directory of this file (resolved at module load).
 * It is overridable for tests so the resolver can be exercised against
 * synthetic package layouts.
 */
export function getPackageRoot(startDir: string = _currentDir): string | null {
  let dir = startDir;
  while (dir !== dirname(dir)) {
    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
        if (pkg.name === "@gcoredev/fastedge-test") return dir;
      } catch {
        // Unreadable or non-JSON — keep walking
      }
    }
    dir = dirname(dir);
  }
  return null;
}

/**
 * Get possible bundled CLI paths.
 *
 * Two resolution modes, both contribute candidates:
 *
 *  1. **Package-root anchored** (primary) — when a `@gcoredev/fastedge-test`
 *     package.json can be located via `getPackageRoot`, candidates resolve
 *     against it: the published npm layout (`dist/fastedge-cli/`) and the
 *     in-repo source layout (`fastedge-run/`).
 *
 *  2. **startDir-relative fallback** — covers bundle layouts that ship
 *     without our package.json available nearby. Notably the VSCode extension
 *     copies `dist/server.js` and `dist/fastedge-cli/` into its own tree, so
 *     the walker can't anchor on our package root. The fallback lets the
 *     server bundle locate the sibling `fastedge-cli/` directory directly.
 *
 * `findFastEdgeRunCli` filters by existence, so listing extra candidates is
 * safe — the first one that actually exists wins. `startDir` is overridable
 * for tests.
 */
export function getBundledCliPaths(startDir: string = _currentDir): string[] {
  const binaryName = getCliBinaryName();
  const candidates: string[] = [];

  // Primary: anchor on our package.json.
  const root = getPackageRoot(startDir);
  if (root) {
    candidates.push(
      join(root, "dist", "fastedge-cli", binaryName),
      join(root, "fastedge-run", binaryName),
    );
  }

  // Fallback: startDir-relative candidates for bundles without our
  // package.json nearby (e.g. the VSCode extension's copy of dist/server.js
  // sitting next to dist/fastedge-cli/).
  candidates.push(
    join(startDir, "fastedge-cli", binaryName),
    join(startDir, "..", "fastedge-cli", binaryName),
  );

  return candidates;
}

/**
 * Ensure the binary has execute permission on Unix.
 * VSIX packaging (ZIP) strips Unix permissions, so bundled binaries may
 * arrive without +x after VSCode installs the extension.
 */
function ensureExecutable(binaryPath: string): void {
  if (process.platform !== "win32") {
    try {
      chmodSync(binaryPath, 0o755);
    } catch {
      // Best-effort — if chmod fails (e.g. read-only FS) the spawn will fail
      // with a clearer error than a silent permission denied
    }
  }
}

/**
 * Find the FastEdge-run CLI binary
 * @returns The absolute path to the fastedge-run binary
 * @throws Error if the CLI is not found
 */
export async function findFastEdgeRunCli(): Promise<string> {
  // 1. Check FASTEDGE_RUN_PATH environment variable
  const envPath = process.env.FASTEDGE_RUN_PATH;
  if (envPath) {
    if (existsSync(envPath)) {
      ensureExecutable(envPath);
      return envPath;
    } else {
      throw new Error(
        `FASTEDGE_RUN_PATH is set to "${envPath}" but the file does not exist`,
      );
    }
  }

  // 2. Check for bundled binary (multiple possible locations)
  for (const bundledPath of getBundledCliPaths()) {
    if (existsSync(bundledPath)) {
      ensureExecutable(bundledPath);
      return bundledPath;
    }
  }

  // 3. Check PATH using 'which' (Unix) or 'where' (Windows)
  try {
    const command =
      process.platform === "win32"
        ? "where fastedge-run"
        : "which fastedge-run";
    const result = execSync(command, { encoding: "utf8" }).trim();

    // On Windows, 'where' can return multiple lines; take the first
    const firstPath = result.split("\n")[0].trim();

    if (firstPath && existsSync(firstPath)) {
      return firstPath;
    }
  } catch (error) {
    // Command failed (binary not in PATH)
  }

  // Not found anywhere
  throw new Error(
    "fastedge-run CLI not found in any of these locations:\n" +
      "  1. FASTEDGE_RUN_PATH environment variable\n" +
      "  2. Bundled inside the @gcoredev/fastedge-test package " +
      "(dist/fastedge-cli/<binary> when installed, fastedge-run/<binary> in the source tree)\n" +
      "  3. System PATH (which/where fastedge-run)\n\n" +
      "To fix this:\n" +
      "  - Set FASTEDGE_RUN_PATH to a fastedge-run binary you have locally, or\n" +
      "  - Install fastedge-run in PATH: cargo install fastedge-run, or\n" +
      "  - Reinstall @gcoredev/fastedge-test to restore the bundled binary " +
      "(or, when developing this repo, place the platform binary in fastedge-run/)",
  );
}

/**
 * Verify the FastEdge-run CLI is functional
 * @param cliPath Path to the CLI binary
 * @returns true if the CLI is functional
 */
export async function verifyFastEdgeRunCli(cliPath: string): Promise<boolean> {
  try {
    execSync(`"${cliPath}" --version`, { encoding: "utf8", timeout: 5000 });
    return true;
  } catch (error) {
    return false;
  }
}
