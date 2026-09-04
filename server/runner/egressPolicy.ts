import { isIP } from "node:net";
import { promises as dns } from "node:dns";

/**
 * Extract the embedded IPv4 address from an IPv4-mapped IPv6 address.
 * Handles mixed notation (::ffff:a.b.c.d) and pure-hex notation (::ffff:aabb:ccdd).
 * Returns null when the address is not IPv4-mapped.
 */
function extractMappedIpv4(ip: string): string | null {
  const m = ip.match(/^::ffff:(.+)$/i);
  if (!m) return null;
  const rest = m[1];
  if (rest.includes(".")) return rest; // mixed notation: already dotted-decimal
  // Pure-hex form: two 16-bit groups e.g. a9fe:a9fe
  const h = rest.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (!h) return null;
  const hi = parseInt(h[1], 16);
  const lo = parseInt(h[2], 16);
  return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
}

/**
 * Return true if the IP is in a range that must be blocked by default:
 *   - 169.254.0.0/16  — link-local IPv4, covers cloud metadata endpoints
 *                        (AWS 169.254.169.254, GCP, Azure equivalent)
 *   - ::ffff:0:0/96   — IPv4-mapped IPv6; the embedded IPv4 is checked
 *                        against the above rules so ::ffff:169.254.x.x is blocked
 *   - fe80::/10        — link-local IPv6 (fe80:: through febf::)
 *   - fc00::/7         — ULA IPv6 (fc00:: through fdff::), covers cloud metadata
 *                        services that use ULA addresses
 *
 * Loopback (127.x.x.x, ::1) and RFC-1918 (10.x, 172.16-31.x, 192.168.x)
 * are intentionally NOT blocked — proxy-wasm tests routinely target local
 * and LAN mock origins.
 */
function isBlockedIp(ip: string): boolean {
  // IPv4-mapped IPv6 (::ffff:a.b.c.d or ::ffff:hex:hex): check the embedded IPv4
  const embedded = extractMappedIpv4(ip);
  if (embedded !== null) return isBlockedIp(embedded);
  // Link-local IPv4 (169.254.0.0/16)
  if (/^169\.254\./.test(ip)) return true;
  // Link-local IPv6 (fe80::/10 = fe80:: through febf::)
  if (/^fe[89ab][0-9a-f]/i.test(ip)) return true;
  // ULA IPv6 (fc00::/7 = fc00:: through fdff::)
  if (/^f[cd][0-9a-f]{2}/i.test(ip)) return true;
  return false;
}

/**
 * Resolve a hostname to all its IP addresses. If it is already a numeric
 * literal, return it in a single-element array. IPv6 bracket notation ([::1])
 * is handled by stripping the brackets before the check.
 */
async function resolveAllIps(hostname: string): Promise<string[]> {
  const stripped = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
  if (isIP(stripped) !== 0) return [stripped];
  const entries = await dns.lookup(hostname, { all: true });
  return entries.map((e) => e.address);
}

/**
 * Check whether an outbound callout URL is permitted by the default egress policy.
 * Throws an Error (message suitable for user-facing logs) if the URL is blocked.
 *
 * Default policy: allow http/https only; block cloud-metadata and link-local
 * IP ranges; preserve loopback and RFC-1918 for local/LAN testing.
 *
 * All addresses a hostname resolves to are checked — if any is blocked, the
 * request is blocked. Redirects are not followed by the caller (redirect:
 * "manual" is set on the fetch); the redirect target is not checked here.
 *
 * DNS rebinding between this check and the actual connect is not mitigated.
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

  let ips: string[];
  try {
    ips = await resolveAllIps(parsed.hostname);
  } catch {
    // Unresolvable hostnames cannot reach any IP — the fetch will also fail.
    return;
  }
  for (const ip of ips) {
    if (isBlockedIp(ip)) {
      throw new Error(
        `Egress blocked: ${parsed.hostname} resolves to ${ip} which is in a restricted range (cloud metadata / link-local)`,
      );
    }
  }
}
