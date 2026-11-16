import { WASI } from "node:wasi";
import { checkEgressAllowed } from "./egressPolicy.js";
import type { HookCall, HookResult, HeaderMap, HeaderRecord, HeaderTuples, FullFlowResult } from "./types";
import type {
  IWasmRunner,
  WasmType,
  RunnerConfig,
  HttpRequest,
  HttpResponse,
} from "./IWasmRunner.js";
import { MemoryManager } from "./MemoryManager";
import { HeaderManager } from "./HeaderManager";
import { PropertyResolver } from "./PropertyResolver";
import { HostFunctions } from "./HostFunctions";
import { PropertyAccessControl, HookContext } from "./PropertyAccessControl";
import type { IStateManager } from "./IStateManager.js";
import {
  SecretStore,
  Dictionary,
  type FastEdgeConfig,
} from "../fastedge-host/index.js";
import { loadDotenvFiles } from "../utils/dotenv-loader.js";
import { storesImports } from "./StoresHost.js";
import type { SyncStores } from "./storesBridge.js";
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import type { StoreCall } from "../stores/trace.js";
import { cdnContext, contextProperties, withHeaders, type RequestContext } from "./requestContext.js";
import { BUILTIN_SHORTHAND, BUILTIN_URL, runCdnFlow } from "./cdnFlow.js";

const textEncoder = new TextEncoder();

export { BUILTIN_URL, BUILTIN_SHORTHAND };

export class ProxyWasmRunner implements IWasmRunner {
  private module: WebAssembly.Module | null = null; // Compiled module (reused)
  private instance: WebAssembly.Instance | null = null; // Current instance (transient per hook)
  private memory: MemoryManager;
  private propertyResolver: PropertyResolver;
  private propertyAccessControl: PropertyAccessControl;
  private currentHook: HookContext | null = null;
  private hostFunctions: HostFunctions;
  private logs: { level: number; message: string }[] = [];
  private rootContextId = 1;
  private nextContextId = 2;
  private currentContextId = 1;
  private isInitializing = false;
  private debug = process.env.PROXY_RUNNER_DEBUG === "1";
  private stateManager: IStateManager | null = null;
  private secretStore: SecretStore;
  private dictionary: Dictionary;
  private dotenvEnabled: boolean = true; // Default to enabled
  private dotenvPath: string = ".";
  private stores: SyncStores | null = null; // null = stores off
  private context: ReturnType<typeof cdnContext> = cdnContext({});

  constructor(
    fastEdgeConfig?: FastEdgeConfig,
    dotenvEnabled: boolean = true
  ) {
    this.memory = new MemoryManager();
    this.propertyResolver = new PropertyResolver();
    this.propertyAccessControl = new PropertyAccessControl();
    this.dotenvEnabled = dotenvEnabled;

    // Initialize FastEdge stores
    this.secretStore = new SecretStore(fastEdgeConfig?.secrets);
    this.dictionary = new Dictionary(fastEdgeConfig?.dictionary);
    this.dictionary.setDefaults(this.edgeDictionary);

    this.hostFunctions = new HostFunctions(
      this.memory,
      this.propertyResolver,
      this.propertyAccessControl,
      () => this.currentHook,
      this.debug,
      this.secretStore,
      this.dictionary,
    );

    // Set up memory manager to log to our logs array
    this.memory.setLogCallback((level: number, message: string) => {
      this.logs.push({ level, message });
    });
  }

  /**
   * Connect the cache and Edge KV host functions to the storage service
   * (WorkerProxyWasmRunner does this inside its worker). Without it they
   * return InternalFailure ("stores are off").
   */
  setStores(stores: SyncStores | null): void {
    this.stores = stores;
  }

  /**
   * Trace context per call, not per runner: one request id per full flow (shared by its
   * hooks), else per hook call. AsyncLocalStorage keeps overlapping calls apart (a hook can
   * await a proxy_http_call fetch).
   */
  private flowRequestId = new AsyncLocalStorage<string>();
  private trace = new AsyncLocalStorage<{ requestId: string; hook: string }>();

