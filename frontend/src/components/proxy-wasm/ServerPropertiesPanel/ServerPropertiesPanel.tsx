import { useEffect, useRef } from "react";
import { CollapsiblePanel } from "../../common/CollapsiblePanel";
import { PropertiesEditor } from "../PropertiesEditor";
import { Toggle } from "../../common/Toggle";
import styles from "./ServerPropertiesPanel.module.css";

interface ServerPropertiesPanelProps {
  properties: Record<string, string>;
  onPropertiesChange: (properties: Record<string, string>) => void;
  dotenvEnabled: boolean;
  onDotenvToggle: (enabled: boolean) => void;
  dotenvPath: string | null;
  onDotenvPathChange: (path: string | null) => void;
}

const isVSCode = () => window !== window.top;

export function ServerPropertiesPanel({
  properties,
  onPropertiesChange,
  dotenvEnabled,
  onDotenvToggle,
  dotenvPath,
  onDotenvPathChange,
}: ServerPropertiesPanelProps) {
  const listenerRef = useRef<((e: MessageEvent) => void) | null>(null);

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
      // Remove any previous listener before adding a new one
      if (listenerRef.current) {
        window.removeEventListener("message", listenerRef.current);
      }
      const handler = (event: MessageEvent) => {
        if (event.data?.command !== "folderPickerResult") return;
        window.removeEventListener("message", handler);
        listenerRef.current = null;
        if (event.data.canceled) return;
        onDotenvPathChange(event.data.folderPath ?? null);
      };
      listenerRef.current = handler;
      window.addEventListener("message", handler);
      window.parent.postMessage({ command: "openFolderPicker" }, "*");
    }
  };

  return (
    <CollapsiblePanel
      title="Server Properties"
      defaultExpanded={false}
      headerExtra={
        <div
          className={styles.toggleContainerRight}
          onClick={(e) => e.stopPropagation()} // Prevent collapse when clicking toggle
        >
          <Toggle
            checked={dotenvEnabled}
            onChange={onDotenvToggle}
            label="Load .env files"
            compact={true}
          />
        </div>
      }
    >
      <PropertiesEditor value={properties} onChange={onPropertiesChange} />
      {dotenvEnabled && (
        <div className={styles.dotenvNotice}>
          <strong>Dotenv enabled:</strong> Secrets from .env.secrets and
          dictionary values from .env.variables are active.
          <div className={styles.dotenvPathRow}>
            <label className={styles.dotenvPathLabel}>.env directory:</label>
            {isVSCode() ? (
              <>
                <span className={styles.dotenvPathValue}>
                  {dotenvPath ?? <em>workspace root (default)</em>}
                </span>
                <button
                  className={styles.dotenvBrowseButton}
                  onClick={handleBrowse}
                  type="button"
                >
                  Browse…
                </button>
                {dotenvPath && (
                  <button
                    className={styles.dotenvClearButton}
                    onClick={() => onDotenvPathChange(null)}
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
                  className={styles.dotenvPathInput}
                  type="text"
                  value={dotenvPath ?? ""}
                  onChange={(e) => onDotenvPathChange(e.target.value || null)}
                  placeholder="Default: workspace root"
                  spellCheck={false}
                />
                {dotenvPath && (
                  <button
                    className={styles.dotenvClearButton}
                    onClick={() => onDotenvPathChange(null)}
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
    </CollapsiblePanel>
  );
}
