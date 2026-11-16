import { useEffect, useState } from "react";
import { storage, type FixtureChange } from "../../api";
import panel from "../../components/common/StoresPanel/StoresPanel.module.css";
import styles from "./StorageExplorerView.module.css";

/** A line diff (LCS; fixture files are small): unchanged, removed and added lines in order. */
export function lineDiff(before: string, after: string): { op: " " | "-" | "+"; line: string }[] {
  const a = before === "" ? [] : before.replace(/\n$/, "").split("\n");
  const b = after === "" ? [] : after.replace(/\n$/, "").split("\n");
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  }
  const out: { op: " " | "-" | "+"; line: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) out.push({ op: " ", line: a[i++] }), j++;
    else if (j < b.length && (i === a.length || lcs[i][j + 1] >= lcs[i + 1][j])) out.push({ op: "+", line: b[j++] });
    else out.push({ op: "-", line: a[i++] });
  }
  return out;
}

/**
 * Save to fixtures: what each Edge KV fixture file would become, as a diff; the ticked files are
 * written (or deleted). The server writes only what this diff showed, and refuses if the data
 * changed since.
 */
export function SaveFixtures({ onClose }: { onClose: () => void }) {
  const [diff, setDiff] = useState<{ root: string; changes: FixtureChange[] } | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string[] | null>(null);

  const load = async () => {
    try {
      const next = await storage.fixturesDiff();
      setDiff(next);
      // Deletions are opt-in; new and changed files start ticked.
      setChosen(new Set(next.changes.filter((c) => c.status !== "deleted").map((c) => c.file)));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    try {
      const files = diff!.changes.filter((c) => chosen.has(c.file)).map(({ file, hash }) => ({ file, hash }));
      setSaved(await storage.saveFixtures(files));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className={styles.dialog} role="dialog" aria-label="Save to fixtures">
      <div className={styles.row}>
        <h4 className={panel.heading}>Save to fixtures</h4>
        <span className={panel.spacer} />
        <button type="button" className={panel.button} onClick={onClose}>
          Close
        </button>
      </div>
      {error && (
        <p className={panel.error}>
          {error}{" "}
          <button type="button" className={panel.button} onClick={() => void load()}>
            Show the diff again
          </button>
        </p>
      )}
      {saved ? (
        <p className={panel.note}>Saved {saved.join(", ")}.</p>
      ) : !diff ? (
        !error && <p className={panel.empty}>Loading…</p>
      ) : diff.changes.length === 0 ? (
        <p className={panel.empty}>The fixture files already hold this data.</p>
      ) : (
        <>
          <p className={panel.note}>Edge KV only, under {diff.root}. Cache entries are not saved.</p>
          {diff.changes.map((c) => (
            <div key={c.file} className={styles.change}>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={chosen.has(c.file)}
                  onChange={(e) => {
                    const next = new Set(chosen);
                    if (e.target.checked) next.add(c.file);
                    else next.delete(c.file);
                    setChosen(next);
                  }}
                />
                <span className={styles[c.status]}>{c.status}</span> {c.file}
              </label>
              <pre className={styles.diff}>
                {lineDiff(c.current ?? "", c.proposed ?? "").map((d, i) => (
                  <div key={i} className={d.op === "+" ? styles.added : d.op === "-" ? styles.removed : undefined}>
                    {d.op} {d.line}
                  </div>
                ))}
              </pre>
            </div>
          ))}
          <button type="button" className={`${panel.button} ${styles.primary}`} disabled={chosen.size === 0} onClick={() => void save()}>
            Save {chosen.size} file{chosen.size === 1 ? "" : "s"}
          </button>
        </>
      )}
    </div>
  );
}
