/**
 * Egress SSRF-block integration test.
 *
 * Verifies that when a WASM binary dispatches proxy_http_call to a blocked
 * IP (cloud-metadata link-local range), the egress policy blocks the callout
 * and the runner returns a finalResponse with status 0 / "Fetch Failed" rather
 * than leaking the metadata response.
 *
 * Uses the pre-built cdn-http-call WASM which reads :authority from the
 * incoming request and dispatches_http_call to that authority. When
 * numHeaders == 0 (blocked callout) it calls reset_http_request(); the runner
 * then also blocks the Phase-2 origin fetch, producing status: 0.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { startTestServer, authedFetch, type TestServer } from "./helpers.js";

const HTTP_CALL_WASM = resolve(
  process.cwd(),
  "test-applications/cdn-apps/rust/wasm/cdn-apps/rust/http-call/http-call.wasm",
);

describe("egress policy blocks SSRF callouts", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();

    const buf = await readFile(HTTP_CALL_WASM);
    const load = await authedFetch(server.base, server.token, "/api/load", {
      method: "POST",
      body: JSON.stringify({ wasmBase64: buf.toString("base64") }),
    });
    const loadBody = await load.json();
    if (!loadBody.ok) throw new Error(`WASM load failed: ${JSON.stringify(loadBody)}`);
  });

  afterAll(async () => {
    await server.close();
  });

  it("blocks proxy_http_call to IPv4-mapped IPv6 metadata IP (decimal)", async () => {
    // ::ffff:169.254.169.254 — IPv4-mapped form of the AWS/GCP metadata address
    const res = await authedFetch(server.base, server.token, "/api/execute", {
      method: "POST",
      body: JSON.stringify({
        url: "http://[::ffff:169.254.169.254]/",
        request: { method: "GET", headers: {}, body: "" },
        properties: {},
      }),
    });

    expect(res.status).toBe(200); // API itself succeeds
    const body = await res.json();
    expect(body.ok).toBe(true);

    // Egress policy blocks both the http_call and the Phase-2 origin fetch.
    // The runner returns status 0 / "Fetch Failed" rather than a real response.
    expect(body.finalResponse?.status).toBe(0);
    expect(body.finalResponse?.statusText).toBe("Fetch Failed");
    expect(body.finalResponse?.body).toMatch(/Egress blocked/);
  });

  it("blocks proxy_http_call to IPv4-mapped IPv6 metadata IP (hex)", async () => {
    // ::ffff:a9fe:a9fe — hex form of 169.254.169.254
    const res = await authedFetch(server.base, server.token, "/api/execute", {
      method: "POST",
      body: JSON.stringify({
        url: "http://[::ffff:a9fe:a9fe]/",
        request: { method: "GET", headers: {}, body: "" },
        properties: {},
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    expect(body.finalResponse?.status).toBe(0);
    expect(body.finalResponse?.statusText).toBe("Fetch Failed");
    expect(body.finalResponse?.body).toMatch(/Egress blocked/);
  });
});
