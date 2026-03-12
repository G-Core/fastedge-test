/**
 * FastEdge Host Functions Module
 *
 * This module provides FastEdge-specific host functions that extend the
 * standard proxy-wasm ABI. These functions are implemented separately from
 * the test runner to maintain clean separation of concerns and facilitate
 * independent updates when the Rust implementation changes.
 *
 * ## Implemented Functions
 *
 * ### Secrets Management
 * - proxy_get_secret - Get current secret value
 * - proxy_get_effective_at_secret - Get secret value at specific timestamp
 * - proxy_secret_get - Alias for proxy_get_secret
 *
 * ### Configuration Dictionary
 * - proxy_dictionary_get - Get configuration value
 *
 * ## Usage
 *
 * ```typescript
 * import { SecretStore, Dictionary, createFastEdgeHostFunctions } from './fastedge-host';
 *
 * const secretStore = new SecretStore({
 *   'api-key': 'secret-value',
 *   'rotating-key': [
 *     { value: 'old-key', effectiveAt: 1704067200 },
 *     { value: 'new-key', effectiveAt: 1706745600 }
 *   ]
 * });
 *
 * const dictionary = new Dictionary({
 *   'environment': 'test',
 *   'region': 'us-east-1'
 * });
 *
 * const fastEdgeFunctions = createFastEdgeHostFunctions(
 *   memoryManager,
 *   secretStore,
 *   dictionary,
 *   console.log
 * );
 * ```
 */

export { SecretStore } from "./SecretStore";
export { Dictionary } from "./Dictionary";
export { createFastEdgeHostFunctions } from "./hostFunctions";
export type {
  FastEdgeConfig,
  SecretWithTimestamp,
  ISecretStore,
  IDictionary,
} from "./types";
export { ProxyStatus } from "./types";
