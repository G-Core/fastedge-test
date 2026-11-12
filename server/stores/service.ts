/**
 * The storage service process: one per stores root, started by StoresManager
 * (`node -` with this code on stdin, detached).
 *
 * Env: FASTEDGE_STORES_ROOT (the stores root), FASTEDGE_STORES_TOKEN, FASTEDGE_STORES_PORT
 * (preferred port, so fastedge-run processes started before a restart can reconnect; 0 = any).
 *
 * Files in `<root>/.fastedge-debug/stores/`: `stores.db`, `service.json` (descriptor, written
 * once listening, removed on exit), `service.log`. Fixtures load from `<root>/fixtures/stores/`.
 * Exits when no client lease is live, after a start grace period.
 */

import { DatabaseSync } from "node:sqlite";
import { mkdirSync, writeFileSync, renameSync, rmSync, readFileSync, appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { StoresCore } from "./StoresCore.js";
import { loadFixtures } from "./fixtures.js";
import { startStoresServer, STORES_PROTOCOL, type StoresServer } from "./StoresServer.js";
import { storesDir, type Descriptor } from "./layout.js";

const START_GRACE_MS = Number(process.env.FASTEDGE_STORES_GRACE_MS ?? 15_000);

async function main(): Promise<void> {
  const root = process.env.FASTEDGE_STORES_ROOT!;
  const token = process.env.FASTEDGE_STORES_TOKEN!;
  const dir = storesDir(root);
  mkdirSync(dir, { recursive: true });
  if (!existsSync(join(dir, ".gitignore"))) writeFileSync(join(dir, ".gitignore"), "*\n");
  writeFileSync(join(dir, "service.log"), "");
  const log = (line: string) => appendFileSync(join(dir, "service.log"), `${new Date().toISOString()} ${line}\n`);

  try {
    const core = new StoresCore(new DatabaseSync(join(dir, "stores.db")));
    loadFixtures(core, root);
    const server = await listen(core, token, Number(process.env.FASTEDGE_STORES_PORT ?? 0));

    const descriptor: Descriptor = { pid: process.pid, port: server.port, token, protocol: STORES_PROTOCOL };
    const file = join(dir, "service.json");
    writeFileSync(`${file}.${process.pid}`, JSON.stringify(descriptor), { mode: 0o600 });
    renameSync(`${file}.${process.pid}`, file);
    log(`listening on 127.0.0.1:${server.port} (pid ${process.pid})`);

    const shutdown = (why: string) => {
      log(`exiting: ${why}`);
      try {
        if ((JSON.parse(readFileSync(file, "utf8")) as Descriptor).pid === process.pid) rmSync(file);
      } catch {
        // already gone or replaced
      }
      void server.close();
      process.exit(0);
    };
    const started = Date.now();
    setInterval(() => {
      if (Date.now() - started > START_GRACE_MS && server.liveLeases() === 0) shutdown("no clients");
    }, 1000);
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    log(`start failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

async function listen(core: StoresCore, token: string, port: number): Promise<StoresServer> {
  try {
    return await startStoresServer(core, token, port);
  } catch (error) {
    if (port === 0 || (error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
    return startStoresServer(core, token, 0);
  }
}

void main();