  /** The stores, with every call tagged for the service's storage trace. */
  private tracedStores(): SyncStores | null {
    const stores = this.stores;
    if (!stores) return null;
    return { call: (kind, body) => stores.call(kind, { ...body, trace: { ...this.trace.getStore(), app: "cdn" } }) };
  }

  /** The storage calls this hook made (empty if the service cannot say). */
  private storeCalls(): StoreCall[] | undefined {
    const context = this.trace.getStore();
    if (!this.stores || !context) return undefined;
    const reply = this.stores.call("admin", { op: "traces", ...context });
    return reply.ok ? (reply.value as StoreCall[]) : [];
  }

  /**
   * Set state manager for event emission
   */
  setStateManager(stateManager: IStateManager): void {
    this.stateManager = stateManager;
  }

  /**
   * Load dotenv files if enabled and merge with existing FastEdge config
   */
  private async loadDotenvIfEnabled(): Promise<void> {
    if (!this.dotenvEnabled) {
      this.logDebug("Dotenv disabled, skipping file loading");
      return;
    }

    try {
      const dotenvConfig = await loadDotenvFiles(this.dotenvPath);

      // Merge dotenv secrets with existing secrets
      if (
        dotenvConfig.secrets &&
        Object.keys(dotenvConfig.secrets).length > 0
      ) {
        const existingSecrets = this.secretStore.getAll();
        this.secretStore = new SecretStore({
          ...existingSecrets,
          ...dotenvConfig.secrets,
        });
        this.logDebug(
          `Loaded ${Object.keys(dotenvConfig.secrets).length} secrets from dotenv files`,
        );
      }

      // Merge dotenv dictionary with existing dictionary
      if (
        dotenvConfig.dictionary &&
        Object.keys(dotenvConfig.dictionary).length > 0
      ) {
        for (const [key, value] of Object.entries(dotenvConfig.dictionary)) {
          this.dictionary.set(key, value);
        }
        this.logDebug(
          `Loaded ${Object.keys(dotenvConfig.dictionary).length} dictionary entries from dotenv files`,
        );
      }

      // Recreate host functions with updated stores
      this.hostFunctions = new HostFunctions(
        this.memory,
        this.propertyResolver,
        this.propertyAccessControl,
        () => this.currentHook,
        this.debug,
        this.secretStore,
        this.dictionary,
      );
    } catch (error) {
      console.error("Failed to load dotenv files:", error);
      // Don't throw - continue with empty secrets/dictionary
    }
  }

  /**
   * Apply dotenv settings to the running module without recompiling.
   * Resets SecretStore/Dictionary to empty, then re-loads dotenv files
   * using the new settings. The compiled WASM module is untouched.
   */
  async applyDotenv(enabled: boolean, dotenvPath?: string): Promise<void> {
    this.dotenvEnabled = enabled;
    if (dotenvPath !== undefined) {
      this.dotenvPath = dotenvPath;
    }

    // Reset stores to empty
    this.secretStore = new SecretStore();
    this.dictionary = new Dictionary();
    this.dictionary.setDefaults(this.edgeDictionary);

    // Re-load dotenv files with new settings (no-op when disabled)
    await this.loadDotenvIfEnabled();

    // When disabled, loadDotenvIfEnabled returns early without recreating
    // hostFunctions — do it here so the empty stores take effect immediately.
    if (!enabled) {
      this.hostFunctions = new HostFunctions(
        this.memory,
        this.propertyResolver,
        this.propertyAccessControl,
        () => this.currentHook,
        this.debug,
        this.secretStore,
        this.dictionary,
      );
    }
  }

