/**
 * CDN WASM Test Variants
 *
 * Defines all language/runtime variants of CDN WASM test applications.
 * Each variant produces identical proxy-wasm behavior — tests run the same
 * assertions against each variant's WASM binary.
 *
 * Variants that don't have compiled WASM binaries are skipped automatically.
 */

import { existsSync } from 'fs';
import { join } from 'path';

export interface CdnAppVariant {
  /** Display name for test output */
  name: string;
  /** Subdirectory under wasm/cdn-apps/ (e.g., 'as' or 'rust') */
  wasmDir: string;
}

export const CDN_APP_VARIANTS: CdnAppVariant[] = [
  { name: 'as', wasmDir: 'as' },
  { name: 'rust', wasmDir: 'rust' },
];

/**
 * Resolve the full path to a CDN WASM binary for a given variant, category, and filename.
 *
 * @param variant - The language variant (as, rust)
 * @param category - The category folder (e.g., 'variables-and-secrets', 'http-call')
 * @param filename - The WASM filename (e.g., 'variables-and-secrets.wasm')
 */
export function resolveCdnWasmPath(
  variant: CdnAppVariant,
  category: string,
  filename: string,
): string {
  return join(process.cwd(), 'wasm', 'cdn-apps', variant.wasmDir, category, filename);
}

/**
 * Check if a CDN WASM binary exists for a given variant, category, and filename.
 */
export function cdnWasmExists(
  variant: CdnAppVariant,
  category: string,
  filename: string,
): boolean {
  return existsSync(resolveCdnWasmPath(variant, category, filename));
}
