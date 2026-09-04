import { useState, useEffect } from "react";
import { TestConfig, saveConfigAs, showSaveDialog } from "../../api";
import { JsonEditorTab } from "./JsonEditorTab";
import styles from "./ConfigEditorModal.module.css";

interface ConfigEditorModalProps {
  initialConfig: TestConfig;
  onClose: () => void;
}

export function ConfigEditorModal({
  initialConfig,
  onClose,
}: ConfigEditorModalProps) {
  const [isSaving, setIsSaving] = useState(false);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const handleSave = async () => {
    try {
      setIsSaving(true);

      const suggestedName = "fastedge-config.test.json";

      // Strategy 0: VSCode webview (running inside an iframe) — send the config
      // to the extension and let it write the file via the native save dialog.
      // The server save-as route is not used; the extension writes directly.
      if (window !== window.top) {
        const configJson = JSON.stringify(initialConfig, null, 2);
        const result = await new Promise<{ path: string | null; saved: boolean }>((resolve) => {
          const handleResult = (event: MessageEvent) => {
            if (event.source !== window.parent) return;
            if (event.data?.type !== "savePickerResult") return;
            window.removeEventListener("message", handleResult);
            resolve({ path: event.data.path ?? null, saved: !!event.data.saved });
          };
          window.addEventListener("message", handleResult);
          window.parent.postMessage({ type: "openSavePicker", config: configJson }, "*");
        });

        if (!result.saved) {
          setIsSaving(false);
          return;
        }

        alert(`✅ Config saved to: ${result.path}`);
        onClose();
        return;
      }

      // Strategy 1: Try File System Access API (modern browsers)
      const hasFileSystemAPI = "showSaveFilePicker" in window;

      if (hasFileSystemAPI) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName,
            types: [
              {
                description: "JSON Config File",
                accept: { "application/json": [".json"] },
              },
            ],
          });

          const writable = await handle.createWritable();
          await writable.write(JSON.stringify(initialConfig, null, 2));
          await writable.close();

          alert(`✅ Config saved to: ${handle.name}`);
          onClose();
          return;
        } catch (error: any) {
          if (error.name === "AbortError") {
            // User cancelled
            setIsSaving(false);
            return;
          }
          // Fall through to next strategy
        }
      }

      // Strategy 2: Try backend Electron dialog (VS Code embedded mode)
      try {
        const dialogResult = await showSaveDialog(suggestedName);

        if (dialogResult.canceled) {
          setIsSaving(false);
          return;
        }

        if (dialogResult.filePath) {
          const result = await saveConfigAs(initialConfig, dialogResult.filePath);
          alert(`✅ Config saved to: ${result.savedPath}`);
          onClose();
          return;
        }
      } catch (error) {
        // Fall through to next strategy
      }

      // Strategy 3: Fallback — trigger a browser download. Works in all browsers
      // (Firefox, Safari) that don't support showSaveFilePicker. The file lands
      // in the browser's default downloads folder.
      const blob = new Blob([JSON.stringify(initialConfig, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = suggestedName;
      a.click();
      URL.revokeObjectURL(url);
      onClose();
      return;
    } catch (error) {
      console.error("Save error:", error);
      const msg = error instanceof Error ? error.message : "Unknown error";
      alert(`❌ Failed to save: ${msg}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle backdrop click to close
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className={styles.backdrop} onClick={handleBackdropClick}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2>Save Configuration</h2>
          <button
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className={styles.content}>
          <JsonEditorTab config={initialConfig} />
        </div>

        <div className={styles.footer}>
          <button onClick={onClose} className="secondary">
            Cancel
          </button>
          <button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "💾 Save to File"}
          </button>
        </div>
      </div>
    </div>
  );
}
