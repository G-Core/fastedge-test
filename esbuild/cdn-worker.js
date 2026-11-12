/**
 * Builds the CDN runner worker (server/runner/cdn-worker.ts) into one CommonJS string,
 * started with `new Worker(code, { eval: true })`. Embedding the string means no extra
 * file has to ship next to each bundle (dist/server.js, dist/lib/*, the VS Code zip).
 *
 * - cdnWorkerPlugin: the bundles replace server/runner/cdnWorkerSource.ts with the
 *   prebuilt string; in watch mode the worker's inputs are watched too.
 * - buildCdnWorkerSync: unbundled runs (vitest) build it on first use.
 *
 * Location: esbuild/cdn-worker.js
 */

const path = require("path");

const projectRoot = path.join(__dirname, "..");

function workerOptions() {
  return {
    absWorkingDir: projectRoot,
    entryPoints: [path.join(projectRoot, "server", "runner", "cdn-worker.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    write: false,
    metafile: true,
    logLevel: "warning",
  };
}

function buildCdnWorkerSync() {
  return require("esbuild").buildSync(workerOptions()).outputFiles[0].text;
}

const cdnWorkerPlugin = {
  name: "cdn-worker",
  setup(build) {
    build.onLoad({ filter: /[\\/]cdnWorkerSource\.ts$/ }, async () => {
      const result = await require("esbuild").build(workerOptions());
      return {
        contents: `export function cdnWorkerSource() { return ${JSON.stringify(result.outputFiles[0].text)}; }`,
        loader: "ts",
        watchFiles: Object.keys(result.metafile.inputs).map((f) => path.resolve(projectRoot, f)),
      };
    });
  },
};

module.exports = { buildCdnWorkerSync, cdnWorkerPlugin };
