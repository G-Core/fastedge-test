/**
 * The storage service's HTTP API (`/v1`), on 127.0.0.1 only.
 *
 * - `POST /v1/cache`, `POST /v1/kv`: store operations (see StoresCore).
 * - `POST /v1/admin`: `{ op: "info" }` → protocol version; `{ op: "kv-stores" }` → seeded
 *   Edge KV store names; `{ op: "advance-clock", ms }`;
 *   `{ op: "lease", id, ttlMs }` / `{ op: "release", id }`: client leases (wall clock), so the
 *   service process can exit when the last client is gone.
 *
 * Every request needs `authorization: Bearer <token>` and a `Host` of
 * `127.0.0.1:<port>` or `localhost:<port>` (no DNS rebinding). Operation results are
 * JSON with status 200; a malformed request is 400 `{ ok: false, error: "bad-request" }`;
 * auth, host or path failures get an empty 401/403/404, which clients treat as an
 * internal error.
 */

import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import type { AddressInfo } from "node:net";
import { BadRequest, type Reply, type StoresCore } from "./StoresCore.js";

export const STORES_PROTOCOL = 1;

export type StoresServer = { port: number; liveLeases(): number; close(): Promise<void> };

export function startStoresServer(core: StoresCore, token: string, port = 0): Promise<StoresServer> {
  if (!token) throw new Error("stores service: a token is required");
  const expected = Buffer.from(`Bearer ${token}`);
  const leases = new Map<string, number>(); // id → expiry (wall clock)
  const authorized = (header: string | undefined) => {
    const got = Buffer.from(header ?? "");
    return got.length === expected.length && timingSafeEqual(got, expected);
  };

  const server = http.createServer((req, res) => {
    const { port: own } = server.address() as AddressInfo;
    if (req.headers.host !== `127.0.0.1:${own}` && req.headers.host !== `localhost:${own}`) {
      return void res.writeHead(403).end();
    }
    if (!authorized(req.headers.authorization)) return void res.writeHead(401).end();
    const route = req.method === "POST" ? routes[req.url ?? ""] : undefined;
    if (!route) return void res.writeHead(404).end();

    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      let status = 200;
      let reply: Reply;
      try {
        reply = route(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        if (error instanceof BadRequest || error instanceof SyntaxError) {
          status = 400;
          reply = { ok: false, error: "bad-request" };
        } else {
          console.error("stores service:", error);
          status = 500;
          reply = { ok: false, error: "internal-error" };
        }
      }
      res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(reply));
    });
  });

  const routes: Record<string, (body: Record<string, unknown>) => Reply> = {
    "/v1/cache": (b) => core.cache(object(b)),
    "/v1/kv": (b) => core.kv(object(b)),
    "/v1/admin": (b) => {
      const body = object(b);
      if (body.op === "info") return { ok: true, value: { protocol: STORES_PROTOCOL } };
      if (body.op === "kv-stores") return { ok: true, value: core.kvStores() };
      if (body.op === "advance-clock" && typeof body.ms === "number") {
        return { ok: true, value: core.advanceClock(body.ms) };
      }
      if (body.op === "lease" && typeof body.id === "string" && typeof body.ttlMs === "number") {
        leases.set(body.id, Date.now() + body.ttlMs);
        return { ok: true, value: null };
      }
      if (body.op === "release" && typeof body.id === "string") {
        leases.delete(body.id);
        return { ok: true, value: null };
      }
      throw new BadRequest("unknown admin op");
    },
  };

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      resolve({
        port: (server.address() as AddressInfo).port,
        liveLeases: () => {
          const now = Date.now();
          for (const [id, expiry] of leases) if (expiry <= now) leases.delete(id);
          return leases.size;
        },
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

function object(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new BadRequest("body must be an object");
  return body as Record<string, unknown>;
}
