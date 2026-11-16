import { Fragment, useCallback, useEffect, useState } from "react";
import { CollapsiblePanel } from "../CollapsiblePanel";
import { FLAGS } from "../RequestContextPanel";
import { useAppStore } from "../../../stores";
import type { Preset } from "../../../stores/types";
import {
  advanceStoresClock,
  pauseStoresClock,
  getRequestContextPresets,
  getStoredValue,
  getStoresSnapshot,
  resetStores,
  type StoredValue,
  type StoresSnapshot,
} from "../../../api";
import styles from "./StoresPanel.module.css";

export const ADVANCE: [string, number][] = [
  ["+1 min", 60_000],
  ["+1 h", 3_600_000],
  ["+1 day", 86_400_000],
];

export function formatTtl(ms: number): string {
  if (ms <= 0) return "expired";
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}

/** UTF-8 text (pretty JSON when it parses), or null for binary. */
export function decode(base64: string, truncated: boolean): string | null {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  let text: string;
  try {
    // A cut value may end mid-character: streaming mode holds back an incomplete last character.
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes, { stream: truncated });
  } catch {
    return null;
  }
  if (!truncated) {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      // not JSON
    }
  }
  return text;
}

function Bytes({ value, truncated, size }: { value: string; truncated: boolean; size: number }) {
  const text = decode(value, truncated);
  return (
    <>
      {text === null && <span className={styles.note}>binary (base64)</span>}
      <pre className={styles.value}>{text ?? value}</pre>
      {truncated && <span className={styles.note}>first 4 KB of {size} B</span>}
    </>
  );
}

