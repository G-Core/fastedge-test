/**
 * FastEdge CLI Discovery Utility
 *
 * Discovers the FastEdge-run CLI binary in the following order:
 * 1. FASTEDGE_RUN_PATH environment variable
 * 2. Bundled binary in server/fastedge-cli/ (platform-specific)
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
 * Walk up from _currentDir until a package.json with name "@gcoredev/fastedge-test"
 * is found. Anchoring on the package name (rather than hardcoded depths or an
 * unbounded walk) keeps the search robust across bundle layouts and avoids
 * climbing into a sibling package in workspace/monorepo installs.
 */
function getPackageRoot(): string | null {
  let dir = _currentDir;
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
 * Returns paths relative to the resolved package root, covering both the
 * published layout (dist/fastedge-cli/) and the in-repo source layout
 * (fastedge-run/).
 */
function getBundledCliPaths(): string[] {
  const binaryName = getCliBinaryName();
  const root = getPackageRoot();
  if (!root) return [];

  return [
    // Installed npm package
    join(root, "dist", "fastedge-cli", binaryName),
    // Development/source tree
    join(root, "fastedge-run", binaryName),
  ];
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
      "  2. Bundled binary in fastedge-cli/ (project root)\n" +
      "  3. System PATH\n\n" +
      "To fix this:\n" +
      "  - Set FASTEDGE_RUN_PATH environment variable, or\n" +
      "  - Install fastedge-run in PATH: cargo install fastedge-run, or\n" +
      "  - Place the binary in fastedge-cli/ at project root (platform-specific filename)",
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
