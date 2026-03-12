import { useState } from "react";
import { DictionaryInput } from "../../DictionaryInput";
import styles from "./RequestInfoTabs.module.css";

interface DefaultValue {
  value: string;
  enabled?: boolean;
  placeholder?: string;
}

interface RequestInfoTabsProps {
  headers: Record<string, string>;
  body: string;
  onHeadersChange: (headers: Record<string, string>) => void;
  onBodyChange: (body: string) => void;
  defaultHeaders?: Record<string, string | DefaultValue>;
  headersLabel?: string;
  bodyLabel?: string;
  bodyRows?: number;
  bodyPlaceholder?: string;
  headerKeyPlaceholder?: string;
  headerValuePlaceholder?: string;
}

type Tab = "headers" | "body";

export function RequestInfoTabs({
  headers,
  body,
  onHeadersChange,
  onBodyChange,
  defaultHeaders,
  headersLabel = "Request Headers",
  bodyLabel = "Request Body",
  bodyRows = 8,
  bodyPlaceholder = '{"key": "value"}',
  headerKeyPlaceholder = "Header name (e.g., Content-Type)",
  headerValuePlaceholder = "Header value (e.g., application/json)",
}: RequestInfoTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>("headers");

  return (
    <div className={styles.requestInfoTabs}>
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === "headers" ? styles.active : ""}`}
          onClick={() => setActiveTab("headers")}
        >
          Headers
        </button>
        <button
          className={`${styles.tab} ${activeTab === "body" ? styles.active : ""}`}
          onClick={() => setActiveTab("body")}
        >
          Body
        </button>
      </div>

      <div className={styles.tabContent}>
        {activeTab === "headers" && (
          <div className={styles.headersTab}>
            <label>{headersLabel}:</label>
            <DictionaryInput
              value={headers}
              onChange={onHeadersChange}
              keyPlaceholder={headerKeyPlaceholder}
              valuePlaceholder={headerValuePlaceholder}
              defaultValues={defaultHeaders}
            />
          </div>
        )}

        {activeTab === "body" && (
          <div className={styles.bodyTab}>
            <label>{bodyLabel}:</label>
            <textarea
              className={styles.bodyTextarea}
              rows={bodyRows}
              value={body}
              onChange={(e) => onBodyChange(e.target.value)}
              placeholder={bodyPlaceholder}
            />
          </div>
        )}
      </div>
    </div>
  );
}
