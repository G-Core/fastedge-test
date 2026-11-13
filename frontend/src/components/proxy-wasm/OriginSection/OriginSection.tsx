import styles from "../../common/RequestContextPanel/RequestContextPanel.module.css";

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
}

/**
 * Where the origin response comes from. With the built-in responder, its status and content
 * controls are the `x-debugger-status` / `x-debugger-content` request headers (which the
 * responder strips), so configs and tests that set those headers by hand keep working.
 */
export function OriginSection({ url, headers, onHeadersChange }: OriginSectionProps) {
  const builtIn = isBuiltIn(url);
  const keyOf = (name: string) => Object.keys(headers).find((k) => k.toLowerCase() === name) ?? name;
  const read = (name: string) => headers[keyOf(name)] ?? "";
  const write = (name: string, value: string) => {
    const next = { ...headers };
    delete next[keyOf(name)];
    if (value) next[name] = value;
    onHeadersChange(next);
  };

  return (
    <div className={styles.section}>
      <h4 className={styles.sectionTitle}>Origin</h4>
      {builtIn ? (
        <>
          <p className={styles.hint}>
            The built-in responder answers locally (request URL <code>built-in</code>).
          </p>
          <div className={styles.fields}>
            <label className={styles.field}>
              Status
              <input
                inputMode="numeric"
                value={read(STATUS)}
                placeholder="200"
                onChange={(e) => write(STATUS, e.target.value.trim())}
              />
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
        </>
      ) : (
        <p className={styles.hint}>
          Fetches the request URL. Use <code>built-in</code> as the URL for a local response.
        </p>
      )}
    </div>
  );
}