  /**
   * Where the client is and which POP runs the app: request properties and headers under the
   * explicit ones, dictionary keys under the dotenv ones. Applies from the next call; a call
   * that names its own context (`HookCall.context`, `callFullFlow`'s `context`) uses that.
   */
  async setRequestContext(context: RequestContext): Promise<void> {
    this.context = cdnContext(context);
  }

  /** The context of the call being run (AsyncLocalStorage: overlapping calls stay apart). */
  private callContext = new AsyncLocalStorage<ReturnType<typeof cdnContext> & { callerHeaders?: Record<string, unknown> }>();
  private edgeDictionary = () => (this.callContext.getStore() ?? this.context).dictionary;

  /** Run `work` with `context` (or the runner's), applied under the call's explicit values. */
  private withContext<T>(call: HookCall, context: RequestContext | undefined, work: (call: HookCall) => Promise<T>): Promise<T> {
    const c = context ? cdnContext(context) : this.context;
    const applied: HookCall = {
      ...call,
      properties: { ...contextProperties(c.properties, call.request.headers ?? {}), ...(call.properties ?? {}) },
      request: { ...call.request, headers: withHeaders(c.headers, call.request.headers ?? {}) },
    };
    return this.callContext.run({ ...c, callerHeaders: call.request.headers ?? {} }, () => work(applied));
  }

  /**
   * A request's headers without the ones the context added: request_started reports these, and the
   * UI copies them into its editable headers, where they would stay after the context changed.
   */
  private ownHeaders<T>(headers: Record<string, T>): Record<string, T> {
    const ctx = this.callContext.getStore();
    if (!ctx?.callerHeaders) return headers;
    const caller = ctx.callerHeaders;
    return Object.fromEntries(Object.entries(headers).filter(([k]) => !Object.hasOwn(ctx.headers, k) || Object.hasOwn(caller, k)));
  }

  async load(bufferOrPath: Buffer | string, config?: RunnerConfig): Promise<void> {
    if (config?.client || config?.edge) await this.setRequestContext({ client: config.client, edge: config.edge });
    // Update config if provided
    if (config?.dotenv?.enabled !== undefined) {
      this.dotenvEnabled = config.dotenv.enabled;
    }
    if (config?.dotenv?.path !== undefined) {
      this.dotenvPath = config.dotenv.path;
    }

    this.resetState();

    // Get buffer from path if needed
    let buffer: Buffer;
    if (typeof bufferOrPath === "string") {
      // Path provided - read file into buffer
      const { readFile } = await import("fs/promises");
      buffer = await readFile(bufferOrPath);
    } else {
      // Buffer provided directly
      buffer = bufferOrPath;
    }

    // Compile once and store the module (expensive operation)
    this.module = await WebAssembly.compile(new Uint8Array(buffer));

    if (this.debug) {
      const imports = WebAssembly.Module.imports(this.module);
      const exports = WebAssembly.Module.exports(this.module);
      console.warn(
        `debug: wasm imports=${imports.map((imp) => `${imp.module}.${imp.name}`).join(", ")}`,
      );
      console.warn(
        `debug: wasm exports=${exports.map((exp) => exp.name).join(", ")}`,
      );
    }

    this.logDebug("WASM module compiled and ready for hook execution");

    // Load dotenv files if enabled
    await this.loadDotenvIfEnabled();
  }

  /**
   * Original callFullFlow signature for backward compatibility
   */
  async callFullFlowLegacy(
    call: HookCall,
    targetUrl: string,
  ): Promise<FullFlowResult> {
    if (!this.module) {
      throw new Error("WASM module not loaded");
    }
    // This app runs every hook.
    return runCdnFlow({
      runnerFor: () => this,
      start: (url) => this.propertyResolver.extractRuntimePropertiesFromUrl(url),
      calculatedProperties: () => this.propertyResolver.getCalculatedProperties(),
      log: (message) => this.logDebug(message),
      events: this.stateManager,
      ownHeaders: (headers) => this.ownHeaders(headers),
    }, call, targetUrl);
  }

