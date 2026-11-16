import { Fragment, useCallback, useEffect, useState } from "react";
import { Tabs } from "../../components/common/Tabs";
import { ADVANCE, ClockPause, STORES_CHANGED, ValueView, formatTtl, useDcFlags, useTick } from "../../components/common/StoresPanel/StoresPanel";
import panel from "../../components/common/StoresPanel/StoresPanel.module.css";
import { storage, type ExplorerSnapshot, type FixtureValue, type KvKeyInput, type StoredValue } from "../../api";
import { SaveFixtures } from "./SaveFixtures";
import styles from "./StorageExplorerView.module.css";

type KvType = KvKeyInput["type"];

/** Base64 → UTF-8 text, or null when the bytes are not valid UTF-8. */
function utf8(base64: string): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

/** A value as the API takes it: text, or { base64 } when the box holds base64. */
const fixtureValue = (text: string, base64: boolean): FixtureValue => (base64 ? { base64: text.trim() } : text);

/** A key's current contents as editor text, or null when it cannot be edited in place (cut, or binary member). */
function editorText(v: StoredValue): { text: string; base64: boolean } | null {
  if (v.type === "string") {
    if (v.truncated) return null;
    const text = utf8(v.value);
    return text === null ? { text: v.value, base64: true } : { text, base64: false };
  }
  if (v.type === "bloom") return v.count > v.items.length ? null : { text: v.items.join("\n"), base64: false };
  if (v.count > v.members.length || v.members.some((m) => m.truncated)) return null;
  const lines = v.members.map((m) => {
    const text = utf8(m.value);
    return text === null ? null : `${m.score} ${text}`;
  });
  return lines.includes(null) ? null : { text: lines.join("\n"), base64: false };
}

/** Editor text → the API's key input. Sorted sets: one `score member` per line. */
function keyInput(type: KvType, text: string, base64: boolean): KvKeyInput {
  if (type === "string") return { type, value: fixtureValue(text, base64) };
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  if (type === "bloom") return { type, items: lines };
  return {
    type,
    members: lines.map((line, i) => {
      const match = /^\s*(-?[\d.eE+-]+|[+-]?inf)\s+(.*)$/.exec(line);
      if (!match) throw new Error(`line ${i + 1}: expected "score member"`);
      const score = /inf$/.test(match[1]) ? (match[1].startsWith("-") ? -Infinity : Infinity) : Number(match[1]);
      if (Number.isNaN(score)) throw new Error(`line ${i + 1}: score is not a number`);
      return [match[2], score] as [FixtureValue, number];
    }),
  };
}

