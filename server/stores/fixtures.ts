/**
 * Store fixtures, by convention under `<root>/fixtures/stores/`:
 *
 *   kv/<store>.json   Edge KV  { "strings": { key: value }, "zsets": { key: [[member, score]] },
 *                              "bloom": { key: [item] } }
 *   cache/<dc>.json   cache    { key: { "value": "text" } | { "base64": "..." }, optional "ttl_ms" }
 *
 * A value (string value, zset member) is a UTF-8 string or `{ "base64": "..." }`.
 * KV fixtures replace all KV data at service start; cache fixtures overwrite their keys
 * (with a fresh TTL from load) and leave other cached entries alone.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import type { KvSeed, StoresCore } from "./StoresCore.js";

export function loadFixtures(core: StoresCore, root: string): void {
  const dir = join(root, "fixtures", "stores");
  const kv: Record<string, KvSeed> = {};
  for (const [name, data] of jsonFiles(join(dir, "kv"))) kv[name] = kvSeed(data, name);
  core.seedKv(kv);
  for (const [dc, data] of jsonFiles(join(dir, "cache"))) core.seedCache(dc, cacheSeed(data, dc));
}

function jsonFiles(dir: string): [string, unknown, string][] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const path = join(dir, f);
      try {
        return [basename(f, ".json"), JSON.parse(readFileSync(path, "utf8")), path];
      } catch (error) {
        throw new Error(`stores fixture ${path}: ${(error as Error).message}`);
      }
    });
}

function kvSeed(data: unknown, store: string): KvSeed {
  const where = `fixtures/stores/kv/${store}.json`;
  const o = record(data, where);
  const seed: KvSeed = { strings: {}, zsets: {}, bloom: {} };
  for (const [k, v] of Object.entries(record(o.strings ?? {}, `${where} strings`))) {
    seed.strings[k] = value(v, `${where} strings.${k}`);
    // The edge API refuses an empty KV value (cache values may be empty).
    if (!seed.strings[k].length) throw new Error(`${where} strings.${k}: Edge KV values cannot be empty`);
  }
  for (const [k, v] of Object.entries(record(o.zsets ?? {}, `${where} zsets`))) {
    if (!Array.isArray(v)) throw new Error(`${where} zsets.${k}: expected [[member, score], ...]`);
    seed.zsets[k] = v.map((pair, i) => {
      if (!Array.isArray(pair) || typeof pair[1] !== "number") {
        throw new Error(`${where} zsets.${k}[${i}]: expected [member, score]`);
      }
      return [value(pair[0], `${where} zsets.${k}[${i}]`), pair[1]];
    });
  }
  for (const [k, v] of Object.entries(record(o.bloom ?? {}, `${where} bloom`))) {
    if (!Array.isArray(v) || !v.every((i) => typeof i === "string")) {
      throw new Error(`${where} bloom.${k}: expected an array of strings`);
    }
    seed.bloom[k] = v;
  }
  return seed;
}

function cacheSeed(data: unknown, dc: string): Record<string, { value: Uint8Array; ttlMs: number | null }> {
  const where = `fixtures/stores/cache/${dc}.json`;
  const out: Record<string, { value: Uint8Array; ttlMs: number | null }> = {};
  for (const [k, v] of Object.entries(record(data, where))) {
    const e = record(v, `${where} ${k}`);
    const ttl = e.ttl_ms;
    if (ttl !== undefined && !(Number.isSafeInteger(ttl) && (ttl as number) >= 0)) {
      throw new Error(`${where} ${k}.ttl_ms: expected a non-negative integer`);
    }
    out[k] = { value: value(e.base64 !== undefined ? { base64: e.base64 } : e.value, `${where} ${k}`), ttlMs: (ttl as number) ?? null };
  }
  return out;
}

function record(v: unknown, where: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error(`${where}: expected an object`);
  return v as Record<string, unknown>;
}

function value(v: unknown, where: string): Uint8Array {
  if (typeof v === "string") return Buffer.from(v, "utf8");
  if (typeof v === "object" && v !== null && typeof (v as { base64?: unknown }).base64 === "string") {
    return Buffer.from((v as { base64: string }).base64, "base64");
  }
  throw new Error(`${where}: expected a string or { "base64": "..." }`);
}
