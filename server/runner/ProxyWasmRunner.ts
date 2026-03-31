import { WASI } from "node:wasi";
import type { HookCall, HookResult, HeaderMap, FullFlowResult } from "./types";
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

const textEncoder = new TextEncoder();

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

  async load(bufferOrPath: Buffer | string, config?: RunnerConfig): Promise<void> {
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

    const results: Record<string, HookResult> = {};

    // Extract runtime properties from target URL before executing hooks
    this.propertyResolver.extractRuntimePropertiesFromUrl(targetUrl);
    this.logDebug(`Extracted runtime properties from URL: ${targetUrl}`);

    // Auto-inject Host header from URL if not already present
    // This matches browser behavior where Host is automatically set
    const hasHost = Object.keys(call.request.headers ?? {}).some(
      (key) => key.toLowerCase() === "host",
    );
    if (!hasHost) {
      try {
        const urlObj = new URL(targetUrl);
        const hostValue =
          urlObj.port && urlObj.port !== "80" && urlObj.port !== "443"
            ? `${urlObj.hostname}:${urlObj.port}`
            : urlObj.hostname;
        call.request.headers = call.request.headers ?? {};
        call.request.headers["host"] = hostValue;
        this.logDebug(`Auto-injected Host header: ${hostValue}`);
      } catch (error) {
        this.logDebug(`Failed to extract host from URL: ${String(error)}`);
      }
    }

    // Emit request started event
    if (this.stateManager) {
      const requestMethod = call.request.method ?? "GET";
      this.stateManager.emitRequestStarted(
        targetUrl,
        requestMethod,
        call.request.headers || {},
        "system",
      );
    }

    // Phase 1: Run request hooks
    results.onRequestHeaders = await this.callHook({
      ...call,
      hook: "onRequestHeaders",
    });

    // Emit hook executed event
    if (this.stateManager) {
      this.stateManager.emitHookExecuted(
        "onRequestHeaders",
        results.onRequestHeaders.returnCode,
        results.onRequestHeaders.logs.length,
        results.onRequestHeaders.input,
        results.onRequestHeaders.output,
        "system",
      );
    }

    // Check if WASM sent a local response (e.g., 302 redirect) — skip origin fetch
    if (results.onRequestHeaders.returnCode === 1 && this.hostFunctions.hasLocalResponse()) {
      const local = this.hostFunctions.getLocalResponse()!;
      const responseHeaders = results.onRequestHeaders.output.response.headers;
      this.hostFunctions.resetLocalResponse();

      const contentType = responseHeaders['content-type'] || 'text/plain';
      const { body, isBase64 } = encodeLocalResponseBody(local.body, contentType);

      return {
        hookResults: results,
        finalResponse: {
          status: local.statusCode,
          statusText: local.statusText,
          headers: responseHeaders,
          body,
          contentType,
          isBase64,
        },
        calculatedProperties: this.propertyResolver.getCalculatedProperties(),
      };
    }

    // Pass modified headers from onRequestHeaders to onRequestBody
    const headersAfterRequestHeaders =
      results.onRequestHeaders.output.request.headers;
    const propertiesAfterRequestHeaders = results.onRequestHeaders.properties;
    this.logDebug(
      `Headers after onRequestHeaders: ${JSON.stringify(headersAfterRequestHeaders)}`,
    );

    results.onRequestBody = await this.callHook({
      ...call,
      request: {
        ...call.request,
        headers: headersAfterRequestHeaders,
      },
      properties: propertiesAfterRequestHeaders,
      hook: "onRequestBody",
    });

    // Emit hook executed event
    if (this.stateManager) {
      this.stateManager.emitHookExecuted(
        "onRequestBody",
        results.onRequestBody.returnCode,
        results.onRequestBody.logs.length,
        results.onRequestBody.input,
        results.onRequestBody.output,
        "system",
      );
    }

    // Check if WASM sent a local response from onRequestBody
    if (results.onRequestBody.returnCode === 1 && this.hostFunctions.hasLocalResponse()) {
      const local = this.hostFunctions.getLocalResponse()!;
      const responseHeaders = results.onRequestBody.output.response.headers;
      this.hostFunctions.resetLocalResponse();

      const contentType = responseHeaders['content-type'] || 'text/plain';
      const { body, isBase64 } = encodeLocalResponseBody(local.body, contentType);

      return {
        hookResults: results,
        finalResponse: {
          status: local.statusCode,
          statusText: local.statusText,
          headers: responseHeaders,
          body,
          contentType,
          isBase64,
        },
        calculatedProperties: this.propertyResolver.getCalculatedProperties(),
      };
    }

    // Get modified request data from hooks
    const modifiedRequestHeaders = results.onRequestBody.output.request.headers;
    const modifiedRequestBody = results.onRequestBody.output.request.body;
    const propertiesAfterRequestBody = results.onRequestBody.properties;
    this.logDebug(
      `Final headers for fetch: ${JSON.stringify(modifiedRequestHeaders)}`,
    );
    const requestMethod = call.request.method ?? "GET";

    // Phase 2: Obtain origin response (built-in responder or real HTTP fetch)
    let responseHeaders: Record<string, string>;
    let responseBody: string;
    let responseStatus: number;
    let responseStatusText: string;
    let contentType: string;
    let isBase64 = false;

    try {
      if (targetUrl === "built-in") {
        // Built-in responder: generate response locally without a network fetch.
        // Control headers (stripped before building the response):
        //   x-debugger-status  — HTTP status code (default 200)
        //   x-debugger-content — "body-only" | "status-only" (default: full JSON echo)
        this.logDebug("Using built-in responder (targetUrl === 'built-in')");

        responseStatus = parseInt(
          modifiedRequestHeaders["x-debugger-status"] || "200",
          10,
        );
        responseStatusText = responseStatus === 200 ? "OK" : String(responseStatus);
        const responseContentMode =
          modifiedRequestHeaders["x-debugger-content"] || "";

        // Strip debugger control headers so they don't leak into the echo or response hooks
        const cleanedHeaders = { ...modifiedRequestHeaders };
        delete cleanedHeaders["x-debugger-status"];
        delete cleanedHeaders["x-debugger-content"];

        if (responseContentMode === "status-only") {
          responseBody = "";
          contentType = "text/plain";
        } else if (responseContentMode === "body-only") {
          responseBody = modifiedRequestBody || "";
          contentType = cleanedHeaders["content-type"] || "text/plain";
        } else {
          // Default: full JSON echo (similar to http-responder)
          contentType = "application/json";
          responseBody = JSON.stringify({
            method: requestMethod,
            reqHeaders: cleanedHeaders,
            reqBody: modifiedRequestBody || "",
            requestUrl: "built-in",
          });
        }

        responseHeaders = {
          "content-type": contentType,
          "content-length": String(Buffer.byteLength(responseBody)),
        };

        this.logDebug(
          `Built-in responder: ${responseStatus} ${responseStatusText}, mode=${responseContentMode || "full"}`,
        );
      } else {
        // Real HTTP fetch to origin
        // Reconstruct target URL from potentially modified properties
        // WASM can modify request.path, request.scheme, request.host, request.query
        const modifiedScheme =
          (propertiesAfterRequestBody["request.scheme"] as string) || "https";
        const modifiedHost =
          (propertiesAfterRequestBody["request.host"] as string) || "localhost";
        const modifiedPath =
          (propertiesAfterRequestBody["request.path"] as string) || "/";
        const modifiedQuery =
          (propertiesAfterRequestBody["request.query"] as string) || "";

        const actualTargetUrl = `${modifiedScheme}://${modifiedHost}${modifiedPath}${modifiedQuery ? "?" + modifiedQuery : ""}`;

        this.logDebug(`Original URL: ${targetUrl}`);
        this.logDebug(`Modified URL: ${actualTargetUrl}`);
        this.logDebug(`Fetching ${requestMethod} ${actualTargetUrl}`);

        // Preserve the host header as x-forwarded-host since fetch() will override it
        const fetchHeaders: Record<string, string> = {
          ...modifiedRequestHeaders,
        };

        // If there's a host header, also add it as x-forwarded-host
        const hostHeader = Object.entries(modifiedRequestHeaders).find(
          ([key]) => key.toLowerCase() === "host",
        );

        if (hostHeader) {
          fetchHeaders["x-forwarded-host"] = hostHeader[1];
          this.logDebug(`Adding x-forwarded-host: ${hostHeader[1]}`);
        }

        // Auto-inject standard proxy headers based on URL and properties
        fetchHeaders["x-forwarded-proto"] = modifiedScheme;
        this.logDebug(`Adding x-forwarded-proto: ${modifiedScheme}`);

        fetchHeaders["x-forwarded-port"] =
          modifiedScheme === "https" ? "443" : "80";
        this.logDebug(
          `Adding x-forwarded-port: ${fetchHeaders["x-forwarded-port"]}`,
        );

        // Add X-Real-IP and X-Forwarded-For if set in properties
        const realIp = this.propertyResolver.resolve("request.x_real_ip");
        if (realIp && realIp !== "") {
          fetchHeaders["x-real-ip"] = String(realIp);
          fetchHeaders["x-forwarded-for"] = String(realIp);
          this.logDebug(`Adding x-real-ip and x-forwarded-for: ${realIp}`);
        }

        const fetchOptions: RequestInit = {
          method: requestMethod,
          headers: fetchHeaders,
        };

        // Add body for methods that support it
        if (
          ["POST", "PUT", "PATCH"].includes(requestMethod.toUpperCase()) &&
          modifiedRequestBody
        ) {
          fetchOptions.body = modifiedRequestBody;
        }

        const response = await fetch(actualTargetUrl, fetchOptions);

        // Extract response headers
        responseHeaders = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        contentType = response.headers.get("content-type") || "text/plain";
        responseStatus = response.status;
        responseStatusText = response.statusText;

        // Check if response is binary (image, video, audio, etc.)
        const isBinary =
          contentType.startsWith("image/") ||
          contentType.startsWith("video/") ||
          contentType.startsWith("audio/") ||
          contentType.includes("application/octet-stream") ||
          contentType.includes("application/pdf") ||
          contentType.includes("application/zip");

        if (isBinary) {
          // For binary content, convert to base64
          const arrayBuffer = await response.arrayBuffer();
          responseBody = Buffer.from(arrayBuffer).toString("base64");
          isBase64 = true;
          this.logDebug(
            `Binary response converted to base64 (${arrayBuffer.byteLength} bytes)`,
          );
        } else {
          // For text content, just get as text
          responseBody = await response.text();
        }

        this.logDebug(
          `Fetch completed: ${responseStatus} ${responseStatusText}`,
        );
      }

      // Phase 3: Run response hooks with real response data
      // Use modified request headers from Phase 1, not original
      const responseCall = {
        ...call,
        request: {
          ...call.request,
          headers: modifiedRequestHeaders,
          body: modifiedRequestBody,
        },
        response: {
          headers: responseHeaders,
          body: responseBody,
          status: responseStatus,
          statusText: responseStatusText,
        },
        properties: propertiesAfterRequestBody,
      };

      // Reset custom properties from onRequestHeaders before moving to response hooks
      // (production behavior: custom properties created in onRequestHeaders are not available in response hooks)
      this.propertyAccessControl.resetCustomPropertiesForNewContext();

      results.onResponseHeaders = await this.callHook({
        ...responseCall,
        hook: "onResponseHeaders",
      });

      // Emit hook executed event
      if (this.stateManager) {
        this.stateManager.emitHookExecuted(
          "onResponseHeaders",
          results.onResponseHeaders.returnCode,
          results.onResponseHeaders.logs.length,
          results.onResponseHeaders.input,
          results.onResponseHeaders.output,
          "system",
        );
      }

      // Pass modified headers from onResponseHeaders to onResponseBody
      const headersAfterResponseHeaders =
        results.onResponseHeaders.output.response.headers;
      const propertiesAfterResponseHeaders =
        results.onResponseHeaders.properties;
      this.logDebug(
        `Headers after onResponseHeaders: ${JSON.stringify(headersAfterResponseHeaders)}`,
      );

      results.onResponseBody = await this.callHook({
        ...responseCall,
        response: {
          ...responseCall.response,
          headers: headersAfterResponseHeaders,
        },
        properties: propertiesAfterResponseHeaders,
        hook: "onResponseBody",
      });

      // Emit hook executed event
      if (this.stateManager) {
        this.stateManager.emitHookExecuted(
          "onResponseBody",
          results.onResponseBody.returnCode,
          results.onResponseBody.logs.length,
          results.onResponseBody.input,
          results.onResponseBody.output,
          "system",
        );
      }

      // Get final response after WASM modifications
      const finalHeaders = results.onResponseBody.output.response.headers;
      const finalBody = results.onResponseBody.output.response.body;
      this.logDebug(`Final response body length: ${finalBody.length}`);

      // Get calculated runtime properties to return to frontend
      const calculatedProperties =
        this.propertyResolver.getCalculatedProperties();

      return {
        hookResults: results,
        finalResponse: {
          status: responseStatus,
          statusText: responseStatusText,
          headers: finalHeaders,
          body: finalBody,
          contentType,
          isBase64,
        },
        calculatedProperties,
      };
    } catch (error) {
      // Extract detailed error information
      let errorMessage = "Fetch failed";
      let errorDetails = "";

      if (error instanceof Error) {
        errorMessage = error.message;
        if ((error as any).cause) {
          errorDetails = ` (cause: ${String((error as any).cause)})`;
        }
      } else {
        errorMessage = String(error);
      }

      const fullErrorMessage = `Failed to fetch ${requestMethod} ${targetUrl}: ${errorMessage}${errorDetails}`;
      this.logDebug(fullErrorMessage);

      // Get the last successful request state
      const lastRequestState = results.onRequestBody?.output?.request || {
        headers: modifiedRequestHeaders,
        body: modifiedRequestBody,
      };

      // Return error in response hooks
      const errorResult: HookResult = {
        returnCode: null,
        logs: [{ level: 4, message: fullErrorMessage }],
        input: {
          request: lastRequestState,
          response: { headers: {}, body: "" },
        },
        output: {
          request: lastRequestState,
          response: { headers: {}, body: "" },
        },
        properties: call.properties,
      };
      results.onResponseHeaders = errorResult;
      results.onResponseBody = errorResult;

      // Get calculated runtime properties even on error
      const calculatedProperties =
        this.propertyResolver.getCalculatedProperties();

      return {
        hookResults: results,
        finalResponse: {
          status: 0,
          statusText: "Fetch Failed",
          headers: {},
          body: fullErrorMessage,
          contentType: "text/plain",
        },
        calculatedProperties,
      };
    }
  }

  async callHook(call: HookCall): Promise<HookResult> {
    if (!this.module) {
      throw new Error("WASM module not loaded");
    }

    // Set current hook context for property access control
    this.currentHook = this.getHookContext(call.hook);

    // Clear stale local response from any previous hook execution
    this.hostFunctions.resetLocalResponse();

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
      call.response.headers ?? {},
    );
    const requestBody = call.request.body ?? "";
    const responseBody = call.response.body ?? "";
    const requestMethod = call.request.method ?? "GET";
    const responseStatus = call.response.status ?? 200;
    const responseStatusText = call.response.statusText ?? "OK";

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

      let responseHeaders: HeaderMap = {};
      let responseBody = new Uint8Array(0);

      try {
        const resp = await fetch(url, {
          method,
          headers: fetchHeaders,
          body: pending.body ? Buffer.from(pending.body) : undefined,
          signal: AbortSignal.timeout(pending.timeoutMs),
        });
        resp.headers.forEach((v, k) => { responseHeaders[k] = v; });
        responseBody = new Uint8Array(await resp.arrayBuffer());
        this.logDebug(
          `http_call response: ${resp.status} ${resp.statusText} numHeaders=${Object.keys(responseHeaders).length} bodySize=${responseBody.byteLength}`,
        );
      } catch (err) {
        // Timeout or network error → numHeaders = 0 (proxy-wasm contract for failed calls)
        this.logDebug(`http_call failed for ${url}: ${String(err)}`);
        responseHeaders = {};
        responseBody = new Uint8Array(0);
      }

      const numHeaders = Object.keys(responseHeaders).length;
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

    return {
      returnCode,
      logs: filteredLogs,
      input: inputState,
      output: outputState,
      properties: this.propertyResolver.getAllProperties(),
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
    requestHeaders: HeaderMap,
    responseHeaders: HeaderMap,
    requestBody: string,
    responseBody: string,
  ): {
    exportName: string;
    args: number[];
  } {
    switch (hook) {
      case "onRequestHeaders":
        return {
          exportName: "proxy_on_request_headers",
          args: [this.currentContextId, Object.keys(requestHeaders).length, 0],
        };
      case "onRequestBody":
        return {
          exportName: "proxy_on_request_body",
          args: [this.currentContextId, byteLength(requestBody), 1],
        };
      case "onResponseHeaders":
        return {
          exportName: "proxy_on_response_headers",
          args: [this.currentContextId, Object.keys(responseHeaders).length, 0],
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
    const wasi = new WASI({ version: "preview1" });
    const wasiImport = wasi.wasiImport as Record<string, unknown>;

    return {
      env: this.hostFunctions.createImports(),
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
   * Interface-compliant callFullFlow method
   */
  async callFullFlow(
    url: string,
    method: string,
    headers: Record<string, string>,
    body: string,
    responseHeaders: Record<string, string>,
    responseBody: string,
    responseStatus: number,
    responseStatusText: string,
    properties: Record<string, unknown>,
    enforceProductionPropertyRules: boolean
  ): Promise<FullFlowResult> {
    // Convert to HookCall format and call legacy method
    const call: HookCall = {
      hook: "", // Not used in fullFlow
      request: {
        headers,
        body,
        method,
      },
      response: {
        headers: responseHeaders,
        body: responseBody,
        status: responseStatus,
        statusText: responseStatusText,
      },
      properties,
      enforceProductionPropertyRules,
    };

    return this.callFullFlowLegacy(call, url);
  }

  /**
   * Not supported for Proxy-WASM (HTTP WASM only)
   */
  async execute(request: HttpRequest): Promise<HttpResponse> {
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

/** Encode a local response body (raw bytes from WASM) for the finalResponse.
 *  Mirrors the binary detection logic used for origin fetch responses. */
function encodeLocalResponseBody(
  body: Uint8Array,
  contentType: string,
): { body: string; isBase64: boolean } {
  const isBinary =
    contentType.startsWith("image/") ||
    contentType.startsWith("video/") ||
    contentType.startsWith("audio/") ||
    contentType.includes("application/octet-stream") ||
    contentType.includes("application/pdf") ||
    contentType.includes("application/zip");

  if (isBinary) {
    return { body: Buffer.from(body).toString("base64"), isBase64: true };
  }
  return { body: new TextDecoder().decode(body), isBase64: false };
}
