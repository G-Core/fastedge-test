import { RefObject, ReactNode } from "react";
import { RequestBar } from "./RequestBar";
import { CollapsiblePanel } from "../CollapsiblePanel";
import { RequestInfoTabs } from "./RequestInfoTabs";
import styles from "./RequestPanel.module.css";

interface DefaultValue {
  value: string;
  enabled?: boolean;
  placeholder?: string;
}

interface RequestPanelProps {
  // RequestBar props
  method: string;
  url: string;
  wasmLoaded: boolean;
  onMethodChange: (method: string) => void;
  onUrlChange: (url: string) => void;
  onSend: () => void;
  methods?: string[];
  urlPrefix?: string;
  urlPlaceholder?: string;
  isExecuting?: boolean;
  executingText?: string;
  urlInputRef?: RefObject<HTMLInputElement | null>;

  // RequestInfoTabs props
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

  // Additional content (e.g., hint message)
  additionalContent?: ReactNode;
}

export function RequestPanel({
  // RequestBar props
  method,
  url,
  wasmLoaded,
  onMethodChange,
  onUrlChange,
  onSend,
  methods,
  urlPrefix,
  urlPlaceholder,
  isExecuting,
  executingText,
  urlInputRef,

  // RequestInfoTabs props
  headers,
  body,
  onHeadersChange,
  onBodyChange,
  defaultHeaders,
  headersLabel = "Request Headers",
  bodyLabel = "Request Body",
  bodyRows = 8,
  bodyPlaceholder = '{"key": "value"}',
  headerKeyPlaceholder = "Header name",
  headerValuePlaceholder = "Header value",

  // Additional content
  additionalContent,
}: RequestPanelProps) {
  return (
    <div className={styles.requestPanel}>
      <RequestBar
        method={method}
        url={url}
        wasmLoaded={wasmLoaded}
        onMethodChange={onMethodChange}
        onUrlChange={onUrlChange}
        onSend={onSend}
        methods={methods}
        urlPrefix={urlPrefix}
        urlPlaceholder={urlPlaceholder}
        isExecuting={isExecuting}
        executingText={executingText}
        urlInputRef={urlInputRef}
      />

      {additionalContent}

      <CollapsiblePanel title="Request" defaultExpanded={true}>
        <RequestInfoTabs
          headers={headers}
          body={body}
          onHeadersChange={onHeadersChange}
          onBodyChange={onBodyChange}
          defaultHeaders={defaultHeaders}
          headersLabel={headersLabel}
          bodyLabel={bodyLabel}
          bodyRows={bodyRows}
          bodyPlaceholder={bodyPlaceholder}
          headerKeyPlaceholder={headerKeyPlaceholder}
          headerValuePlaceholder={headerValuePlaceholder}
        />
      </CollapsiblePanel>
    </div>
  );
}
