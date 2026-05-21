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
import { tmpdir } from "os";
import os from "os";
import {
  getPackageRoot,
  getBundledCliPaths,
} from "../../../utils/fastedge-cli.js";

const PKG_NAME = "@gcoredev/fastedge-test";

async function writePkgJson(dir: string, body: object): Promise<void> {
  await writeFile(join(dir, "package.json"), JSON.stringify(body), "utf8");
}

function expectedBinaryName(): string {
  switch (os.platform()) {
    case "win32":
      return "fastedge-run.exe";
    case "darwin":
      return "fastedge-run-darwin-arm64";
    case "linux":
      return "fastedge-run-linux-x64";
    default:
      throw new Error(`Unsupported test platform: ${os.platform()}`);
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
  });

  describe("getBundledCliPaths", () => {
    it("anchors candidates on the resolved package root for both layouts", async () => {
      const root = join(workdir, "pkg");
      await mkdir(join(root, "dist", "lib", "test-framework"), {
        recursive: true,
      });
      await writePkgJson(root, { name: PKG_NAME });

      const paths = getBundledCliPaths(
        join(root, "dist", "lib", "test-framework"),
      );
      const bin = expectedBinaryName();

      expect(paths).toEqual([
        join(root, "dist", "fastedge-cli", bin),
        join(root, "fastedge-run", bin),
      ]);
    });

    it("yields the same candidates regardless of which export entry the caller starts from", async () => {
      const root = join(workdir, "pkg");
      await mkdir(join(root, "dist", "lib", "test-framework"), {
        recursive: true,
      });
      await writePkgJson(root, { name: PKG_NAME });

      const fromRunner = getBundledCliPaths(join(root, "dist", "lib"));
      const fromTestFramework = getBundledCliPaths(
        join(root, "dist", "lib", "test-framework"),
      );

      expect(fromTestFramework).toEqual(fromRunner);
    });

    it("returns an empty list when the package root cannot be located", async () => {
      const dir = join(workdir, "no-pkg");
      await mkdir(dir, { recursive: true });

      expect(getBundledCliPaths(dir)).toEqual([]);
    });
  });
});
