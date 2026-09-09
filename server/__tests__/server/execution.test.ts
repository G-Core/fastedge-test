import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { startTestServer, authedFetch, type TestServer } from "./helpers.js";

const CDN_WASM = resolve(
  process.cwd(),
  "wasm/cdn-apps/as/headers/headers.wasm",
);
const HTTP_WASM = resolve(
  process.cwd(),
  "wasm/http-apps/js/hello-world.wasm",
);

describe("debugger HTTP server — execution smoke tests", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  // ── proxy-wasm (CDN) flow ─────────────────────────────────────────────────

  describe("proxy-wasm flow", () => {
    it("POST /api/load with cdn WASM binary → ok:true, type:cdn", async () => {
      const buf = await readFile(CDN_WASM);
      const res = await authedFetch(server.base, server.token, "/api/load", {
        method: "POST",
        body: JSON.stringify({ wasmBase64: buf.toString("base64") }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.wasmType).toBe("proxy-wasm");
    });

    it("POST /api/execute runs the cdn runner and returns a finalResponse", async () => {
      const res = await authedFetch(server.base, server.token, "/api/execute", {
        method: "POST",
        body: JSON.stringify({
          url: "https://example.com/",
          request: { method: "GET", headers: {}, body: "" },
          properties: {},
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      // finalResponse.status is 0 only on a fetch error; a real runner execution
      // returns a non-zero HTTP status from the proxy-wasm pipeline
      expect(body.finalResponse?.status).toBeGreaterThan(0);
    });

    it("PATCH /api/dotenv with path escaping WORKSPACE_PATH → 400", async () => {
      // Requires a runner to be loaded (tested above); containment is enforced before apply
      const res = await authedFetch(server.base, server.token, "/api/dotenv", {
        method: "PATCH",
        body: JSON.stringify({
          dotenv: { enabled: true, path: "/etc/shadow" },
        }),
      });
      expect(res.status).toBe(400);
    });
  });

  // ── http-wasm flow ────────────────────────────────────────────────────────

  describe(
    "http-wasm flow",
    { skip: !existsSync(HTTP_WASM) },
    () => {
      it("POST /api/load with http-wasm binary → ok:true, type:http-wasm", async () => {
        const buf = await readFile(HTTP_WASM);
        const res = await authedFetch(server.base, server.token, "/api/load", {
          method: "POST",
          body: JSON.stringify({ wasmBase64: buf.toString("base64") }),
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.wasmType).toBe("http-wasm");
      });

      it("POST /api/execute runs the http-wasm runner and returns a status", async () => {
        const res = await authedFetch(
          server.base,
          server.token,
          "/api/execute",
          {
            method: "POST",
            body: JSON.stringify({
              path: "/",
              method: "GET",
              headers: {},
              body: "",
            }),
          },
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.result?.status).toBeGreaterThan(0);
      });

      it("PATCH /api/dotenv enabled:false → 200 after load", async () => {
        const res = await authedFetch(
          server.base,
          server.token,
          "/api/dotenv",
          {
            method: "PATCH",
            body: JSON.stringify({ dotenv: { enabled: false } }),
          },
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
      });
    },
  );
});
