/**
 * FastEdge Host Function Types
 *
 * These types define the interfaces for FastEdge-specific host functions
 * that extend the standard proxy-wasm ABI.
 */

/**
 * Configuration for FastEdge host functions
 */
export interface FastEdgeConfig {
  secrets?: Record<string, string | SecretWithTimestamp[]>;
  dictionary?: Record<string, string>;
}

/**
 * Secret value with effective timestamp
 */
export interface SecretWithTimestamp {
  value: string;
  effectiveAt: number; // Unix timestamp in seconds
}

/**
 * Secret store interface for managing encrypted configuration values
 */
export interface ISecretStore {
  get(key: string): string | null;
  getEffectiveAt(key: string, timestamp: number): string | null;
  set(key: string, value: string | SecretWithTimestamp[]): void;
  has(key: string): boolean;
  clear(): void;
  getAll(): Record<string, string | SecretWithTimestamp[]>;
}

/**
 * Dictionary interface for managing configuration key-value pairs
 */
export interface IDictionary {
  get(key: string): string | null;
  set(key: string, value: string): void;
  has(key: string): boolean;
  clear(): void;
  getAll(): Record<string, string>;
}

/**
 * ProxyStatus enum matching proxy-wasm spec
 */
export enum ProxyStatus {
  Ok = 0,
  NotFound = 1,
  BadArgument = 2,
  SerializationFailure = 7,
  InternalFailure = 10,
  InvalidMemoryAccess = 11,
}
