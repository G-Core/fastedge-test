/**
 * Storage Explorer API (/api/storage/*): browse and edit the local cache and Edge KV, import data,
 * and save Edge KV back to fixture files (diff first, then save what the diff showed).
 *
 * Unlike the app views' Storage panel (/api/stores), it works with no app loaded: it starts the
 * storage service when needed. Edits live in the service until it restarts or resets (both reload
 * the fixtures), so Save to fixtures is how they are kept. Apps still only read Edge KV.
 */
import type { Express, Request, Response } from "express";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, lstatSync } from "node:fs";
import path from "node:path";
import type { ZodType } from "zod";
import { request as storesRequest, resolveStoresRoot, type StoresConnection } from "./stores/StoresManager.js";
import { kvSeed, assertInsideRoot } from "./stores/fixtures.js";
import {
  ApiStorageKvPutSchema,
  ApiStorageKvKeySchema,
  ApiStorageKvStoreSchema,
  ApiStorageCachePutSchema,
  ApiStorageCacheKeySchema,
  ApiStorageCacheExpireSchema,
  ApiStorageImportSchema,
  ApiStorageFixturesSaveSchema,
} from "./schemas/index.js";

/** A change Save to fixtures would make to one file (relative to the stores root). */
export type FixtureChange = {
  store: string;
  file: string;
  status: "new" | "changed" | "deleted";
  /** The file as it is now (null = no file). */
  current: string | null;
  /** The file after saving (null = deleted). */
  proposed: string | null;
  /** Pass back to save: it writes only what this diff showed. */
  hash: string;
};

const KV_DIR = path.join("fixtures", "stores", "kv");

