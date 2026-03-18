import { useEffect, useRef, useState } from "react";
import { Toggle } from "../Toggle";
import styles from "./DotenvPanel.module.css";

interface DotenvPanelProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  path: string | null;
  onPathChange: (path: string | null) => void;
}

const isVSCode = () => window !== window.top;

export function DotenvPanel({
  enabled,
  onToggle,
  path,
  onPathChange,
}: DotenvPanelProps) {
  const [isExpanded, setIsExpanded] = useState(enabled);
  const [resolvedRoot, setResolvedRoot] = useState<string | null>(null);
  const listenerRef = useRef<((e: MessageEvent) => void) | null>(null);

  // Sync expand state with toggle: on → expand, off → collapse
  useEffect(() => {
    setIsExpanded(enabled);
  }, [enabled]);

  // Request the resolved app root from the extension on mount
  useEffect(() => {
    if (!isVSCode()) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.command !== "appRootResult") return;
      window.removeEventListener("message", handler);
      const appRoot = event.data.appRoot ?? null;
      setResolvedRoot(appRoot);
      // If no explicit path is set, use the resolved root as the effective path
      // so it is captured when saving config (and the runner uses the correct --dotenv arg)
      if (appRoot && !path) {
        onPathChange(appRoot);
      }
    };
    window.addEventListener("message", handler);
    window.parent.postMessage({ command: "getAppRoot" }, "*");
    return () => window.removeEventListener("message", handler);
  }, []);

  // Clean up message listener on unmount
  useEffect(() => {
    return () => {
      if (listenerRef.current) {
        window.removeEventListener("message", listenerRef.current);
      }
    };
  }, []);

  const handleBrowse = () => {
    if (isVSCode()) {
      if (listenerRef.current) {
        window.removeEventListener("message", listenerRef.current);
      }
      const handler = (event: MessageEvent) => {
        if (event.data?.command !== "folderPickerResult") return;
        window.removeEventListener("message", handler);
        listenerRef.current = null;
        if (event.data.canceled) return;
        onPathChange(event.data.folderPath ?? null);
      };
      listenerRef.current = handler;
      window.addEventListener("message", handler);
      window.parent.postMessage({ command: "openFolderPicker" }, "*");
    }
  };

  const arrowClass = `${styles.arrow} ${isExpanded ? styles.expanded : ""}`;

  return (
    <div className={styles.panel}>
      <div
        className={styles.header}
        onClick={() => setIsExpanded((prev) => !prev)}
      >
        <h3 className={styles.title}>Dotenv</h3>
        <div className={styles.headerRight}>
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle checked={enabled} onChange={onToggle} compact={true} />
          </div>
          <div className={arrowClass} />
        </div>
      </div>

      {isExpanded && (
        <div className={styles.content}>
          <p className={styles.description}>
            Load runtime variables from dotenv path when enabled:
          </p>
          <div className={styles.pathRow}>
            <label className={styles.pathLabel}>Dotenv path:</label>
            {isVSCode() ? (
              <>
                <span className={styles.pathValue}>
                  {path ?? <em className={styles.defaultPath}>{resolvedRoot ?? "app root (default)"}</em>}
                </span>
                <button
                  className={styles.browseButton}
                  onClick={handleBrowse}
                  type="button"
                >
                  Browse…
                </button>
                {path && (
                  <button
                    className={styles.clearButton}
                    onClick={() => onPathChange(null)}
                    type="button"
                    title="Reset to app root"
                  >
                    ✕
                  </button>
                )}
              </>
            ) : (
              <>
                <input
                  className={styles.pathInput}
                  type="text"
                  value={path ?? ""}
                  onChange={(e) => onPathChange(e.target.value || null)}
                  placeholder="app root (default)"
                  spellCheck={false}
                />
                {path && (
                  <button
                    className={styles.clearButton}
                    onClick={() => onPathChange(null)}
                    type="button"
                    title="Reset to app root"
                  >
                    ✕
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
