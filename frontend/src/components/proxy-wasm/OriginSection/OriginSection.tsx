import styles from "../../common/RequestContextPanel/RequestContextPanel.module.css";
import { OriginEditor } from "../OriginEditor";
import { useWorkspaceFiles } from "../../../hooks/useWorkspaceFiles";
import type { Origin } from "../../../api";

const STATUS = "x-debugger-status";
const CONTENT = "x-debugger-content";

/** The built-in responder: "built-in" or its URL (optionally with a path or query). */
export function isBuiltIn(url: string): boolean {
  return url === "built-in" || /^http:\/\/fastedge-builtin\.debug(?:[/?]|$)/.test(url);
}

interface OriginSectionProps {
  url: string;
  headers: Record<string, string>;
  onHeadersChange: (headers: Record<string, string>) => void;
  /** The config's `origin`; null = the request URL decides. */
  origin: Origin | null;
  onOriginChange: (origin: Origin | null) => void;
}

/**
 * Where the origin response comes from: the request URL (unset), or a declared origin (the
 * shared OriginEditor: echo, fixed response, folder, URL). With the echo responder, its status
 * and content controls are the deprecated `x-debugger-status` / `x-debugger-content` request
 * headers (which the responder strips), so configs and tests that set them by hand keep working.
 */
export function OriginSection({ url, headers, onHeadersChange, origin, onOriginChange }: OriginSectionProps) {
  const [files, refreshFiles] = useWorkspaceFiles();
  const builtIn = isBuiltIn(url);
  const keyOf = (name: string) => Object.keys(headers).find((k) => k.toLowerCase() === name) ?? name;
  const read = (name: string) => headers[keyOf(name)] ?? "";
  const write = (name: string, value: string) => {
    const next = { ...headers };
    delete next[keyOf(name)];
    if (value) next[name] = value;
    onHeadersChange(next);
  };

  const echoControls = (
    <div className={styles.fields}>
      <label className={styles.field}>
        Status
        <input inputMode="numeric" value={read(STATUS)} placeholder="200" onChange={(e) => write(STATUS, e.target.value.trim())} />
      </label>
      <label className={styles.field}>
        Response
        <select value={read(CONTENT)} onChange={(e) => write(CONTENT, e.target.value)}>
          <option value="">JSON echo of the request</option>
          <option value="body-only">Request body only</option>
          <option value="status-only">Status only (empty body)</option>
        </select>
      </label>
    </div>
  );

  return (
    <div className={styles.section}>
      <h4 className={styles.sectionTitle}>Origin</h4>
      <OriginEditor
        label="Origin"
        value={origin ?? undefined}
        onChange={(next) => onOriginChange((next as Origin | undefined) ?? null)}
        unsetLabel="The request URL"
        echoControls={echoControls}
        files={files}
        toPath={(p) => p}
        onFocusPath={refreshFiles}
        showLabel={false}
      />
      {!origin &&
        (builtIn ? (
          <>
            <p className={styles.hint}>
              The built-in responder answers locally (request URL <code>built-in</code>).
            </p>
            {echoControls}
          </>
        ) : (
          <p className={styles.hint}>
            Fetches the request URL. Use <code>built-in</code> as the URL for a local response, or choose an origin above.
          </p>
        ))}
      {origin && (
        <p className={styles.hint}>
          The request URL is only what the client asked for: its path and query go to this origin. Paths are relative to the workspace.
        </p>
      )}
    </div>
  );
}