/** Add or replace one Edge KV key. `initial` set = editing an existing key. */
function KeyEditor({
  store,
  initial,
  onDone,
}: {
  store: string;
  initial?: { key: string; type: KvType; text: string; base64: boolean };
  onDone: (changed: boolean) => void;
}) {
  const [key, setKey] = useState(initial?.key ?? "");
  const [type, setType] = useState<KvType>(initial?.type ?? "string");
  const [text, setText] = useState(initial?.text ?? "");
  const [base64, setBase64] = useState(initial?.base64 ?? false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    try {
      if (!key) throw new Error("a key is required");
      await storage.putKv(store, key, keyInput(type, text, base64));
      onDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className={styles.editor}>
      <div className={styles.row}>
        <select aria-label="Type" value={type} onChange={(e) => setType(e.target.value as KvType)} disabled={!!initial}>
          <option value="string">string</option>
          <option value="zset">sorted set</option>
          <option value="bloom">bloom filter</option>
        </select>
        <input aria-label="Key" placeholder="key" value={key} onChange={(e) => setKey(e.target.value)} disabled={!!initial} />
        {type === "string" && (
          <label className={styles.check}>
            <input type="checkbox" checked={base64} onChange={(e) => setBase64(e.target.checked)} /> base64
          </label>
        )}
      </div>
      <textarea
        aria-label="Value"
        rows={type === "string" ? 4 : 6}
        value={text}
        placeholder={type === "string" ? "value" : type === "zset" ? "one per line: score member" : "one item per line"}
        onChange={(e) => setText(e.target.value)}
      />
      {error && <p className={panel.error}>{error}</p>}
      <div className={styles.row}>
        <button type="button" className={panel.button} onClick={() => void save()}>
          {initial ? "Save" : "Add key"}
        </button>
        <button type="button" className={panel.button} onClick={() => onDone(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Paste or pick a JSON file: the fixture format, or a plain object of key → value. */
function ImportForm({ store, onDone }: { store: string; onDone: (message: string | null) => void }) {
  const [text, setText] = useState("");
  const [replace, setReplace] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    try {
      const data = JSON.parse(text);
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("expected a JSON object");
      const keys = await storage.importKv(store, data, replace);
      onDone(`Imported ${keys} keys into ${store}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className={styles.editor}>
      <p className={panel.note}>
        A JSON object of key → value (non-strings are stored as JSON text), or the fixture format {"{ strings, zsets, bloom }"}.
      </p>
      <input
        type="file"
        accept=".json,application/json"
        aria-label="JSON file"
        onChange={(e) => void e.target.files?.[0]?.text().then(setText)}
      />
      <textarea aria-label="JSON" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder='{ "alice": { "role": "admin" } }' />
      <label className={styles.check}>
        <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> Replace the store's keys
      </label>
      {error && <p className={panel.error}>{error}</p>}
      <div className={styles.row}>
        <button type="button" className={panel.button} onClick={() => void run()}>
          Import
        </button>
        <button type="button" className={panel.button} onClick={() => onDone(null)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function KvTab({ snapshot, version, act }: { snapshot: ExplorerSnapshot; version: number; act: Act }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [newStore, setNewStore] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [mode, setMode] = useState<"add" | "import" | { edit: string; type: KvType; text: string; base64: boolean } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const store = snapshot.kv.find((s) => s.store === selected) ?? snapshot.kv[0];

  const edit = async (key: string, type: KvType) => {
    const value = await storage.value({ store: store.store }, key);
    const text = value && editorText(value);
    if (!text) {
      setMessage(`${key} is too large (or binary) to edit here: replace it with Add key, same key.`);
      return;
    }
    setMode({ edit: key, type, ...text });
  };

  return (
    <div className={styles.split}>
      <nav className={styles.stores} aria-label="Edge KV stores">
        <h4 className={styles.sectionTitle}>Stores</h4>
        {snapshot.kv.map((s) => (
          <button
            key={s.store}
            type="button"
            className={`${styles.store} ${s.store === store?.store ? styles.selected : ""}`}
            onClick={() => {
              setSelected(s.store);
              setOpen(null);
              setMode(null);
            }}
          >
            {s.store}
            <span className={styles.count}>{s.strings.length + s.zsets.length + s.bloom.length}</span>
          </button>
        ))}
        <form
          className={styles.newStore}
          onSubmit={(e) => {
            e.preventDefault();
            const name = newStore.trim();
            if (!name) return;
            void act(() => storage.createStore(name), { storeList: true }).then((ok) => {
              if (!ok) return;
              setSelected(name);
              setNewStore("");
              setMessage(`Created ${name}. A loaded HTTP app reloads when you go back to the Debugger, so it can open it.`);
            });
          }}
        >
          <input aria-label="New store" placeholder="new store" value={newStore} onChange={(e) => setNewStore(e.target.value)} />
          <button type="submit" className={panel.button}>
            +
          </button>
        </form>
      </nav>

      <section className={styles.keys}>
        {!store ? (
          <p className={panel.empty}>No stores. Create one, or add fixtures under fixtures/stores/kv/.</p>
        ) : (
          <>
            <div className={styles.sectionHeader}>
              <h4 className={styles.sectionTitle}>
                {store.store} <span className={styles.count}>{store.strings.length + store.zsets.length + store.bloom.length} keys</span>
              </h4>
              <span className={panel.spacer} />
              <button type="button" className={panel.button} onClick={() => setMode("add")}>
                Add key
              </button>
              <button type="button" className={panel.button} onClick={() => setMode("import")}>
                Import JSON
              </button>
              <button
                type="button"
                className={panel.button}
                onClick={() => {
                  if (window.confirm(`Delete store ${store.store} and all its keys?`)) void act(() => storage.deleteStore(store.store), { storeList: true });
                }}
              >
                Delete store
              </button>
            </div>
            {message && <p className={panel.note}>{message}</p>}
            {mode === "add" && <KeyEditor store={store.store} onDone={(changed) => { setMode(null); if (changed) void act(async () => {}); }} />}
            {mode === "import" && (
              <ImportForm store={store.store} onDone={(m) => { setMode(null); if (m) { setMessage(m); void act(async () => {}); } }} />
            )}
            {mode && typeof mode === "object" && (
              <KeyEditor
                store={store.store}
                initial={{ key: mode.edit, type: mode.type, text: mode.text, base64: mode.base64 }}
                onDone={(changed) => { setMode(null); if (changed) void act(async () => {}); }}
              />
            )}
            <KeyTable store={store} open={open} setOpen={setOpen} version={version} onEdit={edit} act={act} />
          </>
        )}
      </section>
    </div>
  );
}

function KeyTable({
  store,
  open,
  setOpen,
  version,
  onEdit,
  act,
}: {
  store: ExplorerSnapshot["kv"][number];
  open: string | null;
  setOpen: (id: string | null) => void;
  version: number;
  onEdit: (key: string, type: KvType) => void;
  act: Act;
}) {
  const rows = [
    ...store.strings.map((r) => ({ type: "string" as const, key: r.key, detail: `${r.size} B` })),
    ...store.zsets.map((r) => ({ type: "zset" as const, key: r.key, detail: `${r.members} members` })),
    ...store.bloom.map((r) => ({ type: "bloom" as const, key: r.key, detail: `${r.items} items` })),
  ].sort((a, b) => a.key.localeCompare(b.key));
  if (rows.length === 0) return <p className={panel.empty}>Empty.</p>;
  return (
    <table className={panel.table}>
      <thead>
        <tr>
          <th>Type</th>
          <th>Key</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const id = `${r.type}:${r.key}`;
          return (
            <Fragment key={id}>
              <tr className={panel.row} tabIndex={0} aria-expanded={open === id} onClick={() => setOpen(open === id ? null : id)}>
                <td className={panel.type}>
                  <span className={panel.caret}>{open === id ? "▾" : "▸"}</span>
                  {r.type}
                </td>
                <td>{r.key}</td>
                <td>{r.detail}</td>
              </tr>
              {open === id && (
                <tr>
                  <td colSpan={3} className={panel.detail}>
                    <ValueView where={{ store: store.store }} entryKey={r.key} version={version} fetch={storage.value} />
                    <div className={styles.row}>
                      <button type="button" className={panel.button} onClick={() => onEdit(r.key, r.type)}>
                        Edit
                      </button>
                      <button type="button" className={panel.button} onClick={() => void act(() => storage.deleteKv(store.store, r.key))}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

/** Seconds from a form field; blank = undefined. */
const seconds = (text: string): number | undefined => (text.trim() === "" ? undefined : Math.round(Number(text) * 1000));

function CacheTab({ snapshot, version, fetchedAt, dc, setDc, act }: { snapshot: ExplorerSnapshot; version: number; fetchedAt: number; dc: string; setDc: (dc: string) => void; act: Act }) {
  const tick = useTick();
  const flags = useDcFlags();
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [entry, setEntry] = useState({ key: "", value: "", base64: false, ttl: "" });
  const [ttl, setTtl] = useState("");
  const [otherDc, setOtherDc] = useState("");
  const elapsed = snapshot.clockPaused ? 0 : Math.max(0, tick - fetchedAt);
  const dcs = [...new Set([dc, "local", ...snapshot.dcs, ...Object.keys(flags)])].sort();

  return (
    <div>
      <div className={styles.sectionHeader}>
        <label className={panel.inline}>
          dc
          <select value={dc} onChange={(e) => setDc(e.target.value)}>
            {dcs.map((d) => (
              <option key={d} value={d}>
                {flags[d] ? `${flags[d]} ` : ""}
                {d}
              </option>
            ))}
          </select>
        </label>
        <form
          className={styles.row}
          onSubmit={(e) => {
            e.preventDefault();
            if (otherDc.trim()) setDc(otherDc.trim());
            setOtherDc("");
          }}
        >
          <input aria-label="Other dc" placeholder="other dc" value={otherDc} onChange={(e) => setOtherDc(e.target.value)} size={8} />
        </form>
        <span className={panel.spacer} />
        <button type="button" className={panel.button} onClick={() => setAdding(true)}>
          Add entry
        </button>
      </div>

      {adding && (
        <div className={styles.editor}>
          <div className={styles.row}>
            <input aria-label="Cache key" placeholder="key" value={entry.key} onChange={(e) => setEntry({ ...entry, key: e.target.value })} />
            <input aria-label="TTL seconds" placeholder="TTL s (default)" value={entry.ttl} onChange={(e) => setEntry({ ...entry, ttl: e.target.value })} size={12} />
            <label className={styles.check}>
              <input type="checkbox" checked={entry.base64} onChange={(e) => setEntry({ ...entry, base64: e.target.checked })} /> base64
            </label>
          </div>
          <textarea aria-label="Cache value" rows={4} value={entry.value} onChange={(e) => setEntry({ ...entry, value: e.target.value })} placeholder="value" />
          <div className={styles.row}>
            <button
              type="button"
              className={panel.button}
              onClick={() =>
                void act(() => storage.putCache(dc, entry.key, fixtureValue(entry.value, entry.base64), seconds(entry.ttl))).then((ok) => {
                  if (ok) {
                    setAdding(false);
                    setEntry({ key: "", value: "", base64: false, ttl: "" });
                  }
                })
              }
            >
              Add
            </button>
            <button type="button" className={panel.button} onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {snapshot.cache.length === 0 ? (
        <p className={panel.empty}>No entries in {dc}.</p>
      ) : (
        <table className={panel.table}>
          <thead>
            <tr>
              <th>Key</th>
              <th>Size</th>
              <th>TTL</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.cache.map((e) => (
              <Fragment key={e.key}>
                <tr className={panel.row} tabIndex={0} aria-expanded={open === e.key} onClick={() => setOpen(open === e.key ? null : e.key)}>
                  <td>
                    <span className={panel.caret}>{open === e.key ? "▾" : "▸"}</span>
                    {e.key}
                  </td>
                  <td>{e.size} B</td>
                  <td>{formatTtl(e.expiresAt - snapshot.now - elapsed)}</td>
                </tr>
                {open === e.key && (
                  <tr>
                    <td colSpan={3} className={panel.detail}>
                      <ValueView where={{ dc }} entryKey={e.key} version={version} fetch={storage.value} />
                      <form
                        className={styles.row}
                        onSubmit={(ev) => {
                          ev.preventDefault();
                          const ms = seconds(ttl);
                          if (ms !== undefined && ms >= 0) void act(() => storage.expireCache(dc, e.key, ms)).then(() => setTtl(""));
                        }}
                      >
                        <input aria-label="New TTL seconds" placeholder="new TTL (s)" value={ttl} onChange={(ev) => setTtl(ev.target.value)} size={10} />
                        <button type="submit" className={panel.button}>
                          Set TTL
                        </button>
                        <button type="button" className={panel.button} onClick={() => void act(() => storage.deleteCache(dc, e.key))}>
                          Delete
                        </button>
                      </form>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Run an edit, then refresh; resolves true when the edit succeeded. */
type Act = (action: () => Promise<unknown>, options?: { storeList?: boolean }) => Promise<boolean>;

/**
 * Storage Explorer: browse and edit the local Edge KV stores and cache (with or without an app
 * loaded), import JSON, and save Edge KV to fixture files after reviewing the diff. Edits live in
 * the storage service until it restarts or resets; Save to fixtures keeps them.
 */
export function StorageExplorerView() {
  const [tab, setTab] = useState<"kv" | "cache">("kv");
  const [dc, setDc] = useState("local");
  const [snapshot, setSnapshot] = useState<ExplorerSnapshot | null>(null);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setSnapshot(await storage.snapshot(dc));
      setFetchedAt(Date.now());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [dc]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const act: Act = async (action, options) => {
    let ok = true;
    try {
      await action();
    } catch (e) {
      ok = false;
      setError(e instanceof Error ? e.message : String(e));
    }
    if (ok) {
      window.dispatchEvent(new CustomEvent(STORES_CHANGED, { detail: { storeList: options?.storeList ?? false } }));
      await refresh();
    }
    return ok;
  };

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <button type="button" className={panel.button} onClick={() => void refresh()}>
          Refresh
        </button>
        <span className={panel.spacer} />
        <div className={styles.group} role="group" aria-label="Clock">
          <span className={styles.groupLabel}>Clock</span>
          {snapshot && <ClockPause paused={snapshot.clockPaused} onToggle={(paused) => void act(() => storage.pauseClock(paused))} />}
          {ADVANCE.map(([label, ms]) => (
            <button key={label} type="button" className={panel.button} title={`Advance the clock ${label.slice(1)}`} onClick={() => void act(() => storage.advanceClock(ms))}>
              {label}
            </button>
          ))}
        </div>
        <div className={styles.group} role="group" aria-label="Fixtures">
          <span className={styles.groupLabel}>Fixtures</span>
        <button
          type="button"
          className={panel.button}
          title="Back to the fixture files: the cache (every dc) is emptied and Edge KV re-seeded; unsaved edits are lost"
          onClick={() => {
            if (window.confirm("Reset to the fixtures? Unsaved Edge KV edits and every cache entry are lost.")) void act(storage.reset);
          }}
        >
          Reset
        </button>
        <button type="button" className={`${panel.button} ${styles.primary}`} title="Write Edge KV to the fixture files (shows the diff first)" onClick={() => setSaving(true)}>
          Save…
        </button>
        </div>
      </div>
      {error && <p className={panel.error}>{error}</p>}
      {saving && <SaveFixtures onClose={() => setSaving(false)} />}

      <Tabs
        tabs={[
          { id: "kv", label: `Edge KV${snapshot ? ` (${snapshot.kv.length})` : ""}` },
          { id: "cache", label: `Cache${snapshot ? ` (${snapshot.cache.length})` : ""}` },
        ]}
        active={tab}
        onChange={setTab}
      />
      <div className={styles.content}>
        {!snapshot ? (
          !error && <p className={panel.empty}>Loading…</p>
        ) : tab === "kv" ? (
          <KvTab snapshot={snapshot} version={fetchedAt} act={act} />
        ) : (
          <CacheTab snapshot={snapshot} version={fetchedAt} fetchedAt={fetchedAt} dc={dc} setDc={setDc} act={act} />
        )}
      </div>
    </div>
  );
}
