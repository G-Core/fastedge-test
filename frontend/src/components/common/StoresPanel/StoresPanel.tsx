import { useCallback, useEffect, useState } from "react";
import { CollapsiblePanel } from "../CollapsiblePanel";
import {
  advanceStoresClock,
  getStoresSnapshot,
  resetStores,
  type StoresSnapshot,
} from "../../../api";
import styles from "./StoresPanel.module.css";

const ADVANCE: [string, number][] = [
  ["+1 min", 60_000],
  ["+1 h", 3_600_000],
  ["+1 day", 86_400_000],
];

function formatTtl(ms: number): string {
  if (ms <= 0) return "expired";
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}

/** Re-render every second while mounted (TTL countdown). */
function useTick(): number {
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
  const tick = useTick();

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

  // On open, on a dc switch, and after each request.
  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  const act = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    await refresh();
  };

  if (error && !snapshot) return <p className={styles.error}>{error}</p>;
  if (!snapshot) return <p className={styles.empty}>Loading…</p>;
  if (!snapshot.enabled) return <p className={styles.empty}>Stores are off (or the storage service could not start).</p>;

  const dcs = [...new Set([snapshot.appDc, snapshot.dc, ...snapshot.dcs])].sort();
  // The service clock moves with the wall clock between refreshes.
  const elapsed = Math.max(0, tick - fetchedAt);

  return (
    <div>
      <div className={styles.toolbar}>
        <label>
          Cache dc{" "}
          <select value={snapshot.dc} onChange={(e) => setDc(e.target.value === snapshot.appDc ? null : e.target.value)}>
            {dcs.map((d) => (
              <option key={d} value={d}>
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
            {snapshot.cache.map((e) => (
              <tr key={e.key}>
                <td>{e.key}</td>
                <td>{e.size} B</td>
                <td>{formatTtl(e.expiresAt - snapshot.now - elapsed)}</td>
              </tr>
            ))}
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
                    {rows.map((r) => (
                      <tr key={`${r.type}:${r.key}`}>
                        <td className={styles.type}>{r.type}</td>
                        <td>{r.key}</td>
                        <td>{r.detail}</td>
                      </tr>
                    ))}
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
 * Edge KV store's keys by type. Read-only; Reset goes back to the fixtures, Advance clock moves
 * cache expiry. Refreshes after each request (`refreshKey` changes).
 */
export function StoresPanel({ refreshKey }: { refreshKey: unknown }) {
  return (
    <CollapsiblePanel title="Storage" defaultExpanded={false}>
      <StoresContent refreshKey={refreshKey} />
    </CollapsiblePanel>
  );
}
