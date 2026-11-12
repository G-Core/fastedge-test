/**
 * Finds or starts the storage service for a stores root, and holds a lease on it.
 *
 * Every client (each debugger server, each test process) calls connectStores(root). The
 * first one starts the service as a detached process; the others find it through
 * `service.json`. A lock file (`service.lock`, created exclusively) makes simultaneous
 * starters agree on one service. Each client renews a lease; the service exits when the
 * last lease is gone. If the service dies, the next renewal restarts it on the same port
 * with the same token, so fastedge-run processes pointed at it keep working.
 *
 * Calls use node:http, not fetch: mockOrigins() replaces the global fetch dispatcher.
 */

import http from "node:http";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { openSync, closeSync, readFileSync, rmSync, statSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { embeddedSource } from "../embedded.js";
import { storesDir, type Descriptor } from "./layout.js";
import { STORES_PROTOCOL } from "./StoresServer.js";
import type { Reply } from "./StoresCore.js";

export type StoresConnection = {
  /** `http://127.0.0.1:<port>`; may change only if the service had to move port. */
  readonly url: string;
  readonly token: string;
  close(): Promise<void>;
};

/** What a runner gets: the connection, its cache bucket, and whether it owns the connection. */
export type RunnerStores = {
  connection: StoresConnection;
  /** The cache bucket (edge location); `local` by default. */
  dc: string;
  /** Close the connection on cleanup() (true when the runner opened it). */
  owned: boolean;
};

export type ConnectOptions = { leaseTtlMs?: number; startTimeoutMs?: number };

const STALE_LOCK_MS = 20_000;

/**
 * The stores root for an app folder: FASTEDGE_STORES_ROOT if set, else the nearest
 * ancestor with `.git` (so sibling app folders in one repo share cache and KV), else the
 * folder itself. Fixtures load from `<root>/fixtures/stores/`.
 */
export function resolveStoresRoot(appRoot: string): string {
  if (process.env.FASTEDGE_STORES_ROOT) return resolve(process.env.FASTEDGE_STORES_ROOT);
  const start = resolve(appRoot);
  for (let dir = start; ; dir = dirname(dir)) {
    if (existsSync(join(dir, ".git"))) return dir;
    if (dirname(dir) === dir) return start;
  }
}

export async function connectStores(root: string, options: ConnectOptions = {}): Promise<StoresConnection> {
  const leaseTtlMs = options.leaseTtlMs ?? 30_000;
  const startTimeoutMs = options.startTimeoutMs ?? 15_000;
  const id = randomUUID();
  let service = await ensureService(root, startTimeoutMs);
  await call(service, "/v1/admin", { op: "lease", id, ttlMs: leaseTtlMs });

  let renewing = false;
  const timer = setInterval(async () => {
    if (renewing) return;
    renewing = true;
    try {
      await call(service, "/v1/admin", { op: "lease", id, ttlMs: leaseTtlMs });
    } catch {
      try {
        service = await ensureService(root, startTimeoutMs);
        await call(service, "/v1/admin", { op: "lease", id, ttlMs: leaseTtlMs });
      } catch (error) {
        console.error(`stores service: ${(error as Error).message}`);
      }
    } finally {
      renewing = false;
    }
  }, Math.max(100, Math.floor(leaseTtlMs / 3)));
  timer.unref();

  return {
    get url() {
      return `http://127.0.0.1:${service.port}`;
    },
    get token() {
      return service.token;
    },
    async close() {
      clearInterval(timer);
      await call(service, "/v1/admin", { op: "release", id }).catch(() => {});
    },
  };
}

async function ensureService(root: string, timeoutMs: number): Promise<Descriptor> {
  const dir = storesDir(root);
  const lock = join(dir, "service.lock");
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const found = readDescriptor(dir);
    if (found && (await alive(found))) return found;

    let fd: number;
    try {
      mkdirSync(dir, { recursive: true });
      fd = openSync(lock, "wx");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      // Someone else is starting it; take over a lock left by a crashed starter.
      try {
        if (Date.now() - statSync(lock).mtimeMs > STALE_LOCK_MS) rmSync(lock, { force: true });
      } catch {
        // removed meanwhile
      }
      await sleep(100);
      continue;
    }

    try {
      const again = readDescriptor(dir);
      if (again && (await alive(again))) return again;
      // Reuse a dead service's port and token, so clients started against it reconnect.
      const token = again?.token ?? randomBytes(24).toString("hex");
      start(root, token, again?.port ?? 0);
      while (Date.now() < deadline) {
        const started = readDescriptor(dir);
        if (started && started.token === token && (await alive(started))) return started;
        if (startFailed(dir)) break;
        await sleep(50);
      }
      throw new Error(`could not start the stores service${logTail(dir)}`);
    } finally {
      closeSync(fd);
      rmSync(lock, { force: true });
    }
  }
  throw new Error(`timed out waiting for the stores service${logTail(dir)}`);
}

