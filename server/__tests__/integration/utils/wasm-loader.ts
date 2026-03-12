import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * Loads a compiled WASM binary from the wasm directory
 *
 * @param category - The category folder (e.g., 'cdn-apps')
 * @param subCategory - The sub-category folder (e.g., 'properties')
 * @param filename - The WASM filename (e.g., 'valid-path-write.wasm')
 * @returns The WASM binary as a Uint8Array
 */
export async function loadWasmBinary(
  category: string,
  subCategory: string,
  filename: string
): Promise<Uint8Array> {
  const wasmPath = resolve(
    process.cwd(),
    'wasm',
    category,
    subCategory,
    filename
  );

  try {
    const buffer = await readFile(wasmPath);
    return new Uint8Array(buffer);
  } catch (error) {
    throw new Error(
      `Failed to load WASM binary at ${wasmPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Loads a CDN app WASM binary from wasm/cdn-apps/{subCategory}/{filename}
 *
 * @param subCategory - The sub-category folder (e.g., 'properties')
 * @param filename - The WASM filename (e.g., 'valid-path-write.wasm')
 * @returns The WASM binary as a Uint8Array
 */
export async function loadCdnAppWasm(
  subCategory: string,
  filename: string
): Promise<Uint8Array> {
  return loadWasmBinary('cdn-apps', subCategory, filename);
}

/**
 * Loads an HTTP app WASM binary from wasm/http-apps/{subCategory}/{filename}
 *
 * @param subCategory - The sub-category folder (e.g., 'sdk-examples')
 * @param filename - The WASM filename (e.g., 'sdk-basic.wasm')
 * @returns The WASM binary as a Uint8Array
 */
export async function loadHttpAppWasm(
  subCategory: string,
  filename: string
): Promise<Uint8Array> {
  return loadWasmBinary('http-apps', subCategory, filename);
}

/**
 * Paths to compiled test WASM binaries
 */
export const WASM_TEST_BINARIES = {
  cdnApps: {
    properties: {
      validPathWrite: 'valid-path-write.wasm',
      invalidMethodWrite: 'invalid-method-write.wasm',
      validUrlWrite: 'valid-url-write.wasm',
      validHostWrite: 'valid-host-write.wasm',
      validQueryWrite: 'valid-query-write.wasm',
      invalidSchemeWrite: 'invalid-scheme-write.wasm',
      invalidGeolocationWrite: 'invalid-geolocation-write.wasm',
      validResponseStatusRead: 'valid-response-status-read.wasm',
      invalidResponseStatusWrite: 'invalid-response-status-write.wasm',
      validNginxLogWrite: 'valid-nginx-log-write.wasm',
      validReadonlyRead: 'valid-readonly-read.wasm',
      invalidReadonlyWrite: 'invalid-readonly-write.wasm',
    },
    headers: {
      headersChange: 'headers-change.wasm',
    },
    variablesAndSecrets: {
      variablesAndSecrets: 'variables-and-secrets.wasm',
    },
    httpCall: {
      httpCall: 'http-call.wasm',
      allHooksHttpCall: 'all-hooks-http-call.wasm',
    },
  },
  httpApps: {
    sdkExamples: {
      sdkBasic: 'sdk-basic.wasm',
      sdkDownstreamFetch: 'sdk-downstream-fetch.wasm',
      sdkDownstreamModifyResponse: 'sdk-downstream-modify-response.wasm',
      sdkHeaders: 'sdk-headers.wasm',
      sdkVariablesAndSecrets: 'sdk-variables-and-secrets.wasm',
    },
    basicExamples: {
      httpResponder: 'http-responder.wasm',
    },
  },
} as const;