export function mountStorageExplorer(
  app: Express,
  getStores: () => Promise<StoresConnection | null>,
  workspace: () => string,
  /** The loaded app's cache bucket, if an app with stores is loaded (the default dc). */
  appDc: () => string | null,
): void {
  const call = async (kind: "admin" | "cache", body: Record<string, unknown>): Promise<unknown> => {
    const connection = await getStores();
    if (!connection) throw new HttpError(503, "the storage service is not available");
    const reply = await storesRequest(connection, kind, body);
    if (!reply.ok) {
      throw new HttpError(
        reply.error === "bad-request" ? 409 : 500,
        reply.error === "bad-request"
          ? "the running storage service does not support this (it is older than this debugger): close other fastedge-test instances, then restart this debugger"
          : `stores service: ${reply.error}`,
      );
    }
    return reply.value;
  };

  /** A route: parse the body with `schema`, run `work`, answer { ok, ...result } or the error. */
  const route = <T>(schema: ZodType<T> | null, work: (body: T, req: Request) => Promise<object | void>) =>
    async (req: Request, res: Response) => {
      let body = req.body as T;
      if (schema) {
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) return void res.status(400).json({ ok: false, error: parsed.error.flatten() });
        body = parsed.data;
      }
      try {
        res.json({ ok: true, ...((await work(body, req)) ?? {}) });
      } catch (error) {
        const status = error instanceof HttpError ? error.status : 500;
        res.status(status).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    };

  const kvRoot = () => path.join(resolveStoresRoot(workspace()), KV_DIR);

  /** What Save to fixtures would change: every store's file against what the service holds. */
  const diff = async (): Promise<FixtureChange[]> => {
    const exported = (await call("admin", { op: "kv-export" })) as Record<string, string>;
    const dir = kvRoot();
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")) : [];
    const stores = new Set([...Object.keys(exported), ...files.map((f) => f.slice(0, -".json".length))]);
    const changes: FixtureChange[] = [];
    for (const store of [...stores].sort()) {
      // Only names that are plain file names (any other store is not written).
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(store)) continue;
      const file = path.join(KV_DIR, `${store}.json`);
      const full = path.join(dir, `${store}.json`);
      if (existsSync(full)) assertInsideRoot(full, resolveStoresRoot(workspace()));
      const current = existsSync(full) ? readFileSync(full, "utf8") : null;
      const proposed = exported[store] ?? null;
      if (current === proposed) continue;
      // Compare as data: a hand-written file that only differs in layout is not a change.
      if (current !== null && proposed !== null && sameData(current, proposed)) continue;
      const status = current === null ? "new" : proposed === null ? "deleted" : "changed";
      const hash = createHash("sha256").update(`${file}\0${current ?? ""}\0${proposed ?? ""}`).digest("hex");
      changes.push({ store, file, status, current, proposed, hash });
    }
    return changes;
  };

  // ── browse ──
  app.get("/api/storage", route(null, async (_b, req) => {
    const loaded = appDc();
    const dc = typeof req.query.dc === "string" && req.query.dc ? req.query.dc : loaded ?? "local";
    return { appDc: loaded, ...((await call("admin", { op: "snapshot", dc })) as object) };
  }));

  app.get("/api/storage/value", route(null, async (_b, req) => {
    const { dc, store, key } = req.query;
    if (typeof key !== "string" || (typeof dc === "string") === (typeof store === "string")) {
      throw new HttpError(400, "key and exactly one of dc / store are required");
    }
    return { value: await call("admin", { op: "inspect", key, ...(typeof dc === "string" ? { dc } : { store }) }) };
  }));

  // ── Edge KV edits ──
  app.post("/api/storage/kv/put", route(ApiStorageKvPutSchema, async (body) => {
    const data =
      body.type === "string" ? { strings: { [body.key]: body.value } }
      : body.type === "zset" ? { zsets: { [body.key]: body.members } }
      : { bloom: { [body.key]: body.items } };
    validate(data);
    await call("admin", { op: "kv-put", store: body.store, key: body.key, data });
  }));

  app.post("/api/storage/kv/delete", route(ApiStorageKvKeySchema, async (body) => {
    await call("admin", { op: "kv-delete", store: body.store, key: body.key });
  }));

  app.post("/api/storage/kv/store", route(ApiStorageKvStoreSchema, async (body) => {
    await call("admin", { op: "kv-store-create", store: body.store });
  }));

  app.post("/api/storage/kv/store/delete", route(ApiStorageKvStoreSchema, async (body) => {
    await call("admin", { op: "kv-store-delete", store: body.store });
  }));

  app.post("/api/storage/import", route(ApiStorageImportSchema, async (body) => {
    const fixture = isFixture(body.data)
      ? (body.data as Record<string, Record<string, unknown>>)
      : { strings: Object.fromEntries(Object.entries(body.data).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)])) };
    validate(fixture);
    if (body.replace) await call("admin", { op: "kv-store-delete", store: body.store });
    await call("admin", { op: "kv-store-create", store: body.store });
    let keys = 0;
    for (const [section, entries] of Object.entries(fixture)) {
      for (const [key, value] of Object.entries(entries ?? {})) {
        await call("admin", { op: "kv-put", store: body.store, key, data: { [section]: { [key]: value } } });
        keys++;
      }
    }
    return { keys };
  }));

  // ── cache edits ──
  app.post("/api/storage/cache/put", route(ApiStorageCachePutSchema, async (body) => {
    const value = typeof body.value === "string" ? Buffer.from(body.value, "utf8").toString("base64") : body.value.base64;
    await call("cache", { op: "set", dc: body.dc, key: body.key, value, ttlMs: body.ttlMs ?? null });
  }));

  /** New TTL from now, value kept; `updated: false` when the entry is gone or expired. */
  app.post("/api/storage/cache/expire", route(ApiStorageCacheExpireSchema, async (body) => ({
    updated: await call("cache", { op: "expire", dc: body.dc, key: body.key, ttlMs: body.ttlMs }),
  })));

  app.post("/api/storage/cache/delete", route(ApiStorageCacheKeySchema, async (body) => {
    await call("cache", { op: "delete", dc: body.dc, key: body.key });
  }));

  // ── whole stores ──
  app.post("/api/storage/reset", route(null, async () => {
    await call("admin", { op: "reset" });
  }));

  app.post("/api/storage/advance-clock", route(null, async (body: { ms?: unknown }) => {
    const ms = body?.ms;
    if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) throw new HttpError(400, "ms must be a positive number");
    await call("admin", { op: "advance-clock", ms });
  }));

  /** Pause (true) or resume (false) the clock every app sees; advance-clock still moves it. */
  app.post("/api/storage/clock", route(null, async (body: { paused?: unknown }) => {
    if (typeof body?.paused !== "boolean") throw new HttpError(400, "paused must be a boolean");
    return { paused: await call("admin", { op: "pause-clock", paused: body.paused }) };
  }));

  // ── fixtures ──
  app.get("/api/storage/fixtures/diff", route(null, async () => ({ root: resolveStoresRoot(workspace()), changes: await diff() })));

  /** Writes (or deletes) exactly the files the caller approved from the diff; 409 if one changed since. */
  app.post("/api/storage/fixtures/save", route(ApiStorageFixturesSaveSchema, async (body) => {
    const changes = new Map((await diff()).map((c) => [c.file, c]));
    for (const { file, hash } of body.files) {
      if (changes.get(file)?.hash !== hash) throw new HttpError(409, `${file} changed since the diff: get the diff again`);
    }
    const root = resolveStoresRoot(workspace());
    // Never write through a symlink: no part from the stores root to the file may be one
    // (lstat sees dangling links too).
    const isLink = (p: string) => {
      try {
        return lstatSync(p).isSymbolicLink();
      } catch {
        return false;
      }
    };
    for (const { file } of body.files) {
      const parts = file.split(path.sep);
      for (let i = 1; i <= parts.length; i++) {
        const part = parts.slice(0, i).join(path.sep);
        if (isLink(path.join(root, part))) throw new HttpError(400, `${part} is a symlink: not saving through it`);
      }
    }
    for (const { file } of body.files) {
      const change = changes.get(file)!;
      const full = path.join(root, change.file);
      if (change.proposed === null) rmSync(full);
      else {
        mkdirSync(path.dirname(full), { recursive: true });
        writeFileSync(full, change.proposed, "utf8");
      }
    }
    return { saved: body.files.map((f) => f.file) };
  }));
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** Fixture-format data: only `strings`, `zsets` and `bloom` sections. */
function isFixture(data: Record<string, unknown>): boolean {
  const keys = Object.keys(data);
  return keys.length > 0 && keys.every((k) => k === "strings" || k === "zsets" || k === "bloom") &&
    keys.every((k) => typeof data[k] === "object" && data[k] !== null);
}

/** The fixture parser's checks (e.g. an empty KV value, refused on the edge), as a 400. */
function validate(data: unknown): void {
  try {
    kvSeed(data, "data");
  } catch (error) {
    throw new HttpError(400, (error as Error).message);
  }
}

function sameData(a: string, b: string): boolean {
  try {
    return JSON.stringify(normalise(JSON.parse(a))) === JSON.stringify(normalise(JSON.parse(b)));
  } catch {
    return false;
  }
}

function normalise(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(normalise);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, normalise((v as Record<string, unknown>)[k])]));
  return v;
}