/** One entry's value, fetched when the row opens (and again after each refresh). */
export function ValueView({ where, entryKey, version, fetch = getStoredValue }: { where: { dc: string } | { store: string }; entryKey: string; version: number; fetch?: typeof getStoredValue }) {
  const [state, setState] = useState<{ value: StoredValue | null } | { error: string } | null>(null);
  const whereKey = JSON.stringify(where);
  useEffect(() => {
    let live = true;
    fetch(JSON.parse(whereKey), entryKey)
      .then((value) => live && setState({ value }))
      .catch((e) => live && setState({ error: e instanceof Error ? e.message : String(e) }));
    return () => {
      live = false;
    };
  }, [whereKey, entryKey, version, fetch]);

  if (!state) return <p className={styles.empty}>Loading…</p>;
  if ("error" in state) return <p className={styles.error}>{state.error}</p>;
  const v = state.value;
  if (!v) return <p className={styles.empty}>Gone (deleted or expired).</p>;
  if (v.type === "string") return <Bytes {...v} />;
  if (v.type === "bloom") {
    return (
      <>
        <pre className={styles.value}>{v.items.join("\n")}</pre>
        {v.count > v.items.length && <span className={styles.note}>first {v.items.length} of {v.count} items</span>}
      </>
    );
  }
  return (
    <>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Score</th>
            <th>Member</th>
          </tr>
        </thead>
        <tbody>
          {v.members.map((m, i) => (
            <tr key={i}>
              <td>{m.score}</td>
              <td>
                <Bytes {...m} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {v.count > v.members.length && <span className={styles.note}>first {v.members.length} of {v.count} members</span>}
    </>
  );
}

/** Flags for the edge presets' dcs (fr5 🇩🇪, am3 🇳🇱, sv5 🇺🇸); other dcs get none. */
export function useDcFlags(): Record<string, string> {
  const [flags, setFlags] = useState<Record<string, string>>({});
  useEffect(() => {
    getRequestContextPresets()
      .then((p) =>
        setFlags(Object.fromEntries((Object.keys(p.edge) as Preset[]).map((k) => [p.edge[k].dc, FLAGS[k]]))),
      )
      .catch(() => {}); // plain dc names
  }, []);
  return flags;
}

/** Pause / resume the service clock: paused, cache TTLs stand still until Advance clock moves them. */
export function ClockPause({ paused, onToggle }: { paused: boolean; onToggle: (paused: boolean) => void }) {
  return (
    <button
      type="button"
      className={`${styles.button} ${paused ? styles.paused : ""}`}
      aria-pressed={paused}
      title={paused ? "Clock paused for every app: TTLs move only with Advance clock. Click to run it again." : "Stop the clock for every app: TTLs then move only with Advance clock"}
      onClick={() => onToggle(!paused)}
    >
      {paused ? "▶ Resume clock" : "⏸ Pause clock"}
    </button>
  );
}

/** Fired after the stores change outside an app's request (the Storage Explorer). */
export const STORES_CHANGED = "fastedge:stores-changed";

/** Re-render every second while mounted (TTL countdown). */
export function useTick(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function StoresContent({ refreshKey }: { refreshKey: unknown }) {
  const [snapshot, setSnapshot] = useState<StoresSnapshot | null>(null);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [dc, setDc] = useState<string | null>(null); // null = the app's dc
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null); // the expanded row
  const tick = useTick();
  const flags = useDcFlags();
  const toggle = (id: string) => setOpen((current) => (current === id ? null : id));
  const rowProps = (id: string) => ({
    tabIndex: 0,
    "aria-expanded": open === id,
    onClick: () => toggle(id),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle(id);
      }
    },
  });

  const refresh = useCallback(async () => {
    try {
      const next = await getStoresSnapshot(dc ?? undefined);
      setSnapshot(next);
      setFetchedAt(Date.now());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [dc]);

  // On open, on a dc switch, after each request, and after an app load (not during one: the
  // snapshot would show the bucket being replaced).
  const loading = useAppStore((s) => s.loading);
  useEffect(() => {
    if (!loading) void refresh();
  }, [refresh, refreshKey, loading]);

  // And after an edit in the Storage Explorer.
  useEffect(() => {
    const onChange = () => void refresh();
    window.addEventListener(STORES_CHANGED, onChange);
    return () => window.removeEventListener(STORES_CHANGED, onChange);
  }, [refresh]);

  // And when the next cache entry expires, so expired entries drop out.
  useEffect(() => {
    if (!snapshot?.enabled || snapshot.cache.length === 0 || snapshot.clockPaused) return;
    const next = Math.min(...snapshot.cache.map((e) => e.expiresAt - snapshot.now));
    const timer = setTimeout(() => void refresh(), Math.max(0, next - (Date.now() - fetchedAt)) + 250);
    return () => clearTimeout(timer);
  }, [snapshot, fetchedAt, refresh]);

  const act = async (action: () => Promise<void>) => {
    let failed: string | null = null;
    try {
      await action();
    } catch (e) {
      failed = e instanceof Error ? e.message : String(e);
    }
    await refresh();
    if (failed) setError(failed); // after the refresh, which clears errors
  };

  if (error && !snapshot) return <p className={styles.error}>{error}</p>;
  if (!snapshot) return <p className={styles.empty}>Loading…</p>;
  if (!snapshot.enabled) return <p className={styles.empty}>Stores are off (or the storage service could not start).</p>;

  const dcs = [...new Set([snapshot.appDc, snapshot.dc, ...snapshot.dcs])].sort();
  // The service clock moves with the wall clock between refreshes (not while paused).
  const elapsed = snapshot.clockPaused ? 0 : Math.max(0, tick - fetchedAt);

  return (
    <div>
      <div className={styles.toolbar}>
        <label className={styles.inline}>
          Cache dc
          <select value={snapshot.dc} onChange={(e) => setDc(e.target.value === snapshot.appDc ? null : e.target.value)}>
            {dcs.map((d) => (
              <option key={d} value={d}>
                {flags[d] ? `${flags[d]} ` : ""}
                {d}
                {d === snapshot.appDc ? " (this app)" : ""}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={styles.button} onClick={() => void refresh()}>
          Refresh
        </button>
        <span className={styles.spacer} />
        <ClockPause paused={snapshot.clockPaused} onToggle={(paused) => void act(() => pauseStoresClock(paused))} />
        <span>Advance clock</span>
        {ADVANCE.map(([label, ms]) => (
          <button key={label} type="button" className={styles.button} onClick={() => void act(() => advanceStoresClock(ms))}>
            {label}
          </button>
        ))}
        <button
          type="button"
          className={styles.button}
          title="Empty the cache (every dc) and re-seed Edge KV from fixtures/stores/"
          onClick={() => void act(resetStores)}
        >
          Reset
        </button>
      </div>
      {error && <p className={styles.error}>{error}</p>}

      <h4 className={styles.heading}>Cache ({snapshot.cache.length})</h4>
      {snapshot.cache.length === 0 ? (
        <p className={styles.empty}>No entries in {snapshot.dc}.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Key</th>
              <th>Size</th>
              <th>TTL</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.cache.map((e) => {
              const id = `cache:${snapshot.dc}:${e.key}`;
              return (
                <Fragment key={e.key}>
                  <tr className={styles.row} {...rowProps(id)}>
                    <td>
                      <span className={styles.caret}>{open === id ? "▾" : "▸"}</span>
                      {e.key}
                    </td>
                    <td>{e.size} B</td>
                    <td>{formatTtl(e.expiresAt - snapshot.now - elapsed)}</td>
                  </tr>
                  {open === id && (
                    <tr>
                      <td colSpan={3} className={styles.detail}>
                        <ValueView where={{ dc: snapshot.dc }} entryKey={e.key} version={fetchedAt} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}

      <h4 className={styles.heading}>Edge KV</h4>
      {snapshot.kv.length === 0 ? (
        <p className={styles.empty}>No stores (add them under fixtures/stores/).</p>
      ) : (
        snapshot.kv.map((store) => {
          const rows = [
            ...store.strings.map((r) => ({ type: "string", key: r.key, detail: `${r.size} B` })),
            ...store.zsets.map((r) => ({ type: "zset", key: r.key, detail: `${r.members} members` })),
            ...store.bloom.map((r) => ({ type: "bloom", key: r.key, detail: `${r.items} items` })),
          ];
          return (
            <div key={store.store}>
              <h4 className={styles.heading}>
                {store.store} ({rows.length})
              </h4>
              {rows.length === 0 ? (
                <p className={styles.empty}>Empty.</p>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Key</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const id = `kv:${store.store}:${r.key}`;
                      return (
                        <Fragment key={`${r.type}:${r.key}`}>
                          <tr className={styles.row} {...rowProps(id)}>
                            <td className={styles.type}>
                              <span className={styles.caret}>{open === id ? "▾" : "▸"}</span>
                              {r.type}
                            </td>
                            <td>{r.key}</td>
                            <td>{r.detail}</td>
                          </tr>
                          {open === id && (
                            <tr>
                              <td colSpan={3} className={styles.detail}>
                                <ValueView where={{ store: store.store }} entryKey={r.key} version={fetchedAt} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

/**
 * Storage panel: the cache entries of one dc (default: this app's) with their TTLs, and every
 * Edge KV store's keys by type; click a row for its value. Read-only; Reset goes back to the fixtures, Advance clock moves
 * cache expiry. Refreshes after each request (`refreshKey` changes).
 */
export function StoresPanel({ refreshKey }: { refreshKey: unknown }) {
  return (
    <CollapsiblePanel title="Storage" defaultExpanded={false}>
      <StoresContent refreshKey={refreshKey} />
    </CollapsiblePanel>
  );
}
