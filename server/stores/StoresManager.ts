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
import { openSync, closeSync, readFileSync, rmSync, statSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { embeddedSource } from "../embedded.js";
import { storesDir, type Descriptor } from "./layout.js";
import { STORES_PROTOCOL } from "./StoresServer.js";

export type StoresConnection = {
  /** `http://127.0.0.1:<port>`; may change only if the service had to move port. */
  readonly url: string;
  readonly token: string;
  close(): Promise<void>;
};

export type ConnectOptions = { leaseTtlMs?: number; startTimeoutMs?: number };

const STALE_LOCK_MS = 20_000;

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

/** One JSON call to the service; resolves the reply's value, rejects on anything else. */
export function call(d: Pick<Descriptor, "port" | "token">, path: string, body: unknown, timeoutMs = 4000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: d.port,
        method: "POST",
        path,
        headers: { authorization: `Bearer ${d.token}`, "content-type": "application/json" },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          try {
            const reply = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            if (reply.ok) resolve(reply.value);
            else reject(new Error(`stores service: ${reply.error}`));
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
