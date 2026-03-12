import { IDictionary } from "./types";

/**
 * Dictionary implementation for FastEdge configuration
 *
 * Simple key-value store for configuration values that WASM can access
 * via proxy_dictionary_get. Similar to environment variables but specifically
 * for runtime configuration.
 */
export class Dictionary implements IDictionary {
  private data: Map<string, string>;

  constructor(initialData?: Record<string, string>) {
    this.data = new Map();
    if (initialData) {
      Object.entries(initialData).forEach(([key, value]) => {
        this.data.set(key, value);
      });
    }
  }

  /**
   * Get a configuration value by key
   */
  get(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  /**
   * Set a configuration value
   */
  set(key: string, value: string): void {
    this.data.set(key, value);
  }

  /**
   * Check if a key exists
   */
  has(key: string): boolean {
    return this.data.has(key);
  }

  /**
   * Clear all configuration values
   */
  clear(): void {
    this.data.clear();
  }

  /**
   * Get all configuration as a plain object (for debugging/testing)
   */
  getAll(): Record<string, string> {
    const result: Record<string, string> = {};
    this.data.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  /**
   * Load configuration from a plain object
   */
  load(config: Record<string, string>): void {
    this.clear();
    Object.entries(config).forEach(([key, value]) => {
      this.set(key, value);
    });
  }
}
