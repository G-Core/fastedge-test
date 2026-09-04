import { describe, it, expect, vi, afterEach } from "vitest";

// Mock node:dns so these tests never hit the real resolver.
vi.mock("node:dns", () => ({
  promises: {
    lookup: vi.fn(),
  },
}));

import { promises as dns } from "node:dns";
import { checkEgressAllowed } from "../../../runner/egressPolicy.js";

describe("checkEgressAllowed — IPv4-mapped IPv6 bypass", () => {
  it("blocks ::ffff:169.254.169.254 (mixed notation)", async () => {
    await expect(
      checkEgressAllowed("http://[::ffff:169.254.169.254]/"),
    ).rejects.toThrow("Egress blocked");
  });

  it("blocks ::ffff:a9fe:a9fe (pure-hex notation, same address)", async () => {
    await expect(
      checkEgressAllowed("http://[::ffff:a9fe:a9fe]/"),
    ).rejects.toThrow("Egress blocked");
  });
});

describe("checkEgressAllowed — fc00::/7 ULA range", () => {
  it("blocks fc00::1 (fc00::/8 half of fc00::/7)", async () => {
    await expect(checkEgressAllowed("http://[fc00::1]/")).rejects.toThrow(
      "Egress blocked",
    );
  });
});

describe("checkEgressAllowed — all DNS addresses checked", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("blocks a host that resolves to both a public and a private IP", async () => {
    // One address is public (1.2.3.4), the other is link-local (169.254.169.254).
    // The request must be blocked because any blocked address is sufficient.
    vi.mocked(dns.lookup).mockResolvedValue([
      { address: "1.2.3.4", family: 4 },
      { address: "169.254.169.254", family: 4 },
    ] as any);

    await expect(
      checkEgressAllowed("http://dual-homed.example/"),
    ).rejects.toThrow("Egress blocked");
  });
});
