/**
 * FastEdge proxy-wasm host functions for the cache (`proxy_cache_*`) and Edge KV
 * (`proxy_kv_store_*`), over a synchronous connection to the storage service.
 *
 * Signatures, encodings and statuses follow the FastEdge engine
 * (crates/proxywasm/src/host/cache.rs and key_value.rs):
 * - a key, pattern or item that is not UTF-8 → BadArgument;
 * - cache: access denied / bad argument → BadArgument, anything else → InternalFailure;
 *   `set` TTL 0 = default, negative = BadArgument; a missing key on `get` is Ok with the
 *   out-params untouched; an empty value is a real empty value;
 * - KV: `open` of a store not attached to the app → BadArgument (NotFound for no such
 *   store); a key of the wrong type → BadArgument; anything else → InternalFailure;
 *   lists are `[i32 count][i32 size]...[bytes NUL]...`, a sorted-set entry is the member
 *   followed by its f64 score (little endian).
 *
 * With stores off (`stores` null) the functions still link: every call returns
 * InternalFailure and the first one logs why.
 */

import type { MemoryManager } from "./MemoryManager.js";
import type { SyncStores } from "./storesBridge.js";
import { ProxyStatus } from "./types.js";

const { Ok, NotFound, BadArgument, InternalFailure } = ProxyStatus;
const utf8 = new TextDecoder("utf-8", { fatal: true });

type Fn = (...args: never[]) => number;

