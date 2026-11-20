import { useEffect, useState } from "react";
import { storage, type FixtureChange } from "../../api";
import panel from "../../components/common/StoresPanel/StoresPanel.module.css";
import styles from "./StorageExplorerView.module.css";

/** Above this many LCS cells (middle lines before × after), the middle shows as replaced. */
const MAX_DIFF_CELLS = 4_000_000;

/**
 * A line diff: unchanged, removed and added lines in order. Common leading and trailing lines are
 * kept as they are; LCS runs on the rest, unless that is too large for the page.
 */
export function lineDiff(before: string, after: string): { op: " " | "-" | "+"; line: string }[] {
  const a = before === "" ? [] : before.replace(/\n$/, "").split("\n");
  const b = after === "" ? [] : after.replace(/\n$/, "").split("\n");
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const out: { op: " " | "-" | "+"; line: string }[] = a.slice(0, head).map((line) => ({ op: " ", line }));
  const ma = a.slice(head, a.length - tail);
  const mb = b.slice(head, b.length - tail);
  if ((ma.length + 1) * (mb.length + 1) > MAX_DIFF_CELLS) {
    out.push(...ma.map((line) => ({ op: "-" as const, line })), ...mb.map((line) => ({ op: "+" as const, line })));
  } else {
    const lcs = Array.from({ length: ma.length + 1 }, () => new Array<number>(mb.length + 1).fill(0));
    for (let i = ma.length - 1; i >= 0; i--) {
      for (let j = mb.length - 1; j >= 0; j--) lcs[i][j] = ma[i] === mb[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
    let i = 0;
    let j = 0;
    while (i < ma.length || j < mb.length) {
      if (i < ma.length && j < mb.length && ma[i] === mb[j]) out.push({ op: " ", line: ma[i++] }), j++;
      else if (j < mb.length && (i === ma.length || lcs[i][j + 1] >= lcs[i + 1][j])) out.push({ op: "+", line: mb[j++] });
      else out.push({ op: "-", line: ma[i++] });
    }
  }
  out.push(...a.slice(a.length - tail).map((line) => ({ op: " " as const, line })));
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
