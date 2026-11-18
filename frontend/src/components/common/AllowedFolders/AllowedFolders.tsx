import { useState } from "react";
import { askAllowedFolder, type AllowedFolder } from "../../../api";

interface AllowedFoldersProps {
  folders: AllowedFolder[];
  /** A folder's state changed after Ask (approved, refused, or still not asked). */
  onState: (folder: string, state: AllowedFolder["state"]) => void;
}

/**
 * The allowed folders outside the workspace (`--allow`, or the VS Code setting) and their state this
 * session. Ask requests the user's approval (in the terminal or VS Code, never on this page), so
 * the folder's files show in the path fields before anything is loaded from it.
 */
export function AllowedFolders({ folders, onState }: AllowedFoldersProps) {
  const [asking, setAsking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (folders.length === 0) return null;

  const ask = async (folder: string) => {
    setAsking(folder);
    setError(null);
    try {
      const { state, error } = await askAllowedFolder(folder);
      onState(folder, state);
      if (error) setError(error);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAsking(null);
    }
  };

  return (
    <div className="notice" aria-label="Allowed folders">
      Folders outside the workspace:
      <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
        {folders.map(({ folder, state }) => (
          <li key={folder}>
            <code>{folder}</code>{" "}
            {state === "approved" && "readable this session (its files are in the path suggestions)"}
            {state === "refused" && "refused this session (restart the debugger to be asked again)"}
            {state === "not asked" &&
              (asking === folder ? (
                "waiting for your answer…"
              ) : (
                <button type="button" onClick={() => ask(folder)} disabled={asking !== null}>
                  Ask to read it
                </button>
              ))}
          </li>
        ))}
      </ul>
      {error && <div>{error}</div>}
    </div>
  );
}
