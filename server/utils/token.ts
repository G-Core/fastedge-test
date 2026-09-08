import { timingSafeEqual } from "node:crypto";

/**
 * Compare two token strings in constant time to prevent timing attacks.
 * Buffers must be equal in byte length for timingSafeEqual not to throw;
 * we check byte length (not string .length) to handle non-ASCII input safely.
 */
export function safeTokenEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.byteLength !== bb.byteLength) return false;
  return timingSafeEqual(ba, bb);
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
  // DNS hostnames are case-insensitive; normalize before comparing.
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "127.0.0.1" || h === "::1") {
    return true;
  }
  if (!expectedHost) return false;
  const e = expectedHost.toLowerCase();
  return h === e || h.endsWith("." + e);
}
