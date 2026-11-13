/**
 * Isolated stores for tests: an in-memory storage service inside the test process (no
 * detached process, lock or lease), seeded from `fixtures/stores/`. Pass it to runners as
 * `RunnerConfig.stores`; CDN and HTTP runners given the same instance share its data.
 * `close()` drops everything.
 */

import { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";
import { StoresCore } from "./StoresCore.js";
import { startStoresServer, type StoresServer } from "./StoresServer.js";
import { loadFixtures, applySeed, type StoresSeed } from "./fixtures.js";
import { resolveStoresRoot } from "./StoresManager.js";

export type CreateStoresOptions = {
  /** Where `fixtures/stores/` is looked up (default: the stores root of the cwd); `false` = none. */
  fixtures?: string | false;
  /** Default cache bucket for runners and the `cache` helpers (default `local`). */
  dc?: string;
};

export interface TestStores {
  /** Service address; runners use it when given this instance as `RunnerConfig.stores`. */
  readonly url: string;
  readonly token: string;
  /** Default cache bucket. */
  readonly dc: string;
  /** Read and write the cache directly (string values are UTF-8). */
  readonly cache: {
    get(key: string, options?: { dc?: string }): string | null;
    set(key: string, value: string | Uint8Array, options?: { ttlMs?: number; dc?: string }): void;
    delete(key: string, options?: { dc?: string }): void;
  };
  /** Add data in the fixture formats: named KV stores are replaced, cache keys overwritten. */
  seed(data: StoresSeed): void;
  /** Move the service clock (cache expiry) for every runner on these stores. */
  advanceClock(ms: number): void;
  /** Back to the fixtures: cache emptied, KV re-seeded. */
  reset(): void;
  /** Stop the service; its data is gone. */
  close(): Promise<void>;
}

export async function createStores(options: CreateStoresOptions = {}): Promise<TestStores> {
  const db = new DatabaseSync(":memory:");
  const core = new StoresCore(db);
  const root =
    options.fixtures === false ? null : (options.fixtures ?? resolveStoresRoot(process.env.WORKSPACE_PATH || process.cwd()));
  const fixtures = () => {
    if (root) loadFixtures(core, root);
    else core.seedKv({});
  };
  const token = randomBytes(24).toString("hex");
  let server: StoresServer;
  try {
    fixtures();
    server = await startStoresServer(core, token);
  } catch (error) {
    db.close(); // a bad fixture must not leave the database open
    throw error;
  }
  const dc = options.dc ?? "local";

  const cacheOp = (body: Record<string, unknown>) => {
    const reply = core.cache({ dc, ...body });
    if (!reply.ok) throw new Error(`stores: cache ${String(body.op)} failed: ${reply.error}`);
    return reply.value;
  };

  return {
    url: `http://127.0.0.1:${server.port}`,
    token,
    dc,
    cache: {
      get: (key, o) => {
        const value = cacheOp({ op: "get", key, ...(o?.dc ? { dc: o.dc } : {}) });
        return value === null ? null : Buffer.from(value as string, "base64").toString("utf8");
      },
      set: (key, value, o) =>
        void cacheOp({
          op: "set",
          key,
          value: Buffer.from(value).toString("base64"),
          ttlMs: o?.ttlMs === undefined ? null : String(o.ttlMs),
          ...(o?.dc ? { dc: o.dc } : {}),
        }),
      delete: (key, o) => void cacheOp({ op: "delete", key, ...(o?.dc ? { dc: o.dc } : {}) }),
    },
    seed: (data) => applySeed(core, data),
    advanceClock: (ms) => void core.advanceClock(ms),
    reset: () => {
      core.clearCache();
      fixtures();
    },
    close: async () => {
      await server.close();
      db.close();
    },
  };
}
