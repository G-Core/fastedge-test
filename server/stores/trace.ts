/**
 * The storage trace: which request (and hook) made which cache / Edge KV call, and the result.
 * Recorded by the storage service for every call that carries `trace` in its body, so CDN apps
 * (the worker bridge) and HTTP apps (fastedge-run, follow-up) share one implementation.
 * Values are not recorded, only their size.
 */

import type { Reply } from "./StoresCore.js";

export type TraceContext = { requestId: string; app: "cdn" | "http"; hook?: string };

export type StoreCall = {
  app: "cdn" | "http";
  hook?: string;
  kind: "cache" | "kv";
  op: string;
  /** Cache bucket (cache calls). */
  dc?: string;
  /** Edge KV store (KV calls). */
  store?: string;
  key?: string;
  pattern?: string;
  prefix?: string;
  /** `ok`, or the service's error (`wrong-type`, `invalid-pattern`, ...). */
  result: string;
  /** The result value: a count, a flag, or the size of a value or list. */
  value?: string;
  /** Wall-clock time (ms since epoch). */
  at: number;
};

const LIMIT = 5000;

/** A bounded log of traced calls (oldest dropped first). */
export class TraceLog {
  private calls: (StoreCall & { requestId: string })[] = [];

  record(kind: "cache" | "kv", body: Record<string, unknown>, reply: Reply): void {
    const trace = context(body.trace);
    if (!trace) return;
    const text = (field: string) => (typeof body[field] === "string" ? (body[field] as string) : undefined);
    this.calls.push({
      requestId: trace.requestId,
      app: trace.app,
      ...(trace.hook ? { hook: trace.hook } : {}),
      kind,
      op: String(body.op),
      ...(kind === "cache" ? { dc: text("dc") } : { store: text("store") }),
      ...pick({ key: text("key"), pattern: text("pattern"), prefix: text("prefix") }),
      result: reply.ok ? "ok" : reply.error,
      ...(reply.ok ? pick({ value: summary(body.op, reply.value) }) : {}),
      at: Date.now(),
    });
    if (this.calls.length > LIMIT) this.calls.splice(0, this.calls.length - LIMIT);
  }

  /** The calls of one request (and hook, if given), in order. */
  find(requestId: string, hook?: string): StoreCall[] {
    return this.calls
      .filter((c) => c.requestId === requestId && (!hook || c.hook === hook))
      .map(({ requestId: _id, ...call }) => call);
  }
}

function context(trace: unknown): TraceContext | null {
  if (typeof trace !== "object" || trace === null) return null;
  const t = trace as Record<string, unknown>;
  if (typeof t.requestId !== "string" || !t.requestId || (t.app !== "cdn" && t.app !== "http")) return null;
  return { requestId: t.requestId, app: t.app, ...(typeof t.hook === "string" && t.hook ? { hook: t.hook } : {}) };
}

/** A short, value-free summary of a result. */
function summary(op: unknown, value: unknown): string | undefined {
  if (value === null || value === undefined) return op === "get" ? "missing" : undefined;
  if (Array.isArray(value)) return `${value.length} items`;
  if (typeof value === "string" && (op === "get")) return `${Buffer.from(value, "base64").length} bytes`;
  return String(value);
}

function pick(fields: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) as Record<string, string>;
}
