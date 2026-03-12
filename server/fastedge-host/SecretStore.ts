import { ISecretStore, SecretWithTimestamp } from "./types";

/**
 * SecretStore implementation for FastEdge secrets
 *
 * Manages encrypted configuration values that WASM can access via proxy_get_secret.
 * Supports time-based secret rotation with effectiveAt timestamps.
 */
export class SecretStore implements ISecretStore {
  private secrets: Map<string, string | SecretWithTimestamp[]>;

  constructor(initialSecrets?: Record<string, string | SecretWithTimestamp[]>) {
    this.secrets = new Map();
    if (initialSecrets) {
      Object.entries(initialSecrets).forEach(([key, value]) => {
        this.secrets.set(key, value);
      });
    }
  }

  /**
   * Get the current effective value for a secret
   * If secret has timestamps, returns the most recent effective value
   */
  get(key: string): string | null {
    const value = this.secrets.get(key);
    if (!value) return null;

    // Simple string value
    if (typeof value === "string") {
      return value;
    }

    // Time-based values - return current effective one
    const now = Math.floor(Date.now() / 1000); // Unix timestamp in seconds
    return this.getEffectiveAt(key, now);
  }

  /**
   * Get secret value effective at a specific timestamp
   * Used for time-travel debugging and testing secret rotation
   */
  getEffectiveAt(key: string, timestamp: number): string | null {
    const value = this.secrets.get(key);
    if (!value) return null;

    // Simple string value - always effective
    if (typeof value === "string") {
      return value;
    }

    // Find the most recent value that was effective at the given time
    // Sort by effectiveAt descending and find first one <= timestamp
    const sortedValues = [...value].sort(
      (a, b) => b.effectiveAt - a.effectiveAt,
    );

    for (const item of sortedValues) {
      if (item.effectiveAt <= timestamp) {
        return item.value;
      }
    }

    // No value was effective at that time
    return null;
  }

  /**
   * Set a secret value (simple string or time-based array)
   */
  set(key: string, value: string | SecretWithTimestamp[]): void {
    this.secrets.set(key, value);
  }

  /**
   * Check if a secret exists
   */
  has(key: string): boolean {
    return this.secrets.has(key);
  }

  /**
   * Clear all secrets
   */
  clear(): void {
    this.secrets.clear();
  }

  /**
   * Get all secrets as a plain object (for debugging/testing)
   */
  getAll(): Record<string, string | SecretWithTimestamp[]> {
    const result: Record<string, string | SecretWithTimestamp[]> = {};
    this.secrets.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  /**
   * Load secrets from a plain object
   */
  load(secrets: Record<string, string | SecretWithTimestamp[]>): void {
    this.clear();
    Object.entries(secrets).forEach(([key, value]) => {
      this.set(key, value);
    });
  }
}
