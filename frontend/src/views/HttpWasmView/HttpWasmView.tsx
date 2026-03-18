import { useRef, useState } from "react";
import { CollapsiblePanel } from "../../components/common/CollapsiblePanel";
import { DotenvPanel } from "../../components/common/DotenvPanel";
import { RequestPanel } from "../../components/common/RequestPanel";
import { ResponsePanel } from "../../components/common/ResponsePanel";
import { LogsViewer } from "../../components/common/LogsViewer";
import { LogLevelSelector } from "../../components/common/LogLevelSelector";
import { useAppStore } from "../../stores";
import { HTTP_WASM_HOST } from "../../stores/slices/httpWasmSlice";
import styles from "./HttpWasmView.module.css";

const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
  "HEAD",
  "OPTIONS",
];

export function HttpWasmView() {
  const urlInputRef = useRef<HTMLInputElement>(null);
  const [logLevel, setLogLevel] = useState<number>(0);

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
    dotenvEnabled,
    dotenvPath,
    setHttpMethod,
    setHttpUrl,
    setHttpRequestHeaders,
    setHttpRequestBody,
    setHttpLogs,
    setDotenvEnabled,
    setDotenvPath,
    executeHttpRequest,
  } = useAppStore();

  const handleUrlChange = (newPath: string) => {
    // Construct full URL with fixed host + new path
    setHttpUrl(HTTP_WASM_HOST + newPath);
  };

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
          methods={HTTP_METHODS}
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
          enabled={dotenvEnabled}
          onToggle={setDotenvEnabled}
          path={dotenvPath}
          onPathChange={setDotenvPath}
        />

        {/* Logging Panel */}
        <CollapsiblePanel title="Logging" defaultExpanded={httpLogs.length > 0}>
          <div className={styles.loggingContent}>
            <div className={styles.loggingHeader}>
              <div className={styles.logTab}>
                <span className={styles.tabLabel}>Logs</span>
                {httpLogs.length > 0 && (
                  <button
                    className={styles.clearLogsButton}
                    onClick={() => setHttpLogs([])}
                    title="Clear logs"
                  >
                    🧹
                  </button>
                )}
              </div>
              <div className={styles.loggingControls}>
                <LogLevelSelector
                  logLevel={logLevel}
                  onLogLevelChange={setLogLevel}
                />
              </div>
            </div>
            <LogsViewer logs={httpLogs} logLevel={logLevel} />
          </div>
        </CollapsiblePanel>

        {/* Response Panel */}
        <ResponsePanel response={httpResponse} />
      </div>
    </div>
  );
}
