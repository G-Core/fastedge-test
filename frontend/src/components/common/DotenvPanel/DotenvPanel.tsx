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
  const listenerRef = useRef<((e: MessageEvent) => void) | null>(null);

  // Sync expand state with toggle: on → expand, off → collapse
  useEffect(() => {
    setIsExpanded(enabled);
  }, [enabled]);

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
                  {path ?? <em>workspace root (default)</em>}
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
                    title="Reset to workspace root"
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
                  placeholder="workspace root (default)"
                  spellCheck={false}
                />
                {path && (
                  <button
                    className={styles.clearButton}
                    onClick={() => onPathChange(null)}
                    type="button"
                    title="Reset to workspace root"
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
