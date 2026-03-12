import { ChangeEvent, RefObject } from "react";
import styles from "./RequestBar.module.css";

interface RequestBarProps {
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
}

const DEFAULT_METHODS = ["GET", "POST"];

export function RequestBar({
  method,
  url,
  wasmLoaded,
  onMethodChange,
  onUrlChange,
  onSend,
  methods = DEFAULT_METHODS,
  urlPrefix,
  urlPlaceholder = "Enter request URL (e.g., https://example.com/api/endpoint)",
  isExecuting = false,
  executingText = "Sending...",
  urlInputRef,
}: RequestBarProps) {
  const handleMethodChange = (e: ChangeEvent<HTMLSelectElement>) => {
    onMethodChange(e.target.value);
  };

  const handleUrlChange = (e: ChangeEvent<HTMLInputElement>) => {
    onUrlChange(e.target.value);
  };

  // If urlPrefix is provided, extract the path from the full URL
  const displayValue = urlPrefix && url.startsWith(urlPrefix)
    ? url.slice(urlPrefix.length)
    : url;

  return (
    <div className={styles.requestBar}>
      <div className={styles.urlInputContainer}>
        <select
          value={method}
          onChange={handleMethodChange}
          className={styles.methodSelect}
          disabled={isExecuting}
        >
          {methods.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        {urlPrefix ? (
          <>
            <span
              className={styles.urlPrefix}
              onClick={() => urlInputRef?.current?.focus()}
            >
              {urlPrefix}
            </span>
            <input
              ref={urlInputRef}
              type="text"
              value={displayValue}
              onChange={handleUrlChange}
              placeholder={urlPlaceholder}
              className={styles.urlInput}
              disabled={isExecuting}
            />
          </>
        ) : (
          <input
            ref={urlInputRef}
            type="text"
            value={url}
            onChange={handleUrlChange}
            placeholder={urlPlaceholder}
            className={styles.urlInput}
            disabled={isExecuting}
          />
        )}
      </div>
      <button
        onClick={onSend}
        disabled={!wasmLoaded || isExecuting}
        className={styles.sendButton}
      >
        {isExecuting ? (
          <>
            <span className={styles.spinner}></span>
            {executingText}
          </>
        ) : (
          "Send"
        )}
      </button>
    </div>
  );
}
