/**
 * Worker-thread side of WorkerProxyWasmRunner: hosts one ProxyWasmRunner and runs the
 * parent's calls on it. Each call is `{ id, method, args }`; the reply is `{ id, value }`
 * or `{ id, error }`. State manager events go back as `{ event, args }` as they happen,
 * so they reach the parent before the reply of the call that caused them.
 *
 * `fetch` (origin fetch, proxy_http_call) runs in the parent, so the parent's undici
 * dispatcher applies, e.g. a MockAgent from mockOrigins().
 */

import { parentPort, workerData } from "node:worker_threads";
import { ProxyWasmRunner } from "./ProxyWasmRunner.js";
import type { IStateManager } from "./IStateManager.js";
import type { FastEdgeConfig } from "../fastedge-host/index.js";

const port = parentPort!;
const { fastEdgeConfig, dotenvEnabled } = workerData as {
  fastEdgeConfig?: FastEdgeConfig;
  dotenvEnabled: boolean;
};
const runner = new ProxyWasmRunner(fastEdgeConfig, dotenvEnabled);

const forwardEvents = new Proxy({} as IStateManager, {
  get: (_target, event) => (...args: unknown[]) => port.postMessage({ event, args }),
});

const fetches = new Map<number, { resolve: (r: Response) => void; reject: (e: unknown) => void }>();
let nextFetchId = 1;
const NULL_BODY_STATUS = new Set([101, 204, 205, 304]);

globalThis.fetch = (input, init = {}) => {
  const { signal, ...rest } = init;
  const id = nextFetchId++;
  return new Promise<Response>((resolve, reject) => {
    signal?.throwIfAborted();
    fetches.set(id, { resolve, reject });
    signal?.addEventListener("abort", () => {
      fetches.delete(id);
      port.postMessage({ abortFetch: id });
      reject(signal.reason);
    }, { once: true });
    port.postMessage({ fetch: { id, url: String(input), init: rest } });
  });
};

type FetchReply = {
  id: number;
  error?: unknown;
  status?: number;
  statusText?: string;
  headers?: [string, string][];
  body?: ArrayBuffer;
};

function onFetchReply({ id, error, status, statusText, headers, body }: FetchReply): void {
  const pending = fetches.get(id);
  if (!pending) return;
  fetches.delete(id);
  if (error !== undefined) return pending.reject(error);
  pending.resolve(new Response(NULL_BODY_STATUS.has(status!) ? null : body, { status, statusText, headers }));
}

function reply(message: { id: number; value?: unknown; error?: unknown }): void {
  try {
    port.postMessage(message);
  } catch (cloneError) {
    // A value or error that cannot be cloned must still settle the parent's call.
    port.postMessage({ id: message.id, error: new Error(String(cloneError)) });
  }
}

port.on("message", async (message: { id: number; method: string; args: unknown[] } | { fetchReply: FetchReply }) => {
  if ("fetchReply" in message) return onFetchReply(message.fetchReply);
  const { id, method, args } = message;
  try {
    const value =
      method === "setStateManager"
        ? runner.setStateManager(forwardEvents)
        : await (runner as unknown as Record<string, (...a: unknown[]) => unknown>)[method](...args);
    reply({ id, value });
  } catch (error) {
    reply({ id, error });
  }
});
