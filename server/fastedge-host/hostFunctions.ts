import { SecretStore } from "./SecretStore";
import { Dictionary } from "./Dictionary";
import { ProxyStatus } from "./types";
import type { MemoryManager } from "../runner/MemoryManager";

/**
 * FastEdge Host Functions
 *
 * Implements the FastEdge-specific host functions that extend proxy-wasm ABI.
 * These functions follow the same memory management patterns as the standard
 * proxy-wasm host functions.
 */

/**
 * Create FastEdge host functions that integrate with WASM memory
 */
export function createFastEdgeHostFunctions(
  memory: MemoryManager,
  secretStore: SecretStore,
  dictionary: Dictionary,
  logDebug: (message: string) => void,
) {
  const functions = {
    /**
     * Get a secret value by key
     *
     * Signature: proxy_get_secret(key_data: i32, key_size: i32,
     *                              return_value_data: i32, return_value_size: i32) -> i32
     */
    proxy_get_secret: (
      keyPtr: number,
      keyLen: number,
      returnValuePtr: number,
      returnSizePtr: number,
    ): number => {
      try {
        logDebug(
          `proxy_get_secret keyPtr=${keyPtr} keyLen=${keyLen} returnValuePtr=${returnValuePtr} returnSizePtr=${returnSizePtr}`,
        );

        // Read key from WASM memory
        const key = memory.readString(keyPtr, keyLen);
        logDebug(`proxy_get_secret key="${key}"`);

        // Lookup secret
        const value = secretStore.get(key);
        if (value === null) {
          logDebug(`proxy_get_secret key="${key}" not found`);
          return ProxyStatus.NotFound;
        }

        logDebug(`proxy_get_secret found value (length=${value.length})`);

        // Write result to WASM memory using pointer-to-pointer pattern
        memory.writeStringResult(value, returnValuePtr, returnSizePtr);

        return ProxyStatus.Ok;
      } catch (error) {
        logDebug(
          `proxy_get_secret error: ${error instanceof Error ? error.message : String(error)}`,
        );
        return ProxyStatus.InternalFailure;
      }
    },

    /**
     * Get a secret value effective at a specific timestamp
     *
     * Signature: proxy_get_effective_at_secret(key_data: i32, key_size: i32, at: u32,
     *                                           return_value_data: i32, return_value_size: i32) -> i32
     */
    proxy_get_effective_at_secret: (
      keyPtr: number,
      keyLen: number,
      timestamp: number,
      returnValuePtr: number,
      returnSizePtr: number,
    ): number => {
      try {
        logDebug(
          `proxy_get_effective_at_secret keyPtr=${keyPtr} keyLen=${keyLen} timestamp=${timestamp}`,
        );

        // Read key from WASM memory
        const key = memory.readString(keyPtr, keyLen);
        logDebug(`proxy_get_effective_at_secret key="${key}" at=${timestamp}`);

        // Lookup secret at specific time
        // `at` is a u32 on the edge; WebAssembly hands an i32 to JavaScript, so read it unsigned.
        const value = secretStore.getEffectiveAt(key, timestamp >>> 0);
        if (value === null) {
          logDebug(
            `proxy_get_effective_at_secret key="${key}" not found at timestamp ${timestamp}`,
          );
          return ProxyStatus.NotFound;
        }

        logDebug(
          `proxy_get_effective_at_secret found value (length=${value.length})`,
        );

        // Write result to WASM memory
        memory.writeStringResult(value, returnValuePtr, returnSizePtr);

        return ProxyStatus.Ok;
      } catch (error) {
        logDebug(
          `proxy_get_effective_at_secret error: ${error instanceof Error ? error.message : String(error)}`,
        );
        return ProxyStatus.InternalFailure;
      }
    },

    /**
     * Get a dictionary/configuration value by key
     *
     * Signature: proxy_dictionary_get(key_data: i32, key_size: i32,
     *                                  return_value_data: i32, return_value_size: i32) -> i32
     */
    proxy_dictionary_get: (
      keyPtr: number,
      keyLen: number,
      returnValuePtr: number,
      returnSizePtr: number,
    ): number => {
      try {
        logDebug(
          `proxy_dictionary_get keyPtr=${keyPtr} keyLen=${keyLen} returnValuePtr=${returnValuePtr} returnSizePtr=${returnSizePtr}`,
        );

        // Read key from WASM memory
        const key = memory.readString(keyPtr, keyLen);
        logDebug(`proxy_dictionary_get key="${key}"`);

        // Lookup value
        const value = dictionary.get(key);
        if (value === null) {
          logDebug(`proxy_dictionary_get key="${key}" not found`);
          return ProxyStatus.NotFound;
        }

        logDebug(
          `proxy_dictionary_get found value="${value}" (length=${value.length})`,
        );

        // Write result to WASM memory
        memory.writeStringResult(value, returnValuePtr, returnSizePtr);

        return ProxyStatus.Ok;
      } catch (error) {
        logDebug(
          `proxy_dictionary_get error: ${error instanceof Error ? error.message : String(error)}`,
        );
        return ProxyStatus.InternalFailure;
      }
    },
  };
  // The edge registers both secret APIs under a second name each, with the same behaviour; the
  // FastEdge Rust SDK imports proxy_secret_get and proxy_secret_get_effective_at.
  return {
    ...functions,
    proxy_secret_get: functions.proxy_get_secret,
    proxy_secret_get_effective_at: functions.proxy_get_effective_at_secret,
  };
}
