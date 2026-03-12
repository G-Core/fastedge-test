import { useState } from "react";
import { HookCall, HookResult, LogEntry } from "../../types";
import { CollapsiblePanel } from "../../common/CollapsiblePanel";
import { LogLevelSelector } from "../../common/LogLevelSelector";
import { JsonDisplay } from "../../common/JsonDisplay";
import styles from "./HookStagesPanel.module.css";

interface HookStagesPanelProps {
  results: Record<string, HookResult>;
  hookCall: HookCall;
  logLevel: number;
  onLogLevelChange: (level: number) => void;
}

const HOOKS = [
  "onRequestHeaders",
  "onRequestBody",
  "onResponseHeaders",
  "onResponseBody",
];

type SubView = "logs" | "inputs" | "outputs";

export function HookStagesPanel({
  results,
  hookCall,
  logLevel,
  onLogLevelChange,
}: HookStagesPanelProps) {
  const [activeHook, setActiveHook] = useState<string>("onRequestHeaders");
  const [activeSubView, setActiveSubView] = useState<SubView>("logs");

  /**
   * Check if the content-type indicates JSON
   */
  const isJsonContent = (headers: Record<string, string>): boolean => {
    const contentType =
      Object.entries(headers).find(
        ([key]) => key.toLowerCase() === "content-type",
      )?.[1] || "";
    return contentType.includes("application/json");
  };

  /**
   * Parse body if it's JSON, otherwise return as-is
   */
  const parseBodyIfJson = (
    body: string,
    headers: Record<string, string>,
  ): unknown => {
    if (isJsonContent(headers)) {
      try {
        return JSON.parse(body);
      } catch {
        // If parsing fails, return as string
        return body;
      }
    }
    return body;
  };

  const getInputsForHook = (hook: string) => {
    const result = results[hook];

    // If we have server-returned INPUT data, use it. Otherwise fall back to hookCall (pre-execution state)
    if (result?.input) {
      switch (hook) {
        case "onRequestHeaders":
          return {
            headers: result.input.request.headers,
            metadata:
              "Request headers as received by this hook on the server (BEFORE modification)",
          };
        case "onRequestBody":
          return {
            body: result.input.request.body,
            headers: result.input.request.headers,
            metadata:
              "Request body and headers as received by this hook on the server (BEFORE modification)",
          };
        case "onResponseHeaders":
          return {
            headers: result.input.response.headers,
            requestHeaders: result.input.request.headers,
            metadata:
              "Response headers as received by this hook (with modified request headers from previous hooks)",
          };
        case "onResponseBody":
          return {
            body: result.input.response.body,
            headers: result.input.response.headers,
            requestHeaders: result.input.request.headers,
            metadata:
              "Response body and headers as received by this hook on the server",
          };
        default:
          return { metadata: "No input data" };
      }
    }

    // Fallback to hookCall data (before execution)
    switch (hook) {
      case "onRequestHeaders":
        return {
          headers: hookCall.request_headers || {},
          metadata: "(Not yet executed - showing initial state)",
        };
      case "onRequestBody":
        return {
          body: hookCall.request_body || "",
          headers: hookCall.request_headers || {},
          metadata: "(Not yet executed - showing initial state)",
        };
      case "onResponseHeaders":
        return {
          headers: hookCall.response_headers || {},
          metadata: "(Not yet executed - showing initial state)",
        };
      case "onResponseBody":
        return {
          body: hookCall.response_body || "",
          headers: hookCall.response_headers || {},
          metadata: "(Not yet executed - showing initial state)",
        };
      default:
        return { metadata: "No input data" };
    }
  };

  const renderInputs = (hook: string) => {
    const inputs = getInputsForHook(hook);
    const result = results[hook];

    return (
      <div className={styles.hookInputs}>
        <p className={styles.metadata}>{inputs.metadata}</p>

        {"requestHeaders" in inputs && (
          <div className={styles.section}>
            <JsonDisplay
              data={inputs.requestHeaders}
              title="Request Headers (Modified by Previous Hooks)"
            />
          </div>
        )}

        {"headers" in inputs && (
          <div className={styles.section}>
            <JsonDisplay
              data={inputs.headers}
              title={
                hook.includes("Response")
                  ? "Response Headers"
                  : "Request Headers"
              }
            />
          </div>
        )}

        {"body" in inputs && inputs.body && (
          <div className={styles.section}>
            <JsonDisplay
              data={parseBodyIfJson(inputs.body, inputs.headers || {})}
              title={
                hook.includes("Response") ? "Response Body" : "Request Body"
              }
            />
          </div>
        )}

        {result?.input?.properties &&
          Object.keys(result.input.properties).length > 0 && (
            <div>
              <JsonDisplay
                data={result.input.properties}
                title="Properties (Before Hook Execution)"
              />
            </div>
          )}
      </div>
    );
  };

  const renderOutputs = (hook: string) => {
    const result = results[hook];

    if (!result?.output) {
      return (
        <div className={styles.noData}>
          No output yet. Click "Send" to execute this hook.
        </div>
      );
    }

    const outputs = result.output;
    const inputs = result.input;

    return (
      <div className={styles.hookOutputs}>
        <p className={styles.metadata}>
          Data produced by this hook AFTER execution (modifications made by
          WASM)
        </p>

        {hook.includes("Request") && (
          <div className={styles.section}>
            <JsonDisplay
              data={outputs.request.headers}
              compareWith={inputs?.request.headers}
              title="Request Headers (Modified)"
            />
          </div>
        )}

        {hook === "onRequestBody" && outputs.request.body && (
          <div className={styles.section}>
            <JsonDisplay
              data={parseBodyIfJson(
                outputs.request.body,
                outputs.request.headers,
              )}
              compareWith={
                inputs?.request.body
                  ? parseBodyIfJson(inputs.request.body, inputs.request.headers)
                  : undefined
              }
              title="Request Body (Modified)"
            />
          </div>
        )}

        {hook.includes("Response") && (
          <>
            <div className={styles.section}>
              <JsonDisplay
                data={outputs.response.headers}
                compareWith={inputs?.response.headers}
                title="Response Headers (Modified)"
              />
            </div>

            {hook === "onResponseBody" && outputs.response.body && (
              <div className={styles.section}>
                <JsonDisplay
                  data={parseBodyIfJson(
                    outputs.response.body,
                    outputs.response.headers,
                  )}
                  compareWith={
                    inputs?.response.body
                      ? parseBodyIfJson(
                          inputs.response.body,
                          inputs.response.headers,
                        )
                      : undefined
                  }
                  title="Response Body (Modified)"
                />
              </div>
            )}
          </>
        )}

        {result?.output?.properties &&
          Object.keys(result.output.properties).length > 0 && (
            <div className={styles.section}>
              <JsonDisplay
                data={result.output.properties}
                compareWith={result.input?.properties}
                title="Properties (After Hook Execution)"
              />
            </div>
          )}
      </div>
    );
  };

  /**
   * Filter logs by selected log level
   * Only show logs with level >= selected level
   */
  const filterLogs = (logs: LogEntry[], minLevel: number): LogEntry[] => {
    return logs.filter((log) => log.level >= minLevel);
  };

  /**
   * Get log level name for display
   */
  const getLogLevelName = (level: number): string => {
    const levels = ["TRACE", "DEBUG", "INFO", "WARN", "ERROR", "CRITICAL"];
    return levels[level] || "UNKNOWN";
  };

  const renderLogs = (hook: string) => {
    const result = results[hook];

    if (!result) {
      return (
        <div className={styles.noData}>
          No logs yet. Click "Send" to execute this hook.
        </div>
      );
    }

    // Filter logs based on selected log level
    const filteredLogs =
      result.logs && result.logs.length > 0
        ? filterLogs(result.logs, logLevel)
        : [];

    const totalLogs = result.logs?.length || 0;
    const displayedLogs = filteredLogs.length;

    return (
      <div className={styles.hookLogs}>
        {result.error && (
          <div className={styles.error}>Error: {result.error}</div>
        )}

        {result.returnValue !== undefined && (
          <div className={styles.returnValue}>
            <strong>Return Code:</strong> {result.returnValue}
          </div>
        )}

        {totalLogs > 0 ? (
          <div>
            <div className={styles.outputHeader}>
              <h4 className={styles.outputTitle}>Output</h4>
              {displayedLogs < totalLogs && (
                <span className={styles.filterInfo}>
                  Showing {displayedLogs} of {totalLogs} logs (filtered by
                  level)
                </span>
              )}
            </div>
            <pre className={styles.logsContainer}>
              {filteredLogs.length > 0 ? (
                filteredLogs.map((log, idx) => {
                  // Detect property access violations
                  const isAccessViolation = log.message.includes('[property access denied]');
                  const logClasses = isAccessViolation
                    ? `${styles.logEntry} ${styles.accessViolation}`
                    : styles.logEntry;

                  return (
                    <div key={idx} className={logClasses}>
                      {isAccessViolation && (
                        <span className={styles.violationIcon} title="Property Access Violation">
                          🚫
                        </span>
                      )}
                      <span className={styles.logLevel}>
                        [{getLogLevelName(log.level)}]
                      </span>
                      {log.message}
                    </div>
                  );
                })
              ) : (
                <div className={styles.noLogs}>
                  No logs at this level. Lower the log level to see more output.
                </div>
              )}
            </pre>
          </div>
        ) : (
          <div className={styles.noLogs}>
            No logs produced by this hook.
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={styles.hookStagesPanel}>
      <CollapsiblePanel title="Logging" defaultExpanded={false}>
        <div className={styles.stagesHeader}>
          <div className={styles.tabs}>
            {HOOKS.map((hook) => (
              <button
                key={hook}
                className={`${styles.tab} ${activeHook === hook ? styles.active : ""}`}
                onClick={() => setActiveHook(hook)}
              >
                {hook}
              </button>
            ))}
          </div>

          <LogLevelSelector
            logLevel={logLevel}
            onLogLevelChange={onLogLevelChange}
          />
        </div>

        <div className={styles.subViewTabs}>
          <button
            className={`${styles.subTab} ${activeSubView === "logs" ? styles.active : ""}`}
            onClick={() => setActiveSubView("logs")}
          >
            Logs
          </button>
          <button
            className={`${styles.subTab} ${activeSubView === "inputs" ? styles.active : ""}`}
            onClick={() => setActiveSubView("inputs")}
          >
            Inputs
          </button>
          <button
            className={`${styles.subTab} ${activeSubView === "outputs" ? styles.active : ""}`}
            onClick={() => setActiveSubView("outputs")}
          >
            Outputs
          </button>
        </div>

        <div className={styles.stageContent}>
          {activeSubView === "logs" && renderLogs(activeHook)}
          {activeSubView === "inputs" && renderInputs(activeHook)}
          {activeSubView === "outputs" && renderOutputs(activeHook)}
        </div>
      </CollapsiblePanel>
    </div>
  );
}
