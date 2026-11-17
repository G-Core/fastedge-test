import { useEffect, useId, useState, type ReactNode } from "react";
import type { BuiltInOrigin, ResourceOrigin, WorkspaceFiles } from "../../../api";
import styles from "./OriginEditor.module.css";

type Mode = "unset" | "echo" | "fixed" | "files" | "url" | `app:${string}`;

interface OriginEditorProps {
  /** Accessible name prefix, e.g. "main origin". */
  label: string;
  value: ResourceOrigin | undefined;
  onChange: (origin: ResourceOrigin | undefined) => void;
  /** The choice that leaves the origin unset (a rule: "main's"; the Debugger: "the request URL"). Absent: it must be set. */
  unsetLabel?: string;
  /** HTTP apps that can answer as the origin (a resource's). */
  apps?: string[];
  /** Under the echo choice (the Debugger's status / content controls). */
  echoControls?: ReactNode;
  /** Path suggestions: the workspace's files and folders, and how a workspace path is written here. */
  files: WorkspaceFiles | null;
  toPath: (workspacePath: string) => string;
  onFocusPath: () => void;
  /** The "Origin" label before the choice (off where a section title already says it). */
  showLabel?: boolean;
}

function modeOf(origin: ResourceOrigin | undefined): Mode {
  if (!origin) return "unset";
  if ("app" in origin) return `app:${origin.app}`;
  if ("url" in origin) return origin.url === "built-in" ? "echo" : "url";
  return origin.builtIn.files !== undefined ? "files" : "fixed";
}

const headersText = (headers: Record<string, string> | undefined) =>
  Object.entries(headers ?? {}).map(([name, value]) => `${name}: ${value}`).join("\n");

/** "name: value" lines; lines without a name are left out. */
function parseHeaders(text: string): Record<string, string> | undefined {
  const headers: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const at = line.indexOf(":");
    const name = (at < 0 ? line : line.slice(0, at)).trim();
    if (name) headers[name] = at < 0 ? "" : line.slice(at + 1).trim();
  }
  return Object.keys(headers).length ? headers : undefined;
}

/**
 * Where a CDN request's response comes from: the echo responder, a declared response (status,
 * headers, text or a file), a folder of files served by request path, a URL, or (in a resource)
 * an HTTP app. Writes the same `origin` object agents and config files use.
 */
export function OriginEditor({ label, value, onChange, unsetLabel, apps = [], echoControls, files, toPath, onFocusPath, showLabel = true }: OriginEditorProps) {
  const id = useId();
  const mode = modeOf(value);
  const builtIn: BuiltInOrigin = value && "builtIn" in value ? value.builtIn : {};
  const bodySource = builtIn.bodyFile !== undefined ? "file" : "text";
  // Kept as typed (a half-written line must not vanish); replaced when the headers change elsewhere.
  const [headerLines, setHeaderLines] = useState(headersText(builtIn.headers));
  const actualHeaders = JSON.stringify(builtIn.headers ?? {});
  useEffect(() => {
    if (JSON.stringify(parseHeaders(headerLines) ?? {}) !== actualHeaders) setHeaderLines(headersText(builtIn.headers));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actualHeaders]);

  const setBuiltIn = (change: Partial<BuiltInOrigin>) => {
    const next: BuiltInOrigin = { ...builtIn, ...change };
    for (const key of Object.keys(next) as (keyof BuiltInOrigin)[]) if (next[key] === undefined) delete next[key];
    onChange({ builtIn: next });
  };

  const choose = (next: Mode) => {
    if (next === "unset") onChange(undefined);
    else if (next === "echo") onChange({ url: "built-in" });
    else if (next === "url") onChange({ url: "https://" });
    else if (next === "fixed") onChange({ builtIn: { status: 200, body: "" } });
    else if (next === "files") onChange({ builtIn: { files: "" } });
    else onChange({ app: next.slice(4) });
  };

  const pathInput = (kind: "files" | "bodyFile", list: string[], placeholder: string) => (
    <>
      <input
        className={styles.path}
        aria-label={`${label} ${kind === "files" ? "folder" : "body file"}`}
        list={`${id}-${kind}`}
        value={builtIn[kind] ?? ""}
        placeholder={placeholder}
        title={builtIn[kind]}
        onFocus={onFocusPath}
        onChange={(e) => setBuiltIn({ [kind]: e.target.value })}
      />
      <datalist id={`${id}-${kind}`}>
        {list.map((p) => (
          <option key={p} value={toPath(p)} />
        ))}
      </datalist>
    </>
  );

  const headersField = (
    <label className={styles.field}>
      Response headers
      <textarea
        aria-label={`${label} headers`}
        className={styles.headers}
        placeholder={"content-type: application/json\ncache-control: no-store"}
        value={headerLines}
        onChange={(e) => {
          setHeaderLines(e.target.value);
          setBuiltIn({ headers: parseHeaders(e.target.value) });
        }}
      />
    </label>
  );

  return (
    <div className={styles.editor}>
      <div className={styles.row}>
        {showLabel && <span className={styles.label}>Origin</span>}
        <select aria-label={label} value={mode} onChange={(e) => choose(e.target.value as Mode)}>
          {unsetLabel && <option value="unset">{unsetLabel}</option>}
          <option value="echo">Built-in: echo the request</option>
          <option value="fixed">Built-in: fixed response</option>
          <option value="files">Built-in: serve a folder</option>
          <option value="url">URL</option>
          {apps.map((a) => (
            <option key={a} value={`app:${a}`}>
              App: {a}
            </option>
          ))}
        </select>
        {mode === "url" && "url" in value! && (
          <input className={styles.path} aria-label={`${label} URL`} value={value.url} onChange={(e) => onChange({ url: e.target.value })} />
        )}
        {mode === "files" && pathInput("files", files?.folders ?? [], "folder, e.g. ../assets")}
      </div>

      {mode === "echo" && echoControls}

      {mode === "fixed" && (
        <div className={styles.fields}>
          <label className={styles.field}>
            Status
            <input
              aria-label={`${label} status`}
              inputMode="numeric"
              className={styles.status}
              value={builtIn.status ?? ""}
              placeholder="200"
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                setBuiltIn({ status: Number.isFinite(n) ? n : undefined });
              }}
            />
          </label>
          <label className={styles.field}>
            Body
            <select
              aria-label={`${label} body source`}
              value={bodySource}
              onChange={(e) => {
                const source = e.target.value as "text" | "file";
                setBuiltIn(source === "text" ? { body: "", bodyFile: undefined } : { body: undefined, bodyFile: "" });
              }}
            >
              <option value="text">Text</option>
              <option value="file">A file's bytes</option>
            </select>
          </label>
          {bodySource === "file" ? (
            <label className={styles.field}>
              File
              {pathInput("bodyFile", files?.files ?? [], "e.g. ../assets/photo.png")}
            </label>
          ) : (
            <label className={styles.field}>
              Text
              <textarea aria-label={`${label} body`} className={styles.headers} value={builtIn.body ?? ""} onChange={(e) => setBuiltIn({ body: e.target.value })} />
            </label>
          )}
          {headersField}
        </div>
      )}

      {mode === "files" && (
        <div className={styles.fields}>
          <p className={styles.hint}>
            GET /a/b.png answers with the folder's <code>a/b.png</code> (200), anything else 404. Dotfiles are never served.
          </p>
          {headersField}
        </div>
      )}
    </div>
  );
}
