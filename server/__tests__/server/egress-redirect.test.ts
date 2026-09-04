/**
 * Egress redirect non-following test.
 *
 * Verifies that when the upstream origin returns a 3xx redirect, the debugger
 * server does NOT follow it to the Location target. The redirect response is
 * returned to the WASM pipeline as-is.
 *
 * This exercises the redirect: "manual" guard on the upstream fetch path.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { startTestServer, authedFetch, type TestServer } from "./helpers.js";

const CDN_WASM = resolve(process.cwd(), "wasm/cdn-apps/as/headers/headers.wasm");

/** Start a one-shot HTTP server that always responds with 302 → destination. */
function startRedirectServer(destination: string): Promise<{ base: string; close: () => Promise<void> }> {
  return new Promise((res, rej) => {
    const srv: Server = createServer((_req, resp) => {
      resp.writeHead(302, { Location: destination });
      resp.end();
    });
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address() as { port: number };
      res({
        base: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise<void>((r, e) => srv.close((err) => (err ? e(err) : r()))),
      });
    });
    srv.on("error", rej);
  });
}

describe("upstream redirect is not followed", () => {
  let server: TestServer;
  let redirect: { base: string; close: () => Promise<void> };

  beforeAll(async () => {
    // Port 1 is unprivileged-blocked; following the redirect would produce a
    // network error, not a 302 — so a 302 in finalResponse proves no following.
    redirect = await startRedirectServer("http://127.0.0.1:1/");
    server = await startTestServer();

    // Load the CDN WASM so /api/execute is available.
    const buf = await readFile(CDN_WASM);
    const load = await authedFetch(server.base, server.token, "/api/load", {
      method: "POST",
      body: JSON.stringify({ wasmBase64: buf.toString("base64") }),
    });
    const loadBody = await load.json();
    if (!loadBody.ok) throw new Error(`WASM load failed: ${JSON.stringify(loadBody)}`);
  });

  afterAll(async () => {
    await server.close();
    await redirect.close();
  });

  it("302 from upstream is returned to WASM, not followed", async () => {
    const res = await authedFetch(server.base, server.token, "/api/execute", {
      method: "POST",
      body: JSON.stringify({
        url: redirect.base + "/",
        request: { method: "GET", headers: {}, body: "" },
        properties: {},
      }),
    });

    expect(res.status).toBe(200); // API itself succeeds
    const body = await res.json();
    expect(body.ok).toBe(true);

    // The upstream returned 302. With redirect: "manual" the status is
    // returned as-is (302), not followed (which would yield a network error
    // and status 0, or a response from 127.0.0.1:1 which is unreachable).
    expect(body.finalResponse?.status).toBe(302);
  });
});
