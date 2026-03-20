import { useState, useCallback, DragEvent, ReactNode } from 'react';
import styles from './DragDropZone.module.css';

interface DragDropZoneProps {
  onWasmDrop: (fileOrPath: File | string) => void;
  onConfigDrop: (file: File) => void;
  children: ReactNode;
}

type FileType = 'wasm' | 'json' | 'unknown';

/**
 * Detect file type from filename
 */
function detectFileType(filename: string): FileType {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.wasm')) return 'wasm';
  if (lower.endsWith('.json')) return 'json';
  return 'unknown';
}

export function DragDropZone({ onWasmDrop, onConfigDrop, children }: DragDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragFileType, setDragFileType] = useState<FileType>('unknown');

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Check if dragging files
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);

      // Try to detect file type from items
      const items = e.dataTransfer.items;
      if (items.length > 0) {
        const item = items[0];
        if (item.kind === 'file') {
          // Try to get filename from type or other metadata
          // Note: File name not always available in dragenter
          setDragFileType('unknown');
        }
      }
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Required to allow drop
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Only hide overlay when leaving the drop zone entirely
    if (e.currentTarget === e.target) {
      setIsDragging(false);
      setDragFileType('unknown');
    }
  }, []);

  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setIsDragging(false);
    setDragFileType('unknown');

    // Get the first file
    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    const file = files[0];
    const fileType = detectFileType(file.name);

    if (fileType === 'wasm') {
      onWasmDrop(file);
    } else if (fileType === 'json') {
      onConfigDrop(file);
    } else {
      alert('❌ Unsupported file type. Please drop a .wasm or .json file.');
    }
  }, [onWasmDrop, onConfigDrop]);

  return (
    <div
      className={styles.dropZone}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}

      {/* Overlay shown during drag */}
      {isDragging && (
        <div className={styles.overlay}>
          <div className={styles.overlayContent}>
            {dragFileType === 'wasm' ? (
              <>
                <div className={styles.icon}>📦</div>
                <div className={styles.title}>Drop WASM file to load</div>
                <div className={styles.subtitle}>Quick and convenient loading</div>
              </>
            ) : dragFileType === 'json' ? (
              <>
                <div className={styles.icon}>⚙️</div>
                <div className={styles.title}>Drop config to load</div>
                <div className={styles.subtitle}>Will auto-load WASM if path present</div>
              </>
            ) : (
              <>
                <div className={styles.icon}>📁</div>
                <div className={styles.title}>Drop WASM or config file</div>
                <div className={styles.subtitle}>Quick convenience loading</div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
