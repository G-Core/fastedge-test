/**
 * The CDN runner worker (cdn-worker.ts) as one CommonJS string, for
 * `new Worker(code, { eval: true })`.
 *
 * The esbuild bundles replace this file with the prebuilt string
 * (esbuild/cdn-worker.js). Unbundled runs (vitest) build it here on first use,
 * which needs the esbuild dev dependency.
 */

import { createRequire } from "node:module";

let source: string | undefined;

export function cdnWorkerSource(): string {
  source ??= createRequire(__filename)("../../esbuild/cdn-worker.js").buildCdnWorkerSync() as string;
  return source;
}
