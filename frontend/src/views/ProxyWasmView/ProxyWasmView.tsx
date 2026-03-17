import { RequestPanel } from "../../components/common/RequestPanel";
import { ServerPropertiesPanel } from "../../components/proxy-wasm/ServerPropertiesPanel";
import { HookStagesPanel } from "../../components/proxy-wasm/HookStagesPanel";
import { ResponsePanel } from "../../components/common/ResponsePanel";
import { useAppStore } from "../../stores";
import { applyDefaultContentType } from "../../utils/contentType";
import styles from "./ProxyWasmView.module.css";

export function ProxyWasmView() {
  // Get state and actions from stores
  const {
    // Request state
    method,
    url,
    requestHeaders,
    requestBody,
    responseHeaders,
    responseBody,
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
    dotenvEnabled,
    dotenvPath,
    logLevel,
    setProperties,
    mergeProperties,
    setDotenvEnabled,
    setDotenvPath,
    setLogLevel,

    // WASM state
    wasmPath,
  } = useAppStore();

  const hookCall = {
    request_headers: requestHeaders,
    request_body: requestBody,
    request_trailers: {},
    response_headers: responseHeaders,
    response_body: responseBody,
    response_trailers: {},
    properties,
  };

  const handleSend = async () => {
    try {
      const finalHeaders = applyDefaultContentType(
        requestHeaders,
        requestBody,
      );

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

      // Merge calculated properties into the UI
      console.log(
        "[API] Received calculatedProperties:",
        calculatedProperties,
      );
      if (calculatedProperties) {
        console.log("[API] Updating properties. Previous:", properties);
        const propsToMerge: Record<string, string> = {};
        // Always update calculated properties - they change with each request
        for (const [key, value] of Object.entries(calculatedProperties)) {
          propsToMerge[key] = String(value);
        }
        console.log("[API] Merging properties:", propsToMerge);
        mergeProperties(propsToMerge);
      }
    } catch (err) {
      // Show error in all hooks
      const errorMsg =
        err instanceof Error ? err.message : "Unknown error";
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
        }}
        headersLabel="Request Headers"
        bodyLabel="Request Body"
        headerKeyPlaceholder="Header name"
        headerValuePlaceholder="Header value"
      />

      <ServerPropertiesPanel
        properties={properties}
        onPropertiesChange={setProperties}
        dotenvEnabled={dotenvEnabled}
        onDotenvToggle={async (enabled) => {
          setDotenvEnabled(enabled);
          if (wasmPath !== null) {
            const { applyDotenv } = await import("../../api");
            await applyDotenv(enabled, dotenvPath);
          }
        }}
        dotenvPath={dotenvPath}
        onDotenvPathChange={async (path) => {
          setDotenvPath(path);
          if (wasmPath !== null && dotenvEnabled) {
            const { applyDotenv } = await import("../../api");
            await applyDotenv(dotenvEnabled, path);
          }
        }}
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
