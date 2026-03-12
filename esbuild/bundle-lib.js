/**
 * Bundle the runner library for npm publishing as @gcoredev/fastedge-test
 *
 * Produces:
 *   dist/lib/index.js                  — ESM bundle  (. entry)
 *   dist/lib/index.cjs                 — CJS bundle  (. entry)
 *   dist/lib/test-framework/index.js   — ESM bundle  (./test entry)
 *   dist/lib/test-framework/index.cjs  — CJS bundle  (./test entry)
 *   dist/lib/**\/*.d.ts                 — TypeScript declarations (via tsc -p tsconfig.lib.json)
 *
 * Location: esbuild/bundle-lib.js
 */

const esbuild = require("esbuild");
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");

const projectRoot = path.join(__dirname, "..");
const distLibDir = path.join(projectRoot, "dist", "lib");
const entryPoint = path.join(projectRoot, "server", "runner", "index.ts");
const testFrameworkEntry = path.join(projectRoot, "server", "test-framework", "index.ts");
const distTestFrameworkDir = path.join(distLibDir, "test-framework");

// All Node.js built-in modules to mark external
const nodeBuiltins = [
  "node:fs", "node:path", "node:os", "node:util", "node:stream",
  "node:events", "node:crypto", "node:buffer", "node:url", "node:http",
  "node:https", "node:net", "node:tls", "node:child_process", "node:worker_threads",
  "fs", "path", "os", "util", "stream", "events", "crypto", "buffer",
  "url", "http", "https", "net", "tls", "child_process", "worker_threads",
  "module", "assert", "readline", "v8", "vm",
];

async function buildLib() {
  console.log("📦 Building runner + test-framework library (ESM + CJS)...");

  if (!fs.existsSync(distLibDir)) {
    fs.mkdirSync(distLibDir, { recursive: true });
  }
  if (!fs.existsSync(distTestFrameworkDir)) {
    fs.mkdirSync(distTestFrameworkDir, { recursive: true });
  }

  const sharedConfig = {
    bundle: true,
    platform: "node",
    target: "node20",
    external: [
      ...nodeBuiltins,
      // All npm dependencies are external — consumers install their own
      "express",
      "ws",
      "zod",
      "immer",
    ],
    logLevel: "info",
  };

  // Shim import.meta.url for CJS bundles so that code using it (e.g. fileURLToPath)
  // works correctly at runtime.  __filename is available in all CJS contexts.
  const cjsImportMetaShim = {
    banner: { js: "var __importMetaUrl = require('url').pathToFileURL(__filename).href;" },
    define: { "import.meta.url": "__importMetaUrl" },
  };

  try {
    // ── Runner entry (.) ──────────────────────────────────────────────────────
    await esbuild.build({
      ...sharedConfig,
      entryPoints: [entryPoint],
      format: "esm",
      outfile: path.join(distLibDir, "index.js"),
    });
    console.log("✅ ESM build: dist/lib/index.js");

    await esbuild.build({
      ...sharedConfig,
      ...cjsImportMetaShim,
      entryPoints: [entryPoint],
      format: "cjs",
      outfile: path.join(distLibDir, "index.cjs"),
    });
    console.log("✅ CJS build: dist/lib/index.cjs");

    // ── Test framework entry (./test) ─────────────────────────────────────────
    await esbuild.build({
      ...sharedConfig,
      entryPoints: [testFrameworkEntry],
      format: "esm",
      outfile: path.join(distTestFrameworkDir, "index.js"),
    });
    console.log("✅ ESM build: dist/lib/test-framework/index.js");

    await esbuild.build({
      ...sharedConfig,
      ...cjsImportMetaShim,
      entryPoints: [testFrameworkEntry],
      format: "cjs",
      outfile: path.join(distTestFrameworkDir, "index.cjs"),
    });
    console.log("✅ CJS build: dist/lib/test-framework/index.cjs");

    // ── TypeScript declarations ───────────────────────────────────────────────
    console.log("📝 Generating TypeScript declarations...");
    execSync("npx tsc -p tsconfig.lib.json --emitDeclarationOnly", {
      cwd: projectRoot,
      stdio: "inherit",
    });
    console.log("✅ Declarations generated: dist/lib/**/*.d.ts");

    // Write package.json so Node treats dist/lib/**/*.js as ESM
    fs.writeFileSync(
      path.join(distLibDir, "package.json"),
      JSON.stringify({ type: "module" }, null, 2) + "\n",
    );
    console.log("✅ dist/lib/package.json written (type: module)");

    console.log("\n✅ Library build complete.");
  } catch (error) {
    console.error("❌ Library build failed:", error);
    process.exit(1);
  }
}

buildLib();
