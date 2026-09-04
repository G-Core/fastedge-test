import { describe, it, expect, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";
import { startTestServer, type TestServer } from "./helpers.js";

/**
 * Connect a WebSocket and wait for open/error/rejection.
 * Returns the code that the server closed with, or "open" if it connected.
 */
function wsConnect(
  url: string,
  origin?: string,
): Promise<"open" | number> {
  return new Promise((resolve) => {
    const opts = origin ? { origin } : {};
    const ws = new WebSocket(url, opts);
    ws.once("open", () => {
      ws.close();
      resolve("open");
    });
    // Unexpected close before open → rejected by verifyClient
    ws.once("unexpected-response", (_req, res) => {
      resolve(res.statusCode ?? 401);
    });
    ws.once("error", () => {
      resolve(401);
    });
  });
}

describe("debugger WebSocket server — origin and token checks", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  // ── origin checks ──────────────────────────────────────────────────────────

  it("WS upgrade with localhost origin → accepted", async () => {
    const port = new URL(server.base).port;
    const result = await wsConnect(
      `ws://127.0.0.1:${port}/ws?token=${server.token}`,
      `http://localhost:${port}`,
    );
    expect(result).toBe("open");
  });

  it("WS upgrade with superdomain origin (localhost.evil.com) → rejected", async () => {
    const port = new URL(server.base).port;
    const result = await wsConnect(
      `ws://127.0.0.1:${port}/ws?token=${server.token}`,
      "https://localhost.evil.com",
    );
    expect(result).not.toBe("open");
  });

  // ── token checks ───────────────────────────────────────────────────────────

  it("WS upgrade with valid ?token= query param → accepted", async () => {
    const port = new URL(server.base).port;
    // No origin header — simulates a non-browser client
    const result = await wsConnect(
      `ws://127.0.0.1:${port}/ws?token=${server.token}`,
    );
    expect(result).toBe("open");
  });

  it("WS upgrade with wrong token → rejected", async () => {
    const port = new URL(server.base).port;
    const result = await wsConnect(
      `ws://127.0.0.1:${port}/ws?token=wrong-token`,
    );
    expect(result).not.toBe("open");
  });
});
