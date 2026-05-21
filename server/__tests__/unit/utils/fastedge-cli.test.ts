/**
 * fastedge-cli resolution tests
 *
 * Exercises `getPackageRoot` / `getBundledCliPaths` against synthetic package
 * layouts on disk. The walker is anchored on a package.json with name
 * "@gcoredev/fastedge-test", and these tests cover the layouts the resolver
 * must handle:
 *   - the installed npm layout (consumers import from dist/lib/ or
 *     dist/lib/test-framework/),
 *   - the in-repo source layout (server/utils/ → fastedge-run/),
 *   - workspace installs where a sibling package.json sits above ours,
 *   - intermediate package.json files written by the build (dist/lib/
 *     gets a `{ "type": "module" }` package.json from esbuild/bundle-lib.js)
 *     or otherwise non-matching / unreadable.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { platform, tmpdir } from "os";
import {
  getPackageRoot,
  getBundledCliPaths,
} from "../../../utils/fastedge-cli.js";

const PKG_NAME = "@gcoredev/fastedge-test";

async function writePkgJson(dir: string, body: object): Promise<void> {
  await writeFile(join(dir, "package.json"), JSON.stringify(body), "utf8");
}

function expectedBinaryName(): string {
  switch (platform()) {
    case "win32":
      return "fastedge-run.exe";
    case "darwin":
      return "fastedge-run-darwin-arm64";
    case "linux":
      return "fastedge-run-linux-x64";
    default:
      throw new Error(`Unsupported test platform: ${platform()}`);
  }
}

describe("fastedge-cli resolution", () => {
  let workdir: string;

  beforeEach(async () => {
    workdir = await mkdtemp(join(tmpdir(), "fastedge-cli-test-"));
  });

  afterEach(async () => {
    await rm(workdir, { recursive: true, force: true });
  });

  describe("getPackageRoot", () => {
    it("finds root from the runner entry (dist/lib/)", async () => {
      const root = join(workdir, "pkg");
      await mkdir(join(root, "dist", "lib"), { recursive: true });
      await writePkgJson(root, { name: PKG_NAME });

      expect(getPackageRoot(join(root, "dist", "lib"))).toBe(root);
    });

    it("finds root from the test-framework entry (dist/lib/test-framework/) — regression for the original two-level-deeper bug", async () => {
      const root = join(workdir, "pkg");
      await mkdir(join(root, "dist", "lib", "test-framework"), {
        recursive: true,
      });
      await writePkgJson(root, { name: PKG_NAME });
      // bundle-lib.js writes `{ "type": "module" }` into dist/lib/package.json.
      // The walker must skip this (no name) and keep going up.
      await writePkgJson(join(root, "dist", "lib"), { type: "module" });

      expect(getPackageRoot(join(root, "dist", "lib", "test-framework"))).toBe(
        root,
      );
    });

    it("finds root from the source tree (server/utils/)", async () => {
      const root = join(workdir, "pkg");
      await mkdir(join(root, "server", "utils"), { recursive: true });
      await writePkgJson(root, { name: PKG_NAME });

      expect(getPackageRoot(join(root, "server", "utils"))).toBe(root);
    });

    it("walks past a sibling package.json with a different name", async () => {
      // Simulates a workspace install where ours sits next to other packages
      // under a workspace root that itself has a package.json.
      const root = join(workdir, "ours");
      await mkdir(join(root, "dist", "lib", "test-framework"), {
        recursive: true,
      });
      await writePkgJson(root, { name: PKG_NAME });
      await writePkgJson(workdir, { name: "@other/workspace-root" });

      expect(getPackageRoot(join(root, "dist", "lib", "test-framework"))).toBe(
        root,
      );
    });

    it("walks past a non-JSON / unreadable package.json", async () => {
      const root = join(workdir, "pkg");
      await mkdir(join(root, "dist", "lib", "test-framework"), {
        recursive: true,
      });
      await writePkgJson(root, { name: PKG_NAME });
      // Garbage at an intermediate level must not abort the walk.
      await writeFile(
        join(root, "dist", "lib", "package.json"),
        "{ not valid json",
        "utf8",
      );

      expect(getPackageRoot(join(root, "dist", "lib", "test-framework"))).toBe(
        root,
      );
    });

    it("returns null when no matching package.json is found up to filesystem root", async () => {
      const dir = join(workdir, "no-pkg", "deep", "tree");
      await mkdir(dir, { recursive: true });

      expect(getPackageRoot(dir)).toBeNull();
    });

    it("does not anchor on a package.json with the wrong name even if it is the only one in the tree", async () => {
      // Defensive: a stray same-name dir from another vendor shouldn't trick us.
      const root = join(workdir, "lookalike");
      await mkdir(join(root, "dist", "fastedge-cli"), { recursive: true });
      await writePkgJson(root, { name: "@vendor/fastedge-test-fork" });

      expect(getPackageRoot(join(root, "dist"))).toBeNull();
    });

    it("inspects the startDir itself on the first iteration (package.json directly at startDir is found)", async () => {
      // Regression for the boundary case where the package root coincides
      // with the search start — the old `while (dir !== dirname(dir))` form
      // would skip the start dir if it were also the filesystem root.
      const root = join(workdir, "pkg");
      await mkdir(root, { recursive: true });
      await writePkgJson(root, { name: PKG_NAME });

      expect(getPackageRoot(root)).toBe(root);
    });

    it("terminates cleanly at the filesystem root without throwing", () => {
      // The walk must check the root dir itself (dirname('/') === '/' on POSIX,
      // dirname('C:\\') === 'C:\\' on Windows) and then break. Returns null
      // because no @gcoredev/fastedge-test package.json sits at FS root.
      const fsRoot = process.platform === "win32" ? "C:\\" : "/";
      expect(() => getPackageRoot(fsRoot)).not.toThrow();
      expect(getPackageRoot(fsRoot)).toBeNull();
    });
  });

  describe("getBundledCliPaths", () => {
    it("anchors candidates on the resolved package root for both layouts, with startDir-relative fallbacks appended", async () => {
      const root = join(workdir, "pkg");
      const startDir = join(root, "dist", "lib", "test-framework");
      await mkdir(startDir, { recursive: true });
      await writePkgJson(root, { name: PKG_NAME });

      const paths = getBundledCliPaths(startDir);
      const bin = expectedBinaryName();

      expect(paths).toEqual([
        // Package-root anchored
        join(root, "dist", "fastedge-cli", bin),
        join(root, "fastedge-run", bin),
        // startDir-relative fallback
        join(startDir, "fastedge-cli", bin),
        join(startDir, "..", "fastedge-cli", bin),
      ]);
    });

    it("yields the same candidates regardless of which export entry the caller starts from", async () => {
      // Both entries resolve to the same package root, but their startDir
      // differs — so the fallback portion differs, even though the
      // root-anchored portion is identical. Compare just the anchored slice.
      const root = join(workdir, "pkg");
      await mkdir(join(root, "dist", "lib", "test-framework"), {
        recursive: true,
      });
      await writePkgJson(root, { name: PKG_NAME });

      const fromRunner = getBundledCliPaths(join(root, "dist", "lib"));
      const fromTestFramework = getBundledCliPaths(
        join(root, "dist", "lib", "test-framework"),
      );

      // First two entries are the root-anchored candidates and must match.
      expect(fromTestFramework.slice(0, 2)).toEqual(fromRunner.slice(0, 2));
    });

    it("falls back to startDir-relative candidates when the package root cannot be located (VSCode bundle scenario)", async () => {
      // Simulates the VSCode extension layout: dist/server.js is copied into
      // the extension tree with dist/fastedge-cli/ as a sibling, but no
      // @gcoredev/fastedge-test package.json is anywhere up the parent chain.
      const bundleDir = join(workdir, "extension", "dist");
      await mkdir(join(bundleDir, "fastedge-cli"), { recursive: true });

      const paths = getBundledCliPaths(bundleDir);
      const bin = expectedBinaryName();

      // No root-anchored candidates (root not found) — only startDir-relative.
      expect(paths).toEqual([
        join(bundleDir, "fastedge-cli", bin),
        join(bundleDir, "..", "fastedge-cli", bin),
      ]);
    });

    it("returns startDir-relative candidates even when the directory layout has nothing in it (caller filters by existence)", async () => {
      // The function does not check existence — that's findFastEdgeRunCli's
      // job. So even a bare directory returns the two fallback paths; they
      // simply won't pass the existsSync filter downstream.
      const dir = join(workdir, "no-pkg");
      await mkdir(dir, { recursive: true });
      const bin = expectedBinaryName();

      expect(getBundledCliPaths(dir)).toEqual([
        join(dir, "fastedge-cli", bin),
        join(dir, "..", "fastedge-cli", bin),
      ]);
    });
  });
});
