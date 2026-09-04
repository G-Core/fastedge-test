import { timingSafeEqual } from "node:crypto";

/**
 * Compare two token strings in constant time to prevent timing attacks.
 * Returns false immediately when lengths differ (length is not secret —
 * SESSION_TOKEN is always 64 hex chars — but the check is needed to keep
 * Buffer.byteLength equal so timingSafeEqual does not throw).
 */
export function safeTokenEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Check whether a request hostname is allowed.
 *
 * Loopback names are always permitted. When FASTEDGE_EXPECTED_HOST is set,
 * the hostname must either match it exactly or end with ".<value>" — the
 * suffix form is required for Codespaces port-forwarded URLs, where the
 * browser connects through <name>-<port>.<domain> and the server cannot
 * know the full hostname because it picks its own port at runtime.
 *
 * Strip any ":port" suffix before calling (IPv6 brackets handled by caller).
 */
export function hostAllowed(hostname: string, expectedHost?: string): boolean {
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    return true;
  }
  if (!expectedHost) return false;
  return hostname === expectedHost || hostname.endsWith("." + expectedHost);
}