  async callHook(call: HookCall): Promise<HookResult> {
    const run = (c: HookCall) => {
      const context = { requestId: this.flowRequestId.getStore() ?? call.requestId ?? randomUUID(), hook: c.hook };
      return this.trace.run(context, () => this.runHook(c));
    };
    // Inside a full flow the context is already applied (and a hook may have removed a header).
    if (this.flowRequestId.getStore()) return run(call);
    // One hook of a flow driven from outside (a resource): only the edge dictionary is still needed.
    if (call.requestId) return this.callContext.run(call.context ? cdnContext(call.context) : this.context, () => run(call));
    return this.withContext(call, call.context, run);
  }

  private async runHook(call: HookCall): Promise<HookResult> {
    if (!this.module) {
      throw new Error("WASM module not loaded");
    }

    // Set current hook context for property access control
    this.currentHook = this.getHookContext(call.hook);

    // Clear stale local response from any previous hook execution
    this.hostFunctions.resetLocalResponse();
    if (call.customProperties) this.propertyAccessControl.setRequestCustomProperties(call.customProperties);

    // Create fresh instance for this hook call (isolated context)
    const imports = this.createImports();
    this.instance = await WebAssembly.instantiate(this.module, imports);

    // Initialize memory manager with the new instance
    const memory = this.instance.exports.memory;
    if (!(memory instanceof WebAssembly.Memory)) {
      throw new Error("WASM module must export memory");
    }
    this.memory.setMemory(memory);
    this.memory.setInstance(this.instance);

    // Initialize WASI if needed
    const wasiModule = imports.wasi_snapshot_preview1 as {
      initialize?: (instance: WebAssembly.Instance) => void;
    };
    if (wasiModule.initialize) {
      try {
        wasiModule.initialize(this.instance);
      } catch {
        // Some modules don't use WASI; ignore if initialization fails.
      }
    }

    // Call _start for runtime initialization
    const startFn = this.instance.exports._start;
    if (typeof startFn === "function") {
      try {
        this.logDebug("calling _start for runtime init");
        startFn();
      } catch (error) {
        this.logDebug(`_start failed: ${String(error)}`);
      }
    }

    this.logs = [];

    // Always use Trace (0) to capture all logs - filtering is a UI concern
    this.hostFunctions.setLogLevel(0);

    const requestHeaders = HeaderManager.normalize(call.request.headers ?? {});
    const responseHeaders = HeaderManager.normalize(
      call.response?.headers ?? {},
    );
    const requestBody = call.request.body ?? "";
    const responseBody = call.response?.body ?? "";
    const requestMethod = call.request.method ?? "GET";
    const responseStatus = call.response?.status ?? 200;
    const responseStatusText = call.response?.statusText ?? "OK";

    this.propertyResolver.setProperties({ ...(call.properties ?? {}) });
    // Only pass path/scheme if explicitly provided to avoid overwriting URL-extracted values
    this.propertyResolver.setRequestMetadata(
      requestHeaders,
      requestMethod,
      call.request.path,
      call.request.scheme,
    );
    this.propertyResolver.setResponseMetadata(
      responseHeaders,
      responseStatus,
      responseStatusText,
    );

    let vmConfig = normalizeConfigValue(
      call.properties["vm_config"] ?? call.properties["vmConfig"],
    );
    let pluginConfig = normalizeConfigValue(
      call.properties["plugin_config"] ?? call.properties["pluginConfig"],
    );

    const rootId = this.deriveRootId(call.properties);
    if (!vmConfig || vmConfig.trim() === "{}") {
      if (rootId) {
        vmConfig = JSON.stringify({ test_mode: true, root_id: rootId });
        this.logDebug(`vm_config defaulted to JSON root_id: ${rootId}`);
      } else {
        vmConfig = JSON.stringify({ test_mode: true });
        this.logDebug("vm_config defaulted to test_mode");
      }
    }
    if (!pluginConfig || pluginConfig.trim() === "{}") {
      pluginConfig = JSON.stringify({ test_mode: true });
      this.logDebug("plugin_config defaulted to test_mode");
    }
    if (!pluginConfig || pluginConfig.trim() === "{}") {
      pluginConfig = "";
      this.logDebug("plugin_config defaulted to empty");
    }
    vmConfig = ensureNullTerminated(vmConfig);
    pluginConfig = ensureNullTerminated(pluginConfig);

    this.hostFunctions.setLogs(this.logs);
    this.hostFunctions.setHeadersAndBodies(
      requestHeaders,
      responseHeaders,
      requestBody,
      responseBody,
    );
    this.hostFunctions.setConfigs(vmConfig, pluginConfig);

    this.ensureInitialized(vmConfig, pluginConfig);

    const streamContextId = this.nextContextId++;
    this.currentContextId = streamContextId;
    this.hostFunctions.setCurrentContext(streamContextId);
    this.callIfExported(
      "proxy_on_context_create",
      streamContextId,
      this.rootContextId,
    );

    // Capture input state before hook execution (including all properties)
    const inputState = {
      request: {
        headers: { ...requestHeaders },
        body: requestBody,
      },
      response: {
        headers: { ...responseHeaders },
        body: responseBody,
      },
      properties: this.propertyResolver.getAllProperties(),
    };

    const { exportName, args } = this.buildHookInvocation(
      call.hook,
      requestHeaders,
      responseHeaders,
      requestBody,
      responseBody,
    );
    let returnCode = this.callIfExported(exportName, ...args);

    // PAUSE loop: handle proxy_http_call dispatches from WASM
    const PAUSE = 1;
    while (returnCode === PAUSE && this.hostFunctions.hasPendingHttpCall()) {
      const pending = this.hostFunctions.takePendingHttpCall()!;

      // Build URL from pseudo-headers (matching Rust runtime make_request logic)
      const authority = pending.headers[':authority'] || pending.upstream;
      const scheme    = pending.headers[':scheme']    || 'https';
      const path      = pending.headers[':path']      || '/';
      const method    = pending.headers[':method']    || 'GET';
      const url = `${scheme}://${authority}${path}`;

      // Strip pseudo-headers; pass only regular headers to fetch
      const fetchHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(pending.headers)) {
        if (!k.startsWith(':')) fetchHeaders[k] = v;
      }

      // Collect tuples so duplicate Set-Cookie entries survive through to the WASM-visible
      // HttpCallResponseHeaders map (RFC 6265 §3 — Set-Cookie is not comma-combinable).
      let responseHeaders: HeaderTuples = [];
      let responseBody = new Uint8Array(0);

      try {
        await checkEgressAllowed(url);
        const resp = await fetch(url, {
          method,
          headers: fetchHeaders,
          body: pending.body && method !== 'GET' && method !== 'HEAD' ? Buffer.from(pending.body) : undefined,
          signal: AbortSignal.timeout(pending.timeoutMs),
          // Redirects are not followed; the redirect target was not checked against the egress policy.
          redirect: "manual",
        });
        resp.headers.forEach((v, k) => {
          if (k.toLowerCase() !== 'set-cookie') responseHeaders.push([k, v]);
        });
        for (const cookie of resp.headers.getSetCookie()) {
          responseHeaders.push(['set-cookie', cookie]);
        }
        responseBody = new Uint8Array(await resp.arrayBuffer());
        this.logDebug(
          `http_call response: ${resp.status} ${resp.statusText} numHeaders=${responseHeaders.length} bodySize=${responseBody.byteLength}`,
        );
      } catch (err) {
        // Timeout or network error → numHeaders = 0 (proxy-wasm contract for failed calls)
        const errMsg = `http_call failed for ${url}: ${String(err)}`;
        this.logDebug(errMsg);
        // Always surface fetch failures in the WASM-visible logs so developers can diagnose
        this.logs.push({ level: 3, message: `[host] ${errMsg}` });
        responseHeaders = [];
        responseBody = new Uint8Array(0);
      }

      const numHeaders = responseHeaders.length;
      const bodySize   = responseBody.byteLength;

      this.hostFunctions.setHttpCallResponse(pending.tokenId, responseHeaders, responseBody);
      this.hostFunctions.resetStreamClosed();

      // Call back into the SAME instance
      this.callIfExported(
        'proxy_on_http_call_response',
        this.currentContextId,
        pending.tokenId,
        numHeaders,
        bodySize,
        0, // num_trailers
      );

      if (this.hostFunctions.isStreamClosed()) {
        break;
      }

      // Re-run the original hook on the same instance (WASM should now return Continue)
      returnCode = this.callIfExported(exportName, ...args) ?? 0;
    }

