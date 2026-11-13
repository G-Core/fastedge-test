import { useRef, useState } from "react";
import { CollapsiblePanel } from "../../components/common/CollapsiblePanel";
import { DotenvPanel } from "../../components/common/DotenvPanel";
import { RequestContextPanel } from "../../components/common/RequestContextPanel";
import { RequestPanel } from "../../components/common/RequestPanel";
import { ResponsePanel } from "../../components/common/ResponsePanel";
import { StoresPanel } from "../../components/common/StoresPanel";
import { LogsViewer } from "../../components/common/LogsViewer";
import { StoreCallsList } from "../../components/common/StoreCallsList";
import { LogLevelSelector } from "../../components/common/LogLevelSelector";
import { useAppStore } from "../../stores";
import { HTTP_WASM_HOST } from "../../stores/slices/httpWasmSlice";
import styles from "./HttpWasmView.module.css";

export function HttpWasmView() {
  const urlInputRef = useRef<HTMLInputElement>(null);
  const [logLevel, setLogLevel] = useState<number>(0);
  const [logView, setLogView] = useState<"logs" | "storage">("logs");

  // Get state from store
  const {
    httpMethod,
    httpUrl,
    httpRequestHeaders,
    httpRequestBody,
    httpIsExecuting,
    httpResponse,
    httpLogs,
    wasmPath,
    dotenv,
    client,
    edge,
    setClient,
    setEdge,
    setHttpMethod,
    setHttpUrl,
    setHttpRequestHeaders,
    setHttpRequestBody,
    setHttpLogs,
    setDotenvEnabled,
    setDotenvPath,
    executeHttpRequest,
    expandedPanels,
    setPanelExpanded,
  } = useAppStore();

  const handleUrlChange = (newPath: string) => {
    // Construct full URL with fixed host + new path
    setHttpUrl(HTTP_WASM_HOST + newPath);
  };

  const storageCount = httpResponse?.storeCalls?.length ?? 0;

  const handleSend = () => {
    executeHttpRequest();
  };

  return (
    <div className={styles.httpWasmView}>
      <div className={styles.panels}>
        {/* Request Panel */}
        <RequestPanel
          method={httpMethod}
          url={httpUrl}
          wasmLoaded={wasmPath !== null}
          onMethodChange={setHttpMethod}
          onUrlChange={handleUrlChange}
          onSend={handleSend}
          urlPrefix={HTTP_WASM_HOST}
          urlPlaceholder=""
          isExecuting={httpIsExecuting}
          executingText="Executing..."
          urlInputRef={urlInputRef}
          headers={httpRequestHeaders}
          body={httpRequestBody}
          onHeadersChange={setHttpRequestHeaders}
          onBodyChange={setHttpRequestBody}
          headersLabel="Request Headers"
          bodyLabel="Request Body"
          bodyRows={10}
          headerKeyPlaceholder="Header name (e.g., Content-Type)"
          headerValuePlaceholder="Header value (e.g., application/json)"
          additionalContent={
            !wasmPath ? (
              <div className={styles.hint}>Load a WASM file first</div>
            ) : undefined
          }
        />

        {/* Dotenv Panel */}
        <DotenvPanel
          enabled={dotenv.enabled}
          onToggle={setDotenvEnabled}
          path={dotenv.path}
          onPathChange={setDotenvPath}
          isExpanded={expandedPanels['dotenv'] ?? false}
          onExpandedChange={(expanded) => setPanelExpanded('dotenv', expanded)}
        />

        <RequestContextPanel
          appType="http-wasm"
          client={client}
          edge={edge}
          onClientChange={setClient}
          onEdgeChange={setEdge}
        />

        {/* Logging Panel: app logs, and the cache / Edge KV calls of the last request */}
        <CollapsiblePanel title="Logging" defaultExpanded={httpLogs.length > 0}>
          <div className={styles.loggingContent}>
            <div className={styles.loggingHeader}>
              <div className={styles.logTabs} role="tablist">
                <div
                  role="tab"
                  aria-selected={logView === "logs"}
                  tabIndex={0}
                  className={`${styles.logTab} ${logView === "logs" ? styles.active : ""}`}
                  onClick={() => setLogView("logs")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setLogView("logs");
                  }}
                >
                  <span className={styles.tabLabel}>Logs</span>
                  {httpLogs.length > 0 && (
                    <button
                      className={styles.clearLogsButton}
                      onClick={(e) => {
                        e.stopPropagation();
                        setHttpLogs([]);
                      }}
                      title="Clear logs"
                    >
                      🧹
                    </button>
                  )}
                </div>
                <div
                  role="tab"
                  aria-selected={logView === "storage"}
                  tabIndex={0}
                  className={`${styles.logTab} ${logView === "storage" ? styles.active : ""}`}
                  onClick={() => setLogView("storage")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setLogView("storage");
                  }}
                >
                  <span className={styles.tabLabel}>
                    Storage{storageCount ? ` (${storageCount})` : ""}
                  </span>
                </div>
              </div>
              {logView === "logs" && (
                <div className={styles.loggingControls}>
                  <LogLevelSelector
                    logLevel={logLevel}
                    onLogLevelChange={setLogLevel}
                  />
                </div>
              )}
            </div>
            {logView === "logs" ? (
              <LogsViewer logs={httpLogs} logLevel={logLevel} />
            ) : (
              <StoreCallsList calls={httpResponse?.storeCalls} source="request" />
            )}
          </div>
        </CollapsiblePanel>

        <StoresPanel refreshKey={httpResponse} />

        {/* Response Panel */}
        <ResponsePanel response={httpResponse} />
      </div>
    </div>
  );
}
