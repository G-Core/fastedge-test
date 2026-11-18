import { useEffect, useRef, useState } from "react";
import { useAppStore } from "./stores";
import { useWebSocket } from "./hooks/useWebSocket";
import type { ServerEvent } from "./hooks/websocket-types";
import { WasmLoader } from "./components/common/WasmLoader";
import { ConnectionStatus } from "./components/common/ConnectionStatus";
import { LoadingSpinner } from "./components/common/LoadingSpinner";
import { ConfigButtons } from "./components/common/ConfigButtons";
import { DragDropZone } from "./components/common/DragDropZone";
import { HttpWasmView } from "./views/HttpWasmView";
import { ProxyWasmView } from "./views/ProxyWasmView";
import { StorageExplorerView } from "./views/StorageExplorerView";
import { ResourceView } from "./views/ResourceView";
import { Tabs } from "./components/common/Tabs";
import { Toggle } from "./components/common/Toggle";
import { STORES_CHANGED } from "./components/common/StoresPanel/StoresPanel";
import { getEnvironment, type EnvironmentInfo, type ResourceLoaded, type ResourceResult } from "./api";
import "./App.css";

function App() {
  // Environment detection state
  const [_environment, setEnvironment] = useState<EnvironmentInfo | null>(null);
  // Page: the Debugger or the Storage Explorer. With multi-app on, the Debugger page shows the CDN
  // resource editor instead of the single-app debugger (both stay mounted, one hidden).
  type Page = "debugger" | "storage";
  const [page, setPage] = useState<Page>("debugger");
  const [multiApp, setMultiApp] = useState(false);
  // The loaded resource (several apps) and its last request; a resource replaces the loaded app.
  const [resourceLoaded, setResourceLoaded] = useState<ResourceLoaded | null>(null);
  const [resourceResult, setResourceResult] = useState<ResourceResult | null>(null);
  // The last resource file saved through the API (by this page or anyone else).
  const [resourceSaved, setResourceSaved] = useState<{ configPath: string; version: string } | null>(null);

  // Get state and actions from stores
  const {
    // WASM state
    wasmPath,
    wasmFile,
    wasmType,
    loading,
    error,
    loadWasm,
    reloadWasm,
    setWasmLoaded,
    clearWasm,
    loadingMode,
    loadTime,
    fileSize,

    // Proxy-WASM state (for WebSocket event handling)
    setUrl,
    setMethod,
    setRequestHeaders,
    setHookResults,
    setFinalResponse,
    hookResults,
    mergeProperties,
    setCalculatedProperties,

    // HTTP WASM state (for WebSocket event handling)
    setHttpResponse,
    appendHttpLogs,
    setHttpRunnerPort,

    // Config state
    dotenv,
    edge,
    loadFromConfig,

    // UI state
    wsStatus,
    setWsStatus,
    setWorkspaceRoot,
  } = useAppStore();

  // fastedge-run reads the KV store list when it starts: after the explorer creates or deletes a
  // store, a loaded HTTP app reloads on the way back to the debugger.
  const storeListChanged = useRef(false);
  useEffect(() => {
    const onChange = (e: Event) => {
      if ((e as CustomEvent<{ storeList?: boolean }>).detail?.storeList) storeListChanged.current = true;
    };
    window.addEventListener(STORES_CHANGED, onChange);
    return () => window.removeEventListener(STORES_CHANGED, onChange);
  }, []);
  const showPage = (next: Page) => {
    if (next === "debugger" && storeListChanged.current && wasmType === "http-wasm" && wasmPath && !loading) {
      storeListChanged.current = false;
      void reloadWasm(dotenv.enabled);
    }
    setPage(next);
  };

  // WebSocket connection for real-time updates
  const { status } = useWebSocket({
    autoConnect: true,
    debug: true, // Enable debug logging to console
    onEvent: handleServerEvent,
  });

  // Sync WebSocket status to store
  useEffect(() => {
    setWsStatus(status);
  }, [status, setWsStatus]);

  // Track if this is the initial mount to avoid reloading WASM on mount
  const isInitialMount = useRef(true);

  // Detect environment on mount
  useEffect(() => {
    const initializeEnvironment = async () => {
      try {
        const envInfo = await getEnvironment();
        setEnvironment(envInfo);
        setWorkspaceRoot(envInfo.workspaceRoot ?? null);
        console.log(`[App] Detected environment: ${envInfo.environment}`);
      } catch (error) {
        console.error("[App] Failed to initialize environment:", error);
        // Default to node environment
        setEnvironment({
          environment: 'node',
          supportsPathLoading: true,
          workspaceRoot: null,
        });
      }
    };

    initializeEnvironment();
  }, []);

  // Reload WASM when dotenv toggle changes (only if WASM is already loaded)
  useEffect(() => {
    // Skip on initial mount
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (wasmFile || wasmPath) {
      console.log(
        `[App] Dotenv toggle changed to ${dotenv.enabled}, reloading WASM...`,
      );
      reloadWasm(dotenv.enabled);
    }
  }, [dotenv.enabled, wasmFile, wasmPath, reloadWasm]);

  // The edge's dc is the cache bucket, fixed when the app loads: reload when it changes (the
  // dc field applies on blur / Enter). Everything else in the context goes with each request.
  const edgeKey = edge ? `${edge.dc ?? ""}|${edge.preset ?? ""}` : "";
  const loadedEdgeKey = useRef(edgeKey);
  const startedEdgeKey = useRef(edgeKey);
  useEffect(() => {
    // A load reads the edge when it starts; one changed during the load still needs a reload.
    if (loading) startedEdgeKey.current = edgeKey;
    else loadedEdgeKey.current = startedEdgeKey.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);
  useEffect(() => {
    // A load in progress (e.g. a config load, which sets the edge first) uses the new edge itself.
    if (loading || edgeKey === loadedEdgeKey.current || !(wasmFile || wasmPath)) return;
    loadedEdgeKey.current = edgeKey; // one reload per change
    void reloadWasm(dotenv.enabled);
  }, [edgeKey, loading, wasmFile, wasmPath, dotenv.enabled, reloadWasm]);

  /**
   * Handle WebSocket events from server
   * This keeps UI in sync with server state regardless of source (UI, AI agent, API)
   */
  function handleServerEvent(event: ServerEvent) {
    console.log(`[App] Received ${event.type} from ${event.source}`);

    switch (event.type) {
      case "wasm_loaded":
        console.log(
          `WASM loaded: ${event.data.filename} (${event.data.size} bytes)`,
        );
        // An app replaces a loaded resource.
        setResourceLoaded(null);
        setResourceResult(null);
        setMultiApp(false);
        // Store runner port so ResponsePanel can build the live preview URL
        setHttpRunnerPort(event.data.runnerPort ?? null);
        // Sync store when loaded externally (e.g. VSCode extension) so the
        // UI exits the empty state without the UI having called loadWasm itself
        if (event.source !== "ui") {
          setWasmLoaded(event.data.resolvedPath ?? event.data.filename, event.data.wasmType, event.data.size);
        }
        break;

      case "request_started":
        // Request started - update URL and method in UI (for proxy-wasm).
        // The editable request-headers field stores single-valued pairs;
        // flatten any multi-valued entries with ", " for display.
        setUrl(event.data.url);
        setMethod(event.data.method);
        setRequestHeaders(
          Object.fromEntries(
            Object.entries(event.data.headers).map(([k, v]) => [
              k,
              Array.isArray(v) ? v.join(", ") : v,
            ]),
          ),
        );
        // Clear previous results
        setHookResults({});
        setFinalResponse(null);
        break;

      case "hook_executed":
        // Individual hook executed - update hook results incrementally (for proxy-wasm)
        const hookName = event.data.hook;
        setHookResults({
          ...hookResults,
          [hookName]: {
            logs: [], // Will be populated by request_completed
            returnValue: event.data.returnCode ?? undefined,
            input: event.data.input,
            output: event.data.output,
          },
        });
        break;

      case "request_completed":
        // Full request completed (for proxy-wasm) - update all results and final response
        setHookResults(event.data.hookResults);
        setFinalResponse(event.data.finalResponse);
        // Store calculated properties separately for read-only display.
        // These are NOT in the editable `properties` store — no stale feedback loop.
        if (event.data.calculatedProperties) {
          const stringProps: Record<string, string> = {};
          for (const [k, v] of Object.entries(event.data.calculatedProperties)) {
            stringProps[k] = String(v);
          }
          setCalculatedProperties(stringProps);
        }
        break;

      case "request_failed":
        // Request failed (for proxy-wasm) - show error
        const errorResult = {
          logs: [],
          returnValue: undefined,
          error: event.data.error,
        };
        setHookResults({
          onRequestHeaders: errorResult,
          onRequestBody: errorResult,
          onResponseHeaders: errorResult,
          onResponseBody: errorResult,
        });
        setFinalResponse(null);
        break;

      case "http_wasm_request_completed":
        // HTTP WASM request completed - update response only (logs streamed via http_wasm_log)
        setHttpResponse(event.data.response);
        break;

      case "http_wasm_log":
        // Real-time log line from fastedge-run (execute and live mode)
        appendHttpLogs([event.data]);
        break;

      case "properties_updated":
        // Properties updated externally (for proxy-wasm)
        mergeProperties(event.data.properties);
        break;

      case "reload_workspace_wasm":
        // Reload workspace WASM (VSCode only, triggered by F5 rebuild)
        console.log(`[App] Reloading workspace WASM: ${event.data.path}`);
        loadWasm(event.data.path, dotenv.enabled);
        break;

      case "resource_loaded":
        // A resource replaces the loaded app.
        clearWasm();
        setResourceLoaded(event.data);
        setMultiApp(true);
        setResourceResult(null);
        break;

      case "resource_saved":
        setResourceSaved(event.data);
        break;

      case "resource_request_completed":
        setResourceResult(event.data.result);
        break;

      case "connection_status":
        // Connection status update - handled by useWebSocket
        break;
    }
  }

  /**
   * Handle WASM file drop
   * Accepts either File object (buffer mode) or string path (path mode)
   */
  const handleWasmDrop = async (fileOrPath: File | string) => {
    try {
      await loadWasm(fileOrPath, dotenv.enabled);
      const fileName = typeof fileOrPath === "string"
        ? fileOrPath.split('/').pop() || fileOrPath
        : fileOrPath.name;
      console.log(`✅ WASM loaded via drag & drop: ${fileName}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      alert(`❌ Failed to load WASM: ${msg}`);
    }
  };

  /**
   * Handle config file drop
   * Loads config and auto-loads WASM if path is present
   */
  const handleConfigDrop = async (file: File) => {
    try {
      const text = await file.text();
      const config = JSON.parse(text);

      // Validate config structure
      if (!config.request || !config.properties || config.logLevel === undefined) {
        throw new Error('Invalid config file structure');
      }

      // Warn about relative dotenv path — browser drag-drop hides the full
      // file path, so relative paths will fall back to the server workspace root.
      if (config.dotenv?.path && !config.dotenv.path.startsWith('/')) {
        console.warn(`Config contains relative dotenv path "${config.dotenv.path}" — will resolve against server workspace root, not the config file location.`);
      }

      // Load config state
      loadFromConfig(config);

      // Auto-load WASM if path is specified
      if (config.wasm?.path) {
        try {
          await loadWasm(config.wasm.path, dotenv.enabled);
          alert(`✅ Configuration loaded from ${file.name}\n🚀 WASM auto-loaded: ${config.wasm.path}`);
        } catch (wasmError) {
            alert(`✅ Configuration loaded from ${file.name}\n⚠️ WASM path not found. Please load WASM manually.`);
        }
      } else {
        alert(`✅ Configuration loaded from ${file.name}!`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      alert(`❌ Failed to load config: ${msg}`);
    }
  };

  return (
    <DragDropZone onWasmDrop={handleWasmDrop} onConfigDrop={handleConfigDrop}>
      <div className="container">
        <header>
          <h1>
            {wasmType === 'http-wasm' ? 'HTTP WASM Debugger' :
             wasmType === 'proxy-wasm' ? 'Proxy-WASM Test Runner' :
             'FastEdge WASM Debugger'}
          </h1>
          <ConnectionStatus status={wsStatus} />
        </header>
        <div className="page-tabs">
          <Tabs
            tabs={[
              { id: "debugger", label: "Debugger" },
              { id: "storage", label: "Storage Explorer" },
            ]}
            active={page}
            onChange={showPage}
          />
          {page === "debugger" &&
            (wasmType === "http-wasm" && wasmPath && !multiApp ? (
              <span className="multi-app-note">Multi-app (CDN resource) runs several CDN apps on one resource: unload this HTTP app to use it.</span>
            ) : (
              <Toggle label="Multi-app (CDN resource)" checked={multiApp} onChange={setMultiApp} compact />
            ))}
        </div>

        {wsStatus.error?.startsWith("Missing session token") && (
          <div className="error">{wsStatus.error}</div>
        )}
        {page === "storage" && <StorageExplorerView />}
        <div hidden={page !== "debugger" || !multiApp}>
          <ResourceView loaded={resourceLoaded} result={resourceResult} onResult={setResourceResult} appLoaded={!!wasmPath} saved={resourceSaved} />
        </div>

        <div hidden={page !== "debugger" || multiApp}>
        {error && <div className="error">{error}</div>}

        <WasmLoader
          onFileLoad={(file) => loadWasm(file, dotenv.enabled)}
          onPathLoad={(path) => loadWasm(path, dotenv.enabled)}
          loading={loading}
          wasmPath={wasmPath}
          loadingMode={loadingMode}
          loadTime={loadTime}
          fileSize={fileSize}
          fileName={wasmPath}
          defaultTab="path"
        />

        {/* Config Management - Always visible */}
        <ConfigButtons />

        {/* Show loading spinner while detecting WASM type */}
        {loading && <LoadingSpinner message="Loading and detecting WASM type..." />}

        {/* Show appropriate view based on WASM type */}
        {!loading && !wasmPath && (
          <div className="empty-state">
            <p>👆 Load a WASM binary to get started</p>
            {resourceLoaded && <p>A multi-app resource is loaded: loading an app here unloads it.</p>}
          </div>
        )}

        {/* A reload (dotenv, edge dc) keeps the view and its open panels on screen. */}
        {wasmPath && wasmType === 'http-wasm' && <HttpWasmView />}
        {wasmPath && wasmType === 'proxy-wasm' && <ProxyWasmView />}
        </div>
      </div>
    </DragDropZone>
  );
}

export default App;
