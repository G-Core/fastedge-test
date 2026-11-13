/**
 * WorkerProxyWasmRunner
 *
 * Runs a ProxyWasmRunner in a worker thread (cdn-worker.ts) and forwards the
 * IWasmRunner calls to it. Behaviour is the same as ProxyWasmRunner; the parent's
 * event loop stays free while a hook runs, so host functions in the worker can
 * block on synchronous calls without stalling the debugger server.
 *
 * The worker's `fetch` (origin fetch, proxy_http_call) runs here in the parent, so
 * the parent's undici dispatcher applies (mockOrigins() installs a MockAgent there).
 *
 * Stores: given a connection to the storage service, the worker's cache and Edge KV
 * host functions reach it over a synchronous bridge (storesBridge.ts); the HTTP calls
 * are made here. Without one, those functions return InternalFailure ("stores are off").
 *
 * The worker does not keep the process alive while idle, so a runner that is
 * never cleaned up does not stop Node from exiting. cleanup() terminates it, and
 * closes the stores connection if the runner owns it.
 */

import { Worker } from "node:worker_threads";
import type {
  IWasmRunner,
  WasmType,
  RunnerConfig,
  HttpRequest,
  HttpResponse,
} from "./IWasmRunner.js";
import type { IStateManager } from "./IStateManager.js";
import type { HookCall, HookResult, FullFlowResult } from "./types.js";
import type { FastEdgeConfig } from "../fastedge-host/index.js";
import { embeddedSource } from "../embedded.js";
import { createBridge, serveBridge } from "./storesBridge.js";
import { request, type RunnerStores } from "../stores/StoresManager.js";

type Reply = { id: number; value?: unknown; error?: unknown };
type Event = { event: keyof IStateManager; args: unknown[] };
type FetchRequest = { fetch: { id: number; url: string; init: RequestInit } } | { abortFetch: number };

export class WorkerProxyWasmRunner implements IWasmRunner {
  private worker: Worker;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
  private nextId = 1;
  private stateManager: IStateManager | null = null;
  private stopped: Error | null = null;
  private fetches = new Map<number, AbortController>();
  private closeBridge: (() => void) | null = null;

  constructor(
    fastEdgeConfig?: FastEdgeConfig,
    dotenvEnabled: boolean = true,
    private stores: RunnerStores | null = null,
  ) {
    const bridge = stores ? createBridge() : null;
    this.worker = new Worker(embeddedSource("cdn-worker"), {
      eval: true,
      workerData: {
        fastEdgeConfig,
        dotenvEnabled,
        stores: bridge ? { ends: bridge.worker, dc: stores!.dc } : null,
      },
      transferList: bridge ? [bridge.worker.request, bridge.worker.reply] : [],
    });
    if (bridge) {
      this.closeBridge = serveBridge(bridge.parent, (kind, body) => request(stores!.connection, kind, body));
    }
    this.worker.unref();
    this.worker.on("message", (m: Reply | Event | FetchRequest) => this.onMessage(m));
    this.worker.on("error", (e) => this.stop(e));
    this.worker.on("exit", (code) => this.stop(new Error(`CDN runner worker exited (code ${code})`)));
  }

  private call<T>(method: string, ...args: unknown[]): Promise<T> {
    if (this.stopped) return Promise.reject(this.stopped);
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      // Only a call in flight keeps the process alive.
      if (this.pending.size === 1) this.worker.ref();
      try {
        this.worker.postMessage({ id, method, args });
      } catch (error) {
        this.settle(id)?.reject(error);
      }
    });
  }

  private settle(id: number) {
    const entry = this.pending.get(id);
    this.pending.delete(id);
    if (this.pending.size === 0) this.worker.unref();
    return entry;
  }

  private onMessage(m: Reply | Event | FetchRequest): void {
    if ("fetch" in m) {
      void this.fetchForWorker(m.fetch.id, m.fetch.url, m.fetch.init);
      return;
    }
    if ("abortFetch" in m) {
      this.fetches.get(m.abortFetch)?.abort();
      return;
    }
    if ("event" in m) {
      const emit = this.stateManager?.[m.event] as ((...a: unknown[]) => void) | undefined;
      emit?.apply(this.stateManager, m.args);
      return;
    }
    const entry = this.settle(m.id);
    if ("error" in m) entry?.reject(m.error);
    else entry?.resolve(m.value);
  }

  private async fetchForWorker(id: number, url: string, init: RequestInit): Promise<void> {
    const controller = new AbortController();
    this.fetches.set(id, controller);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      const body = await response.arrayBuffer();
      this.worker.postMessage(
        {
          fetchReply: {
            id,
            status: response.status,
            statusText: response.statusText,
            headers: [...response.headers],
            body,
          },
        },
        [body],
      );
    } catch (error) {
      if (!this.stopped) this.worker.postMessage({ fetchReply: { id, error } });
    } finally {
      this.fetches.delete(id);
    }
  }

  private cleanedUp = false;

  private stop(error: Error): void {
    this.stopped ??= error;
    for (const id of [...this.pending.keys()]) this.settle(id)?.reject(this.stopped);
    for (const controller of this.fetches.values()) controller.abort();
  }

  load(bufferOrPath: Buffer | string, config?: RunnerConfig): Promise<void> {
    return this.call("load", bufferOrPath, config);
  }

  callHook(call: HookCall): Promise<HookResult> {
    return this.call("callHook", call);
  }

  callFullFlow(
    url: string,
    method: string,
    headers: Record<string, string>,
    body: string,
    properties: Record<string, unknown>,
    enforceProductionPropertyRules: boolean,
  ): Promise<FullFlowResult> {
    return this.call(
      "callFullFlow",
      url,
      method,
      headers,
      body,
      properties,
      enforceProductionPropertyRules,
    );
  }

  applyDotenv(enabled: boolean, path?: string): Promise<void> {
    return this.call("applyDotenv", enabled, path);
  }

  setStateManager(stateManager: IStateManager): void {
    this.stateManager = stateManager;
    // The worker forwards events from now on; messages keep their order, so this
    // is in place before any later call runs.
    this.call("setStateManager").catch(() => {});
  }

  async execute(_request: HttpRequest): Promise<HttpResponse> {
    throw new Error(
      "execute() is not supported for Proxy-WASM. Use callHook() or callFullFlow() instead."
    );
  }

  async cleanup(): Promise<void> {
    if (this.cleanedUp) return;
    this.cleanedUp = true; // not `stopped`: a crashed worker still holds the bridge and lease
    this.stop(new Error("CDN runner was cleaned up"));
    await this.worker.terminate();
    this.closeBridge?.();
    if (this.stores?.owned) await this.stores.connection.close();
  }

  getType(): WasmType {
    return "proxy-wasm";
  }
}
