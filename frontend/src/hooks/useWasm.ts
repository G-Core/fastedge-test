import { useState } from "react";
import { WasmState } from "../types";
import { uploadWasm } from "../api";

export function useWasm() {
  const [wasmState, setWasmState] = useState<WasmState>({
    wasmPath: null,
    wasmBuffer: null,
    wasmFile: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWasm = async (file: File, dotenvEnabled: boolean = true) => {
    setLoading(true);
    setError(null);

    try {
      const buffer = await file.arrayBuffer();
      const path = await uploadWasm(file, dotenvEnabled);

      setWasmState({
        wasmPath: path,
        wasmBuffer: buffer,
        wasmFile: file, // Store the file for reloading
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load WASM");
    } finally {
      setLoading(false);
    }
  };

  const reloadWasm = async (dotenvEnabled: boolean = true) => {
    if (!wasmState.wasmFile) {
      setError("No WASM file loaded to reload");
      return;
    }
    await loadWasm(wasmState.wasmFile, dotenvEnabled);
  };

  return { wasmState, loading, error, loadWasm, reloadWasm };
}
