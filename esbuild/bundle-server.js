/**
 * Bundle the debugger server - compiles TypeScript and bundles all dependencies
 *
 * This is the primary build for the debugger server. It:
 * - Compiles TypeScript directly (no separate tsc step)
 * - Bundles all dependencies into a single file
 * - Used for both local development and VSCode extension embedding
 *
 * Location: esbuild/bundle-server.js
 */

const esbuild = require("esbuild");
const path = require("path");
const fs = require("fs");

async function bundle() {
  console.log("📦 Building server (TypeScript → Bundled JS)...");

  // Paths relative to project root (one level up from esbuild/)
  const projectRoot = path.join(__dirname, "..");
  const distDir = path.join(projectRoot, "dist");

  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  try {
    // Build directly from TypeScript source
    await esbuild.build({
      entryPoints: [path.join(projectRoot, "server/server.ts")],
      bundle: true,
      platform: "node",
      target: "node20",
      format: "cjs",
      // Shim import.meta.url so fileURLToPath() works in the CJS bundle.
      // __filename is always available in CJS; import.meta is not.
      banner: { js: "var __importMetaUrl = require('url').pathToFileURL(__filename).href;" },
      define: { "import.meta.url": "__importMetaUrl" },
      outfile: path.join(distDir, "server.js"),
      external: [
        "fsevents", // Optional native dependency (Mac only)
      ],
      minify: true, // Minify for production
      sourcemap: false, // No source maps in production
      logLevel: "info",
    });

    // Make executable for use as a CLI bin
    fs.chmodSync(path.join(distDir, "server.js"), "755");

    console.log("✅ Server built successfully: dist/server.js");
    console.log("   TypeScript compiled + all dependencies bundled");

    // Copy fastedge-run directory to dist/fastedge-cli/ (required for HTTP WASM runner)
    const cliSourceDir = path.join(projectRoot, "fastedge-run");
    const cliDestDir = path.join(distDir, "fastedge-cli");

    if (fs.existsSync(cliSourceDir)) {
      console.log("📦 Copying fastedge-run/ to dist/fastedge-cli/...");

      // Remove old if exists
      if (fs.existsSync(cliDestDir)) {
        fs.rmSync(cliDestDir, { recursive: true });
      }

      // Copy directory
      fs.cpSync(cliSourceDir, cliDestDir, { recursive: true });
      console.log("✅ fastedge-run/ copied to dist/fastedge-cli/");
    } else {
      console.log(
        "⚠️  Warning: fastedge-run/ not found - HTTP WASM won't work",
      );
    }
  } catch (error) {
    console.error("❌ Bundling failed:", error);
    process.exit(1);
  }
}

bundle();
