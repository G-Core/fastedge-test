/**
 * Synchronous storage calls from the CDN worker. Proxy-wasm host functions must return a
 * status at once, so the worker posts the request, blocks on Atomics.wait, and reads the
 * reply with receiveMessageOnPort; the parent makes the async HTTP call to the service.
 *
 * Rules: one call in flight per worker; replies matched by id (late ones are dropped); a
 * finite deadline (longer than the parent's 4 s HTTP timeout, so the parent answers first);
 * no retry, since a mutation may have landed before a failure.
 */

import { MessageChannel, receiveMessageOnPort, type MessagePort } from "node:worker_threads";
import type { Reply } from "../stores/StoresCore.js";

export type StoresKind = "cache" | "kv";

/** Worker-side synchronous access to the storage service. */
export type SyncStores = { call(kind: StoresKind, body: Record<string, unknown>): Reply };

/** What the parent hands the worker (ports are transferred, the flag is shared). */
export type BridgeEnds = { request: MessagePort; reply: MessagePort; flag: SharedArrayBuffer };

export function createBridge(): { worker: BridgeEnds; parent: BridgeEnds } {
  const request = new MessageChannel();
  const reply = new MessageChannel();
  const flag = new SharedArrayBuffer(4);
  return {
    worker: { request: request.port1, reply: reply.port2, flag },
    parent: { request: request.port2, reply: reply.port1, flag },
  };
}

/** Worker side. Cache requests get the runner's `dc`. */
export class SyncStoresClient implements SyncStores {
  private seq = 0;
  private flag: Int32Array;

  constructor(
    private ends: BridgeEnds,
    private dc: string,
    private timeoutMs = 5000,
  ) {
    this.flag = new Int32Array(ends.flag);
  }

  call(kind: StoresKind, body: Record<string, unknown>): Reply {
    const id = ++this.seq;
    Atomics.store(this.flag, 0, 0);
    this.ends.request.postMessage({ id, kind, body: kind === "cache" ? { ...body, dc: this.dc } : body });
    const deadline = Date.now() + this.timeoutMs;
    for (;;) {
      const left = deadline - Date.now();
      if (left <= 0) return { ok: false, error: "timeout" };
      Atomics.wait(this.flag, 0, 0, left);
      // Reset before draining: a reply posted after the drain sets the flag again.
      Atomics.store(this.flag, 0, 0);
      for (let m = receiveMessageOnPort(this.ends.reply); m; m = receiveMessageOnPort(this.ends.reply)) {
        if (m.message.id === id) return m.message.reply as Reply;
      }
    }
  }
}

/** Parent side: answer one worker's requests with `send`. Returns a function that closes the bridge. */
export function serveBridge(
  ends: BridgeEnds,
  send: (kind: StoresKind, body: Record<string, unknown>) => Promise<Reply>,
): () => void {
  const flag = new Int32Array(ends.flag);
  ends.request.on("message", async ({ id, kind, body }: { id: number; kind: StoresKind; body: Record<string, unknown> }) => {
    let reply: Reply;
    try {
      reply = await send(kind, body);
    } catch {
      reply = { ok: false, error: "unavailable" };
    }
    ends.reply.postMessage({ id, reply });
    Atomics.store(flag, 0, 1);
    Atomics.notify(flag, 0);
  });
  // The listener must not keep the process alive; the runner refs its worker during calls.
  ends.request.unref();
  return () => {
    ends.request.close();
    ends.reply.close();
  };
}
