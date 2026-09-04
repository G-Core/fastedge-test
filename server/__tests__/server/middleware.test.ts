import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolve } from "node:path";
import { startTestServer, authedFetch, rawRequest, type TestServer } from "./helpers.js";

describe("debugger HTTP server — security middleware", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  // ── unauthenticated routes ────────────────────────────────────────────────

  it("GET /health → 200 without token", async () => {
    const res = await fetch(`${server.base}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  // ── token auth ───────────────────────────────────────────────────────────

  it("GET /api/environment → 401 with no token", async () => {
    const res = await fetch(`${server.base}/api/environment`);
    expect(res.status).toBe(401);
  });

  it("GET /api/environment → 401 with wrong token", async () => {
    const res = await fetch(`${server.base}/api/environment`, {
      headers: { "x-fastedge-token": "definitely-wrong" },
    });
    expect(res.status).toBe(401);
  });

  it("GET /api/environment → 200 with correct x-fastedge-token header", async () => {
    const res = await authedFetch(server.base, server.token, "/api/environment");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.environment).toBe("node");
  });

  it("GET /api/environment → 401 with token as ?token= query param (header required)", async () => {
    const res = await fetch(
      `${server.base}/api/environment?token=${server.token}`,
    );
    expect(res.status).toBe(401);
  });

  // ── Host header validation ────────────────────────────────────────────────

  it("GET /api/environment → 403 with foreign Host header", async () => {
    // fetch() silently drops forbidden headers (Host included), so use undici directly
    const { statusCode } = await rawRequest(server.base, "/api/environment", {
      headers: { "x-fastedge-token": server.token, host: "evil.attacker.com" },
    });
    expect(statusCode).toBe(403);
  });

  it("GET /api/environment → 200 with Host: localhost", async () => {
    const res = await fetch(`${server.base}/api/environment`, {
      headers: {
        "x-fastedge-token": server.token,
        Host: "localhost",
      },
    });
    expect(res.status).toBe(200);
  });

  it("GET /api/environment → 200 with Host: 127.0.0.1", async () => {
    const res = await fetch(`${server.base}/api/environment`, {
      headers: {
        "x-fastedge-token": server.token,
        Host: "127.0.0.1",
      },
    });
    expect(res.status).toBe(200);
  });

  // ── schema route allowlist ────────────────────────────────────────────────

  it("GET /api/schema/fastedge-config.test → 200 with valid schema name", async () => {
    const res = await authedFetch(
      server.base,
      server.token,
      "/api/schema/fastedge-config.test",
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe("object");
  });

  it("GET /api/schema/nonexistent → 404", async () => {
    const res = await authedFetch(
      server.base,
      server.token,
      "/api/schema/nonexistent",
    );
    expect(res.status).toBe(404);
  });

  it("GET /api/schema/ with encoded traversal → 404 (allowlist blocks it)", async () => {
    // Path normalization strips plain '../' before Express sees it, so use
    // a percent-encoded slash to get the traversal into the :name param.
    const res = await authedFetch(
      server.base,
      server.token,
      "/api/schema/..%2Fetc%2Fpasswd",
    );
    expect(res.status).toBe(404);
  });

  // ── save-as pre-flight ────────────────────────────────────────────────────

  it("POST /api/config/save-as with unregistered path → 403", async () => {
    const res = await authedFetch(
      server.base,
      server.token,
      "/api/config/save-as",
      {
        method: "POST",
        body: JSON.stringify({
          filePath: "/tmp/never-vended.json",
          config: {
            appType: "proxy-wasm",
            request: { url: "https://example.com/" },
          },
        }),
      },
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/not vended/);
  });

  // ── load path containment ─────────────────────────────────────────────────

  it("POST /api/load with wasmPath escaping WORKSPACE_PATH → 400", async () => {
    const res = await authedFetch(server.base, server.token, "/api/load", {
      method: "POST",
      body: JSON.stringify({
        wasmPath: resolve(server.workspacePath, "../../etc/passwd.wasm"),
      }),
    });
    expect(res.status).toBe(400);
  });
});