export function storesImports(
  memory: MemoryManager,
  stores: SyncStores | null,
  log: (message: string) => void,
): Record<string, Fn> {
  const handles: string[] = []; // KV handle → store name, per instance (one hook)

  const text = (ptr: number, len: number): string | null => {
    try {
      return utf8.decode(memory.readBytes(ptr, len));
    } catch {
      return null;
    }
  };
  const cacheStatus = (error: string) =>
    error === "bad-argument" || error === "access-denied" ? BadArgument : InternalFailure;
  const kvStatus = (error: string) => (error === "wrong-type" ? BadArgument : InternalFailure);

  let warned = false;
  /** Wraps every function: stores off → InternalFailure, logged once per hook. */
  const host = <A extends unknown[]>(name: string, run: (s: SyncStores, ...args: A) => number) =>
    ((...args: A) => {
      if (stores) return run(stores, ...args);
      if (!warned) {
        warned = true;
        log(`[host] stores are off: ${name} (and every cache / KV call) returns InternalFailure`);
      }
      return InternalFailure;
    }) as unknown as Fn;

  /** Cache op on a UTF-8 key; `done` writes the out-params of a success. */
  const cacheKey = (
    s: SyncStores,
    keyPtr: number,
    keyLen: number,
    op: string,
    extra: Record<string, unknown>,
    done: (value: unknown) => void = () => {},
  ) => {
    const key = text(keyPtr, keyLen);
    if (key === null) return BadArgument;
    const reply = s.call("cache", { op, key, ...extra });
    if (!reply.ok) return cacheStatus(reply.error);
    done(reply.value);
    return Ok;
  };

  /** KV op on an open handle; `done` writes the out-params of a success. */
  const kvOp = (
    s: SyncStores,
    handle: number,
    op: string,
    fields: Record<string, string | null>,
    done: (value: unknown) => void,
  ) => {
    const store = handles[handle];
    if (store === undefined) return InternalFailure;
    if (Object.values(fields).includes(null)) return BadArgument;
    const reply = s.call("kv", { op, store, ...fields });
    if (!reply.ok) return kvStatus(reply.error);
    done(reply.value);
    return Ok;
  };

  const writeList = (items: Uint8Array[], dataPtr: number, sizePtr: number) =>
    memory.writeBytesResult(serializeList(items), dataPtr, sizePtr);
  const scored = (value: unknown) =>
    (value as [string, number][]).map(([member, score]) => {
      const bytes = Buffer.from(member, "base64");
      const out = new Uint8Array(bytes.length + 8);
      out.set(bytes);
      new DataView(out.buffer).setFloat64(bytes.length, score, true);
      return out;
    });

  return {
    proxy_cache_get: host("proxy_cache_get", (s, keyPtr: number, keyLen: number, dataPtr: number, sizePtr: number) =>
      cacheKey(s, keyPtr, keyLen, "get", {}, (value) => {
        if (value !== null) memory.writeBytesResult(Buffer.from(value as string, "base64"), dataPtr, sizePtr);
      }),
    ),
    proxy_cache_set: host(
      "proxy_cache_set",
      (s, keyPtr: number, keyLen: number, valuePtr: number, valueLen: number, ttlMs: bigint) => {
        if (ttlMs < 0n) return BadArgument;
        const value = Buffer.from(memory.readBytes(valuePtr, valueLen)).toString("base64");
        return cacheKey(s, keyPtr, keyLen, "set", { value, ttlMs: ttlMs === 0n ? null : ttlMs.toString() });
      },
    ),
    proxy_cache_delete: host("proxy_cache_delete", (s, keyPtr: number, keyLen: number) =>
      cacheKey(s, keyPtr, keyLen, "delete", {}),
    ),
    proxy_cache_exists: host("proxy_cache_exists", (s, keyPtr: number, keyLen: number, retPtr: number) =>
      cacheKey(s, keyPtr, keyLen, "exists", {}, (value) => memory.writeU32(retPtr, value ? 1 : 0)),
    ),
    proxy_cache_incr: host("proxy_cache_incr", (s, keyPtr: number, keyLen: number, delta: bigint, retPtr: number) =>
      cacheKey(s, keyPtr, keyLen, "incr", { delta: delta.toString() }, (value) =>
        memory.writeI64(retPtr, BigInt(value as string)),
      ),
    ),
    proxy_cache_expire: host("proxy_cache_expire", (s, keyPtr: number, keyLen: number, ttlMs: bigint, retPtr: number) =>
      // A negative TTL is a huge u64 on the edge, clamped to the default; the service does the same.
      cacheKey(s, keyPtr, keyLen, "expire", { ttlMs: ttlMs.toString() }, (value) =>
        memory.writeU32(retPtr, value ? 1 : 0),
      ),
    ),
    proxy_cache_purge: host("proxy_cache_purge", (s, retPtr: number) => {
      const reply = s.call("cache", { op: "purge" });
      if (!reply.ok) return cacheStatus(reply.error);
      memory.writeU64(retPtr, BigInt(reply.value as string));
      return Ok;
    }),
    proxy_cache_purge_prefix: host("proxy_cache_purge_prefix", (s, prefixPtr: number, prefixLen: number, retPtr: number) => {
      const prefix = text(prefixPtr, prefixLen);
      if (prefix === null) return BadArgument;
      const reply = s.call("cache", { op: "purge-prefix", prefix });
      if (!reply.ok) return cacheStatus(reply.error);
      memory.writeU64(retPtr, BigInt(reply.value as string));
      return Ok;
    }),

    proxy_kv_store_open: host("proxy_kv_store_open", (s, namePtr: number, nameLen: number, retPtr: number) => {
      const name = text(namePtr, nameLen);
      if (name === null) return BadArgument;
      const reply = s.call("kv", { op: "open", store: name });
      if (!reply.ok) {
        if (reply.error === "access-denied") return BadArgument;
        return reply.error === "no-such-store" ? NotFound : InternalFailure;
      }
      handles.push(name);
      memory.writeU32(retPtr, handles.length - 1);
      return Ok;
    }),
    proxy_kv_store_get: host(
      "proxy_kv_store_get",
      (s, handle: number, keyPtr: number, keyLen: number, dataPtr: number, sizePtr: number) =>
        kvOp(s, handle, "get", { key: text(keyPtr, keyLen) }, (value) => {
          if (value !== null) memory.writeBytesResult(Buffer.from(value as string, "base64"), dataPtr, sizePtr);
        }),
    ),
    proxy_kv_store_zrange_by_score: host(
      "proxy_kv_store_zrange_by_score",
      (s, handle: number, keyPtr: number, keyLen: number, min: number, max: number, dataPtr: number, sizePtr: number) =>
        kvOp(s, handle, "zrange-by-score", { key: text(keyPtr, keyLen), min: String(min), max: String(max) }, (value) =>
          writeList(scored(value), dataPtr, sizePtr),
        ),
    ),
    proxy_kv_store_scan: host(
      "proxy_kv_store_scan",
      (s, handle: number, patternPtr: number, patternLen: number, dataPtr: number, sizePtr: number) =>
        kvOp(s, handle, "scan", { pattern: text(patternPtr, patternLen) }, (value) =>
          writeList((value as string[]).map((k) => Buffer.from(k, "utf8")), dataPtr, sizePtr),
        ),
    ),
    proxy_kv_store_zscan: host(
      "proxy_kv_store_zscan",
      (
        s,
        handle: number,
        keyPtr: number,
        keyLen: number,
        patternPtr: number,
        patternLen: number,
        dataPtr: number,
        sizePtr: number,
      ) =>
        kvOp(s, handle, "zscan", { key: text(keyPtr, keyLen), pattern: text(patternPtr, patternLen) }, (value) =>
          writeList(scored(value), dataPtr, sizePtr),
        ),
    ),
    proxy_kv_store_bf_exists: host(
      "proxy_kv_store_bf_exists",
      (s, handle: number, keyPtr: number, keyLen: number, itemPtr: number, itemLen: number, retPtr: number) =>
        kvOp(s, handle, "bf-exists", { key: text(keyPtr, keyLen), item: text(itemPtr, itemLen) }, (value) =>
          memory.writeU32(retPtr, value ? 1 : 0),
        ),
    ),
  };
}

/** The engine's list encoding: i32 count, i32 sizes, then each item followed by NUL. */
export function serializeList(items: Uint8Array[]): Uint8Array {
  const size = items.reduce((n, item) => n + 4 + item.length + 1, 4);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  view.setInt32(0, items.length, true);
  items.forEach((item, i) => view.setInt32(4 + i * 4, item.length, true));
  let offset = 4 + items.length * 4;
  for (const item of items) {
    out.set(item, offset);
    offset += item.length + 1; // NUL already 0
  }
  return out;
}
