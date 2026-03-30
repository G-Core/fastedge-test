/**
 * HTTP WASM Test Variants
 *
 * Defines all language/runtime variants of HTTP WASM test applications.
 * Each variant produces identical behavior - tests run the same assertions
 * against each variant's WASM binary.
 *
 * Variants that don't have compiled WASM binaries are skipped automatically.
 */

import { existsSync } from 'fs';
import { join } from 'path';

export interface HttpAppVariant {
  /** Display name for test output */
  name: string;
  /** Subdirectory under wasm/http-apps/ */
  wasmDir: string;
}

export const HTTP_APP_VARIANTS: HttpAppVariant[] = [
  { name: 'js', wasmDir: 'js' },
  { name: 'rust-sync', wasmDir: 'rust/sync' },
  { name: 'rust-async', wasmDir: 'rust/async' },
];

/**
 * Resolve the full path to a WASM binary for a given variant and app name.
 */
export function resolveWasmPath(variant: HttpAppVariant, appName: string): string {
  return join(process.cwd(), 'wasm', 'http-apps', variant.wasmDir, `${appName}.wasm`);
}

/**
 * Check if a WASM binary exists for a given variant and app name.
 * Used to skip tests when a variant hasn't been built yet.
 */
export function wasmExists(variant: HttpAppVariant, appName: string): boolean {
  return existsSync(resolveWasmPath(variant, appName));
}
