import { useRef, useState } from "react";
import { resource, type WorkspaceFiles } from "../api";

/**
 * The workspace's files for path-field suggestions. `refresh` (call it when a path field gets
 * focus, so new builds show up) fetches at most every 2 s; a failed fetch keeps the last list.
 */
export function useWorkspaceFiles(): [WorkspaceFiles | null, () => void] {
  const [files, setFiles] = useState<WorkspaceFiles | null>(null);
  const at = useRef(0);
  const refresh = () => {
    if (Date.now() - at.current < 2000) return;
    at.current = Date.now();
    resource.files().then(setFiles, () => {});
  };
  return [files, refresh];
}
