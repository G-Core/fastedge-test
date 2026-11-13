/**
 * Code that runs in its own thread or process, as one CommonJS string each:
 * "cdn-worker" (runner/cdn-worker.ts) and "stores-service" (stores/service.ts).
 *
 * The esbuild bundles replace this file with the prebuilt strings
 * (esbuild/embedded.js). Unbundled runs (vitest) build them here on first use,
 * which needs the esbuild dev dependency.
 */

import { createRequire } from "node:module";

export type Embedded = "cdn-worker" | "stores-service";

const built = new Map<Embedded, string>();

export function embeddedSource(name: Embedded): string {
  let source = built.get(name);
  if (source === undefined) {
    source = createRequire(__filename)("../esbuild/embedded.js").buildEmbeddedSync(name) as string;
    built.set(name, source);
  }
  return source;
}
