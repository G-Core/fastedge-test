import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../../../stores';
import { ConfigEditorModal } from '../../ConfigEditorModal';
import type { TestConfig } from '../../../api';
import styles from './ConfigButtons.module.css';

export function ConfigButtons() {
  const { loadFromConfig, exportConfig, loadWasm } = useAppStore();
  const [showConfigEditor, setShowConfigEditor] = useState(false);
  const [configEditorInitial, setConfigEditorInitial] = useState<TestConfig | null>(null);

  // Shared handler for filePickerResult messages (from button click OR context menu)
  const handleFilePickerResult = useCallback((event: MessageEvent) => {
    // Only accept messages from the parent frame (VSCode webview bridge)
    if (event.source !== window.parent) return;
    if (event.data?.command !== 'filePickerResult') return;
    if (event.data.canceled) return;
    try {
      const config: TestConfig = JSON.parse(event.data.content);

      // Resolve relative dotenv.path against the config file's directory.
      // Use URL API to normalize away . and .. segments (no Node path in browser).
      if (config.dotenv?.path && event.data.configDir && !config.dotenv.path.startsWith('/')) {
        config.dotenv.path = new URL(
          config.dotenv.path,
          `file://${event.data.configDir}/`,
        ).pathname;
      }

      loadFromConfig(config);

      if (config.wasm?.path) {
        const configDotenvEnabled = config.dotenv?.enabled ?? false;
        const configDotenvPath = config.dotenv?.path ?? null;
        loadWasm(config.wasm.path, configDotenvEnabled, configDotenvPath)
          .then(() => alert(`✅ Configuration loaded from ${event.data.fileName}\n🚀 WASM auto-loaded: ${config.wasm.path}`))
          .catch((wasmError: unknown) => {
            const wasmMsg = wasmError instanceof Error ? wasmError.message : 'Unknown error';
            alert(`✅ Configuration loaded from ${event.data.fileName}\n⚠️ Failed to auto-load WASM: ${wasmMsg}`);
          });
      } else {
        alert(`✅ Configuration loaded from ${event.data.fileName}!`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      alert(`❌ Failed to load config: ${msg}`);
    }
  }, [loadFromConfig, loadWasm]);

  // Persistent listener so configs sent from the extension context menu
  // (before the user clicks "Load Config") are handled immediately.
  useEffect(() => {
    if (window === window.top) return; // Only in VSCode iframe
    window.addEventListener('message', handleFilePickerResult);
    return () => window.removeEventListener('message', handleFilePickerResult);
  }, [handleFilePickerResult]);

  const handleLoadConfig = () => {
    // In VSCode webview (running inside an iframe), delegate to the extension's
    // native file picker so it can open at the app root directory.
    // The persistent useEffect listener above handles the filePickerResult response.
    if (window !== window.top) {
      window.parent.postMessage({ command: 'openFilePicker' }, '*');
      return;
    }

    // Standalone browser: use native file input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
      try {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        const text = await file.text();
        const config: TestConfig = JSON.parse(text);

        // Warn about relative dotenv path — browser file picker hides the full
        // file path, so relative paths will fall back to the server workspace root.
        if (config.dotenv?.path && !config.dotenv.path.startsWith('/')) {
          console.warn(`Config contains relative dotenv path "${config.dotenv.path}" — will resolve against server workspace root, not the config file location.`);
        }

        loadFromConfig(config);

        // Auto-load WASM if path is specified
        if (config.wasm?.path) {
          try {
            const configDotenvEnabled = config.dotenv?.enabled ?? false;
            const configDotenvPath = config.dotenv?.path ?? null;
            await loadWasm(config.wasm.path, configDotenvEnabled, configDotenvPath);
            alert(`✅ Configuration loaded from ${file.name}\n🚀 WASM auto-loaded: ${config.wasm.path}`);
          } catch (wasmError) {
            const wasmMsg = wasmError instanceof Error ? wasmError.message : 'Unknown error';
            alert(`✅ Configuration loaded from ${file.name}\n⚠️ Failed to auto-load WASM: ${wasmMsg}`);
          }
        } else {
          alert(`✅ Configuration loaded from ${file.name}!`);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        alert(`❌ Failed to load config: ${msg}`);
      }
    };

    input.click();
  };

  const handleSaveConfig = () => {
    const config = exportConfig();
    setConfigEditorInitial(config);
    setShowConfigEditor(true);
  };

  return (
    <>
      <div className={styles.configButtons}>
        <button onClick={handleLoadConfig} className="secondary">
          📥 Load Config
        </button>
        <button onClick={handleSaveConfig} className="secondary">
          💾 Save Config
        </button>
      </div>

      {/* Config Editor Modal */}
      {showConfigEditor && configEditorInitial && (
        <ConfigEditorModal
          initialConfig={configEditorInitial}
          onClose={() => setShowConfigEditor(false)}
        />
      )}
    </>
  );
}