function start(root: string, token: string, port: number): void {
  const child = spawn(process.execPath, ["-"], {
    detached: true,
    windowsHide: true,
    stdio: ["pipe", "ignore", "ignore"],
    env: {
      ...process.env,
      FASTEDGE_STORES_ROOT: root,
      FASTEDGE_STORES_TOKEN: token,
      FASTEDGE_STORES_PORT: String(port),
    },
  });
  child.stdin!.end(embeddedSource("stores-service"));
  child.unref();
}

function readDescriptor(dir: string): Descriptor | undefined {
  try {
    return JSON.parse(readFileSync(join(dir, "service.json"), "utf8")) as Descriptor;
  } catch {
    return undefined;
  }
}

async function alive(d: Descriptor): Promise<boolean> {
  try {
    const info = (await call(d, "/v1/admin", { op: "info" }, 1000)) as { protocol: number };
    if (info.protocol !== STORES_PROTOCOL) {
      throw new ProtocolMismatch(
        `the stores service for this workspace speaks protocol ${info.protocol}, this fastedge-test needs ${STORES_PROTOCOL}: ` +
          `close the other fastedge-test version, or stop process ${d.pid}`,
      );
    }
    return true;
  } catch (error) {
    if (error instanceof ProtocolMismatch) throw error;
    return false;
  }
}

class ProtocolMismatch extends Error {}

function startFailed(dir: string): boolean {
  try {
    return readFileSync(join(dir, "service.log"), "utf8").includes("start failed");
  } catch {
    return false;
  }
}

function logTail(dir: string): string {
  try {
    const log = readFileSync(join(dir, "service.log"), "utf8").trim();
    return log ? `: ${log.split("\n").slice(-5).join("\n")}` : "";
  } catch {
    return "";
  }
}

/** A store operation: the service's reply as is (`ok: false` included); rejects on transport failure. */
export function request(conn: { url: string; token: string }, kind: "cache" | "kv" | "admin", body: unknown): Promise<Reply> {
  return send({ port: Number(new URL(conn.url).port), token: conn.token }, `/v1/${kind}`, body, 4000);
}

/** One JSON call to the service; resolves the reply's value, rejects on anything else. */
export async function call(d: Pick<Descriptor, "port" | "token">, path: string, body: unknown, timeoutMs = 4000): Promise<unknown> {
  const reply = await send(d, path, body, timeoutMs);
  if (!reply.ok) throw new Error(`stores service: ${reply.error}`);
  return reply.value;
}

function send(d: Pick<Descriptor, "port" | "token">, path: string, body: unknown, timeoutMs: number): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: d.port,
        method: "POST",
        path,
        headers: { authorization: `Bearer ${d.token}`, "content-type": "application/json" },
        timeout: timeoutMs,
        agent: false, // no pooled keep-alive sockets holding the process open
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          try {
            const reply = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Reply;
            if (typeof reply.ok !== "boolean") throw new Error();
            resolve(reply);
          } catch {
            reject(new Error(`stores service: HTTP ${res.statusCode}`));
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("stores service: timeout")));
    req.on("error", reject);
    req.end(JSON.stringify(body));
  });
}
