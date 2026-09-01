import { isIP } from "node:net";
import { promises as dns } from "node:dns";

/**
 * Resolve a hostname to an IP address. If it is already a numeric literal,
 * return it directly. IPv6 bracket notation ([::1]) is handled by stripping
 * the brackets before the check.
 */
async function resolveToIp(hostname: string): Promise<string> {
  const stripped = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
  if (isIP(stripped) !== 0) return stripped;
  const { address } = await dns.lookup(hostname);
  return address;
}

/**
 * Return true if the IP is in a range that must be blocked by default:
 *   - 169.254.0.0/16  — link-local IPv4, covers cloud metadata endpoints
 *                        (AWS 169.254.169.254, GCP, Azure equivalent)
 *   - fe80::/10        — link-local IPv6 (fe80:: through febf::)
 *   - fd00::/8         — ULA IPv6 used by some cloud metadata services
 *
 * Loopback (127.x.x.x, ::1) and RFC-1918 (10.x, 172.16-31.x, 192.168.x)
 * are intentionally NOT blocked — proxy-wasm tests routinely target local
 * and LAN mock origins.
 */
function isBlockedIp(ip: string): boolean {
  // Link-local IPv4 (169.254.0.0/16)
  if (/^169\.254\./.test(ip)) return true;
  // Link-local IPv6 (fe80::/10 = fe80:: through febf::)
  if (/^fe[89ab][0-9a-f]/i.test(ip)) return true;
  // ULA IPv6 used by cloud metadata (fd00::/8)
  if (/^fd[0-9a-f]{2}/i.test(ip)) return true;
  return false;
}

/**
 * Check whether an outbound callout URL is permitted by the default egress policy.
 * Throws an Error (message suitable for user-facing logs) if the URL is blocked.
 *
 * Default policy: allow http/https only; block cloud-metadata and link-local
 * IP ranges; preserve loopback and RFC-1918 for local/LAN testing.
 *
 * Resolves hostnames via DNS so the check cannot be bypassed by a hostname that
 * later resolves to a blocked range (DNS-rebinding at the callout target).
 */
export async function checkEgressAllowed(urlStr: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new Error(`Egress blocked: invalid URL '${urlStr}'`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `Egress blocked: scheme '${parsed.protocol}' is not allowed (http/https only)`,
    );
  }

  const ip = await resolveToIp(parsed.hostname);
  if (isBlockedIp(ip)) {
    throw new Error(
      `Egress blocked: ${parsed.hostname} resolves to ${ip} which is in a restricted range (cloud metadata / link-local)`,
    );
  }
}
