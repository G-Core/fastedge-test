/**
 * Code that runs in its own thread or process, built into one CommonJS string each:
 * - "cdn-worker" (server/runner/cdn-worker.ts): `new Worker(code, { eval: true })`;
 * - "stores-service" (server/stores/service.ts): `node -` with the code on stdin.
 * Embedding the strings means no extra file has to ship next to each bundle
 * (dist/server.js, dist/lib/*, the VS Code zip).
 *
 * - embeddedPlugin: the bundles replace server/embedded.ts with the prebuilt strings;
 *   in watch mode their inputs are watched too.
 * - buildEmbeddedSync: unbundled runs (vitest) build one on first use.
 *
 * Location: esbuild/embedded.js
 */

const path = require("path");

const projectRoot = path.join(__dirname, "..");
const ENTRIES = {
  "cdn-worker": "server/runner/cdn-worker.ts",
  "stores-service": "server/stores/service.ts",
};

function options(name) {
  return {
    absWorkingDir: projectRoot,
    entryPoints: [path.join(projectRoot, ENTRIES[name])],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    write: false,
    metafile: true,
    logLevel: "warning",
  };
}

function buildEmbeddedSync(name) {
  return require("esbuild").buildSync(options(name)).outputFiles[0].text;
}

const embeddedPlugin = {
  name: "embedded",
  setup(build) {
    build.onLoad({ filter: /[\\/]server[\\/]embedded\.ts$/ }, async () => {
      const esbuild = require("esbuild");
      const sources = {};
      const watchFiles = new Set();
      for (const name of Object.keys(ENTRIES)) {
        const result = await esbuild.build(options(name));
        sources[name] = result.outputFiles[0].text;
        for (const f of Object.keys(result.metafile.inputs)) watchFiles.add(path.resolve(projectRoot, f));
      }
      return {
        contents: `const SOURCES = ${JSON.stringify(sources)};\nexport function embeddedSource(name) { return SOURCES[name]; }`,
        loader: "ts",
        watchFiles: [...watchFiles],
      };
    });
  },
};

module.exports = { buildEmbeddedSync, embeddedPlugin };