    // Clean up instance after PAUSE loop fully resolves
    this.instance = null;
    this.hostFunctions.clearHttpCallResponse();

    // Capture output state after hook execution (including all properties after modifications)
    const outputState = {
      request: {
        headers: { ...this.hostFunctions.getRequestHeaders() },
        body: this.hostFunctions.getRequestBody(),
      },
      response: {
        headers: { ...this.hostFunctions.getResponseHeaders() },
        body: this.hostFunctions.getResponseBody(),
      },
      properties: this.propertyResolver.getAllProperties(),
    };

    // Filter logs based on log level
    const filteredLogs = this.logs.filter((log) =>
      this.hostFunctions.shouldLog(log.level),
    );

    const storeCalls = this.storeCalls();
    const local = this.hostFunctions.getLocalResponse();
    return {
      returnCode,
      logs: filteredLogs,
      input: inputState,
      output: outputState,
      properties: this.propertyResolver.getAllProperties(),
      ...(storeCalls ? { storeCalls } : {}),
      ...(local ? { localResponse: { statusCode: local.statusCode, statusText: local.statusText, headers: local.headers, bodyBase64: Buffer.from(local.body).toString("base64") } } : {}),
      customProperties: this.propertyAccessControl.readableCustomProperties(),
    };
  }

  private resetState(): void {
    this.logs = [];
    this.rootContextId = 1;
    this.nextContextId = 2;
    this.currentContextId = 1;
    this.module = null;
    this.instance = null;
    this.memory.reset();
  }

  private ensureInitialized(vmConfig: string, pluginConfig: string): void {
    // Each hook call now has a fresh instance, so always initialize
    this.isInitializing = true;
    this.memory.setInitializing(true);

    // Create root context FIRST — required by Rust proxy-wasm SDK before any other lifecycle calls
    try {
      this.callIfExported("proxy_on_context_create", this.rootContextId, 0);
    } catch (error) {
      this.logDebug(`proxy_on_context_create(root) skipped: ${String(error)}`);
    }

    const vmConfigSize = byteLength(vmConfig);
    this.logDebug(
      `vm_config bytes=${vmConfigSize} value=${vmConfig.replace(/\0/g, "\\0")}`,
    );
    try {
      this.callIfExported(
        "proxy_on_vm_start",
        this.rootContextId,
        vmConfigSize,
      );
    } catch (error) {
      // Known issue: G-Core SDK initialization hooks fail in test mode
      // This is expected and doesn't affect hook execution
      this.logDebug(
        `proxy_on_vm_start skipped (expected in test mode): ${String(error)}`,
      );
    }
    try {
      this.callIfExported(
        "proxy_on_plugin_start",
        this.rootContextId,
        byteLength(pluginConfig),
      );
    } catch (error) {
      this.logDebug(`proxy_on_plugin_start skipped: ${String(error)}`);
    }
    const pluginConfigSize = byteLength(pluginConfig);
    this.logDebug(
      `plugin_config bytes=${pluginConfigSize} value=${pluginConfig.replace(/\0/g, "\\0")}`,
    );
    try {
      this.callIfExported(
        "proxy_on_configure",
        this.rootContextId,
        pluginConfigSize,
      );
    } catch (error) {
      this.logDebug(
        `proxy_on_configure skipped (expected in test mode): ${String(error)}`,
      );
    }

    this.memory.setInitializing(false);
    this.isInitializing = false;
  }

  private buildHookInvocation(
    hook: string,
    requestHeaders: HeaderMap | HeaderRecord,
    responseHeaders: HeaderMap | HeaderRecord,
    requestBody: string,
    responseBody: string,
  ): {
    exportName: string;
    args: number[];
  } {
    // Header count must include duplicates (e.g. multiple Set-Cookie) to match
    // proxy_get_header_map_size, which reports tuple length.
    const countEntries = (h: HeaderMap | HeaderRecord): number => {
      let n = 0;
      for (const v of Object.values(h)) {
        n += Array.isArray(v) ? v.length : 1;
      }
      return n;
    };
    switch (hook) {
      case "onRequestHeaders":
        return {
          exportName: "proxy_on_request_headers",
          args: [this.currentContextId, countEntries(requestHeaders), 0],
        };
      case "onRequestBody":
        return {
          exportName: "proxy_on_request_body",
          args: [this.currentContextId, byteLength(requestBody), 1],
        };
      case "onResponseHeaders":
        return {
          exportName: "proxy_on_response_headers",
          args: [this.currentContextId, countEntries(responseHeaders), 0],
        };
      case "onResponseBody":
        return {
          exportName: "proxy_on_response_body",
          args: [this.currentContextId, byteLength(responseBody), 1],
        };
      default:
        throw new Error(`Unsupported hook: ${hook}`);
    }
  }

  private callIfExported(name: string, ...args: number[]): number | null {
    if (!this.instance) {
      return null;
    }

    const exported = this.instance.exports[name];
    if (typeof exported !== "function") {
      return null;
    }

    try {
      return exported(...args) as number;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logDebug(`trap in ${name}(${args.join(",")}): ${message}`);
      throw error;
    }
  }

  private createImports(): WebAssembly.Imports {
    // Node WASI's `environ_get` rejects calls when the env table is empty:
    // the AS wasi-shim calls `__alloc(0)` for the zero-sized buffer, passes
    // the resulting null/invalid pointer to `environ_get`, and Node returns
    // `INVAL`. That throws inside `lazyEnv()`, aborts `_start` mid-init, and
    // leaves `process.env` as a partially-constructed Map — the first
    // `process.env.has(...)` call from user code then traps with a memory
    // access out-of-bounds.
    //
    // Production FastEdge guarantees an at-least-empty WASI env table, so we
    // mirror that here by seeding a runner sentinel when the dictionary is
    // empty. The double-underscore name is reserved by convention and won't
    // collide with user-set env vars.
    const dictEnv = this.dictionary.getAll();
    const wasiEnv = Object.keys(dictEnv).length === 0
      ? { __FASTEDGE_RUNNER__: "1" }
      : dictEnv;
    const wasi = new WASI({ version: "preview1", env: wasiEnv });
    const wasiImport = wasi.wasiImport as Record<string, unknown>;

    return {
      env: {
        ...this.hostFunctions.createImports(),
        ...storesImports(this.memory, this.tracedStores(), (message) => this.logs.push({ level: 3, message })),
      },
      wasi_snapshot_preview1: {
        ...wasiImport,
        initialize: wasi.initialize.bind(wasi),
        fd_write: (
          fd: number,
          iovs: number,
          iovsLen: number,
          nwritten: number,
        ) => {
          const captured = this.memory.captureFdWrite(
            fd,
            iovs,
            iovsLen,
            nwritten,
          );
          const original = wasiImport.fd_write as
            | ((
                fd: number,
                iovs: number,
                iovsLen: number,
                nwritten: number,
              ) => number)
            | undefined;
          // In test mode, suppress stdout/stderr to reduce noise
          // Logs are still captured via proxy_log for test assertions
          const isTestMode = process.env.VITEST || process.env.NODE_ENV === 'test';
          if (typeof original === "function" && !isTestMode) {
            try {
              return original(fd, iovs, iovsLen, nwritten);
            } catch (error) {
              this.logDebug(`wasi fd_write failed: ${String(error)}`);
            }
          }
          if (nwritten) {
            this.memory.writeU32(nwritten, captured);
          }
          return 0;
        },
        proc_exit: (exitCode: number) => {
          // Suppress proc_exit logs during initialization (expected failures)
          if (!this.isInitializing || exitCode !== 255) {
            this.logs.push({
              level: 2,
              message: `WASI proc_exit(${exitCode}) intercepted`,
            });
          }
          return 0;
        },
      },
    };
  }

  private deriveRootId(properties: Record<string, unknown>): string | null {
    const candidates = [
      "root_id",
      "rootId",
      "root_context",
      "rootContext",
      "root_context_name",
      "rootContextName",
      "plugin_name",
      "pluginName",
      "context_name",
      "contextName",
    ];
    for (const key of candidates) {
      const value = properties[key];
      if (typeof value === "string" && value.length > 0) {
        return value;
      }
    }
    return null;
  }

  /**
   * Map hook name to HookContext enum
   */
  private getHookContext(hookName: string): HookContext {
    switch (hookName) {
      case "onRequestHeaders":
        return HookContext.OnRequestHeaders;
      case "onRequestBody":
        return HookContext.OnRequestBody;
      case "onResponseHeaders":
        return HookContext.OnResponseHeaders;
      case "onResponseBody":
        return HookContext.OnResponseBody;
      default:
        throw new Error(`Unknown hook name: ${hookName}`);
    }
  }

  private logDebug(message: string): void {
    if (!this.debug) {
      return;
    }
    const entry = { level: 0, message: `debug: ${message}` };
    this.logs.push(entry);
    console.warn(entry.message);
  }

  /**
   * Interface-compliant callFullFlow method.
   *
   * The upstream response is generated at runtime by a real HTTP fetch
   * against `url` or by the built-in responder when `url === "built-in"`.
   */
  async callFullFlow(
    url: string,
    method: string,
    headers: Record<string, string>,
    body: string,
    properties: Record<string, unknown>,
    enforceProductionPropertyRules: boolean,
    context?: RequestContext,
  ): Promise<FullFlowResult> {
    const call: HookCall = {
      hook: "", // Not used in fullFlow
      request: {
        headers,
        body,
        method,
      },
      properties,
      enforceProductionPropertyRules,
    };

    return this.withContext(call, context, (c) => this.flowRequestId.run(randomUUID(), () => this.callFullFlowLegacy(c, url)));
  }

  /**
   * Not supported for Proxy-WASM (HTTP WASM only)
   */
  async execute(_request: HttpRequest): Promise<HttpResponse> {
    throw new Error(
      "execute() is not supported for Proxy-WASM. Use callHook() or callFullFlow() instead."
    );
  }

  /**
   * Clean up resources (no-op for Proxy-WASM, but required by interface)
   */
  async cleanup(): Promise<void> {
    // Proxy-WASM doesn't maintain long-running processes
    // State is reset on each load() call
  }

  /**
   * Get runner type
   */
  getType(): WasmType {
    return "proxy-wasm";
  }
}

function byteLength(value: string): number {
  return textEncoder.encode(value).length;
}

function normalizeConfigValue(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

function ensureNullTerminated(value: string): string {
  if (!value) {
    return "";
  }
  return value.endsWith("\0") ? value : `${value}\0`;
}
