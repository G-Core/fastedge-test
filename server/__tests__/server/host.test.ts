import { describe, it, expect } from "vitest";
import { hostAllowed } from "../../utils/token.js";

describe("hostAllowed — Codespaces suffix-match support", () => {
  it("always allows localhost", () => {
    expect(hostAllowed("localhost")).toBe(true);
  });

  it("always allows 127.0.0.1", () => {
    expect(hostAllowed("127.0.0.1")).toBe(true);
  });

  it("always allows ::1", () => {
    expect(hostAllowed("::1")).toBe(true);
  });

  it("rejects unknown host when no expectedHost set", () => {
    expect(hostAllowed("evil.com")).toBe(false);
  });

  // Codespaces: FASTEDGE_EXPECTED_HOST=app.github.dev
  it("allows subdomain of expectedHost (Codespaces port-forwarded URL)", () => {
    expect(hostAllowed("abc-5179.app.github.dev", "app.github.dev")).toBe(true);
  });

  it("allows exact match of expectedHost", () => {
    expect(hostAllowed("app.github.dev", "app.github.dev")).toBe(true);
  });

  it("rejects superdomain attack: app.github.dev.evil.com", () => {
    expect(hostAllowed("app.github.dev.evil.com", "app.github.dev")).toBe(false);
  });

  it("rejects prefix attack: evilapp.github.dev", () => {
    expect(hostAllowed("evilapp.github.dev", "app.github.dev")).toBe(false);
  });
});
