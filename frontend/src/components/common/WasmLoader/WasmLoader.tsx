import { ChangeEvent, useState, useEffect, useRef } from "react";
import styles from "./WasmLoader.module.css";
import { formatFileSize } from "../../../utils/filePath";

type LoaderTab = 'path' | 'upload';

interface WasmLoaderProps {
  onFileLoad: (file: File) => void;
  onPathLoad?: (path: string) => void;
  loading: boolean;
  // Loading metadata (optional)
  loadingMode?: 'path' | 'buffer' | null;
  loadTime?: number | null;
  fileSize?: number | null;
  fileName?: string | null;
  // Default tab based on environment
  defaultTab?: LoaderTab;
  // Current WASM path from global store (for syncing input field)
  wasmPath?: string | null;
}

export function WasmLoader({
  onFileLoad,
  onPathLoad,
  loading,
  loadingMode,
  loadTime,
  fileSize,
  fileName,
  defaultTab = 'upload',
  wasmPath: globalWasmPath,
}: WasmLoaderProps) {
  const [wasmPath, setWasmPath] = useState("");
  const [activeTab, setActiveTab] = useState<LoaderTab>(defaultTab);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Update active tab when defaultTab changes (environment detection completes)
  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  // Update active tab based on loading mode (shows which method was actually used)
  useEffect(() => {
    if (loadingMode === 'buffer') {
      // Buffer mode = file upload or drag & drop
      setActiveTab('upload');
    } else if (loadingMode === 'path') {
      // Path mode = file path loading
      setActiveTab('path');
    }
  }, [loadingMode]);

  // Sync local input field with global store's wasmPath
  // Only sync when using path mode (not buffer mode)
  useEffect(() => {
    if (loadingMode === 'path' && globalWasmPath && globalWasmPath !== wasmPath) {
      setWasmPath(globalWasmPath);
    } else if (loadingMode === 'buffer') {
      // Clear path input when using buffer mode
      setWasmPath('');
    }
  }, [globalWasmPath, loadingMode]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileLoad(file);
    }
  };

  const handlePathLoad = () => {
    if (wasmPath.trim() && onPathLoad) {
      onPathLoad(wasmPath.trim());
    }
  };

  const handlePathKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && wasmPath.trim() && onPathLoad) {
      handlePathLoad();
    }
  };

  // Format loading mode for display
  const getLoadingModeIcon = () => {
    if (!loadingMode) return null;
    return loadingMode === 'path' ? '📁' : '💾';
  };

  const getLoadingModeText = () => {
    if (!loadingMode) return null;
    return loadingMode === 'path' ? 'Path-based' : 'Buffer-based';
  };

  const getLoadingModeTitle = () => {
    if (!loadingMode) return '';
    if (loadingMode === 'path') {
      return 'Optimized path-based loading (70-95% faster)';
    }
    return 'Standard buffer-based loading';
  };

  return (
    <section className={styles.wasmLoader}>
      <div className={styles.header}>
        <h2>Load WASM Binary</h2>
      </div>

      {/* Tabs */}
      {onPathLoad && (
        <div className={styles.tabs}>
          <div className={styles.tabButtons}>
            <button
              className={`${styles.tab} ${activeTab === 'path' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('path')}
              disabled={loading}
            >
              <span className={styles.tabIcon}>📁</span>
              <span>File Path</span>
            </button>
            <button
              className={`${styles.tab} ${activeTab === 'upload' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('upload')}
              disabled={loading}
            >
              <span className={styles.tabIcon}>📤</span>
              <span>Upload File</span>
            </button>
          </div>

          {/* Show loaded WASM info in tabs bar */}
          {!loading && fileName && loadingMode && (
            <div className={styles.tabInfo} title={getLoadingModeTitle()}>
              <span className={styles.tabInfoIcon}>{getLoadingModeIcon()}</span>
              <span className={styles.tabInfoText}>{getLoadingModeText()}</span>
              {loadTime !== null && loadTime !== undefined && (
                <span className={styles.tabInfoTime}>• {loadTime.toFixed(1)}ms</span>
              )}
              {fileSize && (
                <span className={styles.tabInfoSize}>• ({formatFileSize(fileSize)})</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab Content */}
      <div className={styles.tabContent}>
        {/* Path Tab */}
        {onPathLoad && activeTab === 'path' && (
          <div className={styles.pathPanel}>
            <div className={styles.panelDescription}>
              Load WASM directly from filesystem path (faster, no upload needed)
            </div>
            <div className={styles.pathInputGroup}>
              <input
                type="text"
                className={styles.pathInput}
                placeholder="<workspace>/.fastedge/bin/debugger.wasm"
                value={wasmPath}
                onChange={(e) => setWasmPath(e.target.value)}
                onKeyDown={handlePathKeyDown}
                disabled={loading}
              />
              <button
                onClick={handlePathLoad}
                disabled={loading || !wasmPath.trim()}
                className={styles.pathButton}
              >
                Load from Path
              </button>
            </div>
          </div>
        )}

        {/* Upload Tab */}
        {activeTab === 'upload' && (
          <div className={styles.uploadPanel}>
            <div className={styles.panelDescription}>
              Upload a WASM binary file from your computer
            </div>
            <div className={styles.fileInputWrapper}>
              {/* Custom "Choose File" button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className={styles.chooseFileButton}
              >
                Choose File
              </button>

              {/* Hidden native file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".wasm"
                onChange={handleFileChange}
                disabled={loading}
                className={styles.hiddenFileInput}
              />

              {/* Inline file display - shown when file is loaded */}
              {!loading && loadingMode === 'buffer' && fileName ? (
                <div className={styles.selectedFile}>
                  <span className={styles.selectedFileIcon}>✓</span>
                  <span className={styles.selectedFileName}>{fileName}</span>
                  {fileSize && (
                    <span className={styles.selectedFileSize}>
                      ({formatFileSize(fileSize)})
                    </span>
                  )}
                </div>
              ) : (
                <span className={styles.noFileChosen}>No file chosen</span>
              )}
            </div>
          </div>
        )}
      </div>

      {loading && (
        <span className={styles.loadingIndicator}> Loading...</span>
      )}
    </section>
  );
}
