/**
 * WASM Type Detector
 *
 * Detects whether a WASM binary is HTTP WASM or Proxy-WASM by attempting
 * to compile and inspect exports.
 *
 * Detection Logic:
 * 1. Try WebAssembly.compile()
 *    - Fails (Component Model) → http-wasm
 *    - Succeeds → check exports:
 *      • Has http-handler exports → http-wasm (Rust)
 *      • Has proxy_* exports → proxy-wasm
 *      • Default → proxy-wasm
 */

export type WasmType = "http-wasm" | "proxy-wasm";

/**
 * Detect the type of a WASM binary
 *
 * @param bufferOrPath - The WASM binary buffer or file path
 * @returns The detected WASM type
 */
export async function detectWasmType(bufferOrPath: Buffer | string): Promise<WasmType> {
  // Get buffer from path if needed
  let buffer: Buffer;
  if (typeof bufferOrPath === "string") {
    const { readFile } = await import("fs/promises");
    buffer = await readFile(bufferOrPath);
  } else {
    buffer = bufferOrPath;
  }

  try {
    // Attempt to compile the WASM module
    // Component Model binaries will fail here (version mismatch)
    const module = await WebAssembly.compile(new Uint8Array(buffer));

    // Successfully compiled - it's a traditional WASM module
    // Check exports to determine type
    const exports = WebAssembly.Module.exports(module);

    // Check for HTTP handler exports (Rust HTTP WASM)
    const hasHttpHandler = exports.some(
      (exp) => exp.name.includes("http-handler") || exp.name.includes("process"),
    );

    if (hasHttpHandler) {
      return "http-wasm";
    }

    // Check for Proxy-WASM exports
    const hasProxyFunctions = exports.some((exp) =>
      exp.name.startsWith("proxy_"),
    );

    if (hasProxyFunctions) {
      return "proxy-wasm";
    }

    // Default to proxy-wasm for unknown traditional modules
    return "proxy-wasm";
  } catch (error) {
    // Compilation failed - likely a Component Model binary (HTTP WASM)
    // Component Model uses different version bytes that traditional
    // WebAssembly.compile doesn't support
    return "http-wasm";
  }
}
