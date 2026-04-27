import { DotenvPanel } from "../../components/common/DotenvPanel";
import { RequestPanel } from "../../components/common/RequestPanel";
import { ServerPropertiesPanel } from "../../components/proxy-wasm/ServerPropertiesPanel";
import { HookStagesPanel } from "../../components/proxy-wasm/HookStagesPanel";
import { ResponsePanel } from "../../components/common/ResponsePanel";
import { useAppStore } from "../../stores";
import { applyDefaultContentType } from "../../utils/contentType";
import styles from "./ProxyWasmView.module.css";

// FastEdge's edge layer answers OPTIONS preflights before the WASM runs —
// proxy-wasm hooks never fire for OPTIONS on production, so don't offer it
// as a method choice in the CDN debugger UI.
const CDN_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"];

export function ProxyWasmView() {
  // Get state and actions from stores
  const {
    // Request state
    method,
    url,
    requestHeaders,
    requestBody,
    setMethod,
    setUrl,
    setRequestHeaders,
    setRequestBody,

    // Results state
    hookResults,
    finalResponse,
    setHookResults,
    setFinalResponse,

    // Config state
    properties,
    calculatedProperties,
    dotenv,
    logLevel,
    setProperties,
    setCalculatedProperties,
    setDotenvEnabled,
    setDotenvPath,
    setLogLevel,
    expandedPanels,
    setPanelExpanded,

    // WASM state
    wasmPath,
  } = useAppStore();

  // Response state (request_headers/body from slice; response seed is empty —
  // the real response comes from full-flow results or a specific single-hook call).
  const hookCall = {
    request_headers: requestHeaders,
    request_body: requestBody,
    request_trailers: {},
    response_headers: {},
    response_body: "",
    response_trailers: {},
    properties,
  };

  const handleSend = async () => {
    try {
      const finalHeaders = applyDefaultContentType(requestHeaders, requestBody);

      const { sendFullFlow } = await import("../../api");
      const {
        hookResults: newHookResults,
        finalResponse: response,
        calculatedProperties,
      } = await sendFullFlow(url, method, {
        ...hookCall,
        request_headers: finalHeaders,
        logLevel,
      });

      // Update hook results and final response
      setHookResults(newHookResults);
      setFinalResponse(response);

      // Store calculated properties separately for read-only display.
      // These are NOT in the editable `properties` store — no stale feedback loop.
      if (calculatedProperties) {
        const stringProps: Record<string, string> = {};
        for (const [k, v] of Object.entries(calculatedProperties)) {
          stringProps[k] = String(v);
        }
        setCalculatedProperties(stringProps);
      }
    } catch (err) {
      // Show error in all hooks
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      const errorResult = {
        logs: [],
        returnValue: undefined,
        error: errorMsg,
      };
      setHookResults({
        onRequestHeaders: errorResult,
        onRequestBody: errorResult,
        onResponseHeaders: errorResult,
        onResponseBody: errorResult,
      });
      setFinalResponse(null);
    }
  };

  return (
    <div className={styles.proxyWasmView}>
      <RequestPanel
        method={method}
        url={url}
        wasmLoaded={wasmPath !== null}
        onMethodChange={setMethod}
        onUrlChange={setUrl}
        onSend={handleSend}
        methods={CDN_METHODS}
        headers={requestHeaders}
        body={requestBody}
        onHeadersChange={setRequestHeaders}
        onBodyChange={setRequestBody}
        defaultHeaders={{
          "user-agent": {
            value:
              "Mozilla/5.0 (X11; Linux x86_64; rv:147.0) Gecko/20100101 Firefox/147.0",
            enabled: false,
            placeholder: "Browser user agent",
          },
          accept: {
            value:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            enabled: false,
            placeholder: "Browser accept types",
          },
          "accept-language": {
            value: "en-US,en;q=0.9",
            enabled: false,
            placeholder: "Browser languages",
          },
          "accept-encoding": {
            value: "gzip, deflate, br, zstd",
            enabled: false,
            placeholder: "Browser encodings",
          },
          host: {
            value: "",
            enabled: false,
            placeholder: "<Calculated from URL>",
          },
          "content-type": {
            value: "",
            enabled: false,
            placeholder: "<Calculated from body>",
          },
          Authorization: {
            value: "",
            enabled: false,
            placeholder: "Bearer <token>",
          },
          "x-debugger-status": {
            value: "",
            enabled: false,
            placeholder: "HTTP status code for built-in responder",
          },
          "x-debugger-content": {
            value: "",
            enabled: false,
            placeholder: "body-only | status-only for built-in responder",
          },
        }}
        headersLabel="Request Headers"
        bodyLabel="Request Body"
        headerKeyPlaceholder="Header name"
        headerValuePlaceholder="Header value"
      />

      <DotenvPanel
        enabled={dotenv.enabled}
        onToggle={setDotenvEnabled}
        path={dotenv.path}
        onPathChange={setDotenvPath}
        isExpanded={expandedPanels["dotenv"] ?? false}
        onExpandedChange={(expanded) => setPanelExpanded("dotenv", expanded)}
      />

      <ServerPropertiesPanel
        properties={properties}
        calculatedProperties={calculatedProperties}
        onPropertiesChange={setProperties}
      />

      <HookStagesPanel
        results={hookResults}
        hookCall={hookCall}
        logLevel={logLevel}
        onLogLevelChange={setLogLevel}
      />

      <ResponsePanel response={finalResponse} />
    </div>
  );
}
