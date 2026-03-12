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
  return {
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
        const value = secretStore.getEffectiveAt(key, timestamp);
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
     * Alternative secret getter (alias for proxy_get_secret)
     *
     * Signature: proxy_secret_get(key_data: i32, key_size: i32,
     *                              return_value_data: i32, return_value_size: i32) -> i32
     */
    proxy_secret_get: (
      keyPtr: number,
      keyLen: number,
      returnValuePtr: number,
      returnSizePtr: number,
    ): number => {
      // Same implementation as proxy_get_secret
      logDebug("proxy_secret_get (aliased to proxy_get_secret)");
      return createFastEdgeHostFunctions(
        memory,
        secretStore,
        dictionary,
        logDebug,
      ).proxy_get_secret(keyPtr, keyLen, returnValuePtr, returnSizePtr);
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
}
