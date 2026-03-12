/**
 * Watch mode for debugger server - rebuilds on file changes
 *
 * This provides fast incremental rebuilds during development:
 * - Watches TypeScript files for changes
 * - Rebuilds bundle automatically
 * - Pair with `node --watch dist/server.js` for auto-restart
 *
 * Location: esbuild/watch-server.js
 */

const esbuild = require("esbuild");
const path = require("path");
const fs = require("fs");

async function watch() {
  console.log("👀 Starting esbuild watch mode...");

  // Paths relative to project root (one level up from esbuild/)
  const projectRoot = path.join(__dirname, "..");
  const distDir = path.join(projectRoot, "dist");

  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // Copy fastedge-run directory (once at startup)
  const cliSourceDir = path.join(projectRoot, "fastedge-run");
  const cliDestDir = path.join(distDir, "fastedge-cli");

  if (fs.existsSync(cliSourceDir)) {
    console.log("📦 Copying fastedge-run/ to dist/fastedge-cli/...");
    if (fs.existsSync(cliDestDir)) {
      fs.rmSync(cliDestDir, { recursive: true });
    }
    fs.cpSync(cliSourceDir, cliDestDir, { recursive: true });
    console.log("✅ CLI binaries ready");
  } else {
    console.log("⚠️  Warning: fastedge-run/ not found - HTTP WASM won't work");
  }

  try {
    // Create watch context
    const ctx = await esbuild.context({
      entryPoints: [path.join(projectRoot, "server/server.ts")],
      bundle: true,
      platform: "node",
      target: "node20",
      outfile: path.join(distDir, "server.js"),
      external: [
        "fsevents", // Optional native dependency (Mac only)
      ],
      minify: false, // Don't minify in dev for better debugging
      sourcemap: true, // Enable source maps in dev
      logLevel: "info",
    });

    // Watch for changes
    await ctx.watch();

    console.log("✅ Watching for changes...");
    console.log("   Press Ctrl+C to stop");
  } catch (error) {
    console.error("❌ Watch failed:", error);
    process.exit(1);
  }
}

watch();
