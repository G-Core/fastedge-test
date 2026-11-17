import { useEffect, useRef, useState } from "react";
import {
  CDN_HOOKS,
  resource,
  type CdnHook,
  type ResourceConfig,
  type ResourceHookResult,
  type ResourceHooks,
  type ResourceLoaded,
  type ResourceOrigin,
  type ResourceResult,
  type WorkspaceFiles,
} from "../../api";
import { useWorkspaceFiles } from "../../hooks/useWorkspaceFiles";
import { LogLevelSelector } from "../../components/common/LogLevelSelector";
import { HookDetail } from "../../components/proxy-wasm/HookStagesPanel";
import { OriginEditor } from "../../components/proxy-wasm/OriginEditor";
import { useAppStore } from "../../stores";
import type { HookResult } from "../../types";
import { JsonDisplay } from "../../components/common/JsonDisplay";
import { ResponsePanel } from "../../components/common/ResponsePanel";
import { StoreCallsList } from "../../components/common/StoreCallsList";
import panel from "../../components/common/StoresPanel/StoresPanel.module.css";
import explorer from "../StorageExplorerView/StorageExplorerView.module.css";
import styles from "./ResourceView.module.css";

export const DEFAULT_RESOURCE_FILE = ".fastedge-debug/fastedge-cdn-resource.test.json";
const NEW_CONFIG: ResourceConfig = { apps: {}, main: { hooks: {}, origin: { url: "built-in" } } };

/** `to` relative to the folder `from`; both workspace-relative and "/"-separated. */
export function relativePath(from: string, to: string): string {
  const a = from.split("/").filter((s) => s && s !== ".");
  const b = to.split("/").filter((s) => s && s !== ".");
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return [...a.slice(i).map(() => ".."), ...b.slice(i)].join("/") || ".";
}

interface ResourceViewProps {
  /** What the server has loaded (from any source: this page, an agent, the API), or null. */
  loaded: ResourceLoaded | null;
  /** The last request the loaded resource ran. */
  result: ResourceResult | null;
  onResult: (result: ResourceResult) => void;
  /** The Debugger has an app loaded (loading a resource replaces it). */
  appLoaded?: boolean;
}

/**
 * The Resource page: edit a resource file (apps, main, rules: which app runs each hook, and the
 * origin), save it, load it and send requests through it. The file is the source of truth: agents
 * and tests use the same file through the API.
 */
export function ResourceView({ loaded, result, onResult, appLoaded }: ResourceViewProps) {
  const [path, setPath] = useState(DEFAULT_RESOURCE_FILE);
  const [config, setConfig] = useState<ResourceConfig | null>(null);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const opened = useRef<string | null>(null);
  // Bumped on every open: the request section starts again from the file's `request`.
  const [openCount, setOpenCount] = useState(0);
  const [files, refreshFiles] = useWorkspaceFiles();
  const paths: PathSuggestions = { files, toPath: (p) => relativePath(resourceDir(files, path), p), onFocusPath: refreshFiles };

  const run = async (work: () => Promise<string | void>) => {
    setBusy(true);
    try {
      const text = await work();
      setMessage(text ? { error: false, text } : null);
    } catch (e) {
      setMessage({ error: true, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const open = (file: string) =>
    run(async () => {
      const read = await resource.read(file);
      opened.current = read.path;
      setPath(file);
      setConfig(read.config);
      setOpenCount((n) => n + 1);
      setDirty(false);
      return read.config ? undefined : `${read.path} does not exist yet: start a new resource and save it there.`;
    });

  useEffect(() => {
    void open(DEFAULT_RESOURCE_FILE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // An agent (or the API) loaded another file: show it, unless there are unsaved edits.
  useEffect(() => {
    if (loaded?.configPath && loaded.configPath !== opened.current && !dirty) void open(loaded.configPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded?.configPath]);

  const edit = (change: (draft: ResourceConfig) => void) => {
    const draft = structuredClone(config ?? NEW_CONFIG);
    change(draft);
    setConfig(draft);
    setDirty(true);
  };

  const save = () =>
    run(async () => {
      const saved = await resource.save(path, config!);
      opened.current = saved;
      setDirty(false);
      return `Saved ${saved}.`;
    });

  const saveAndLoad = () =>
    run(async () => {
      if (dirty || opened.current === null) opened.current = await resource.save(path, config!);
      setDirty(false);
      const result = await resource.load(path);
      return `Loaded ${result.apps.map((a) => a.name).join(", ")}.`;
    });

  const isLoaded = !!loaded && !!loaded.configPath && loaded.configPath === opened.current;
  const apps = Object.keys(config?.apps ?? {});

  return (
    <div className={explorer.page}>
      <div className={explorer.toolbar}>
        <div className={explorer.group}>
          <span className={explorer.groupLabel}>File</span>
          <input
            className={styles.path}
            aria-label="Resource file"
            value={path}
            list="rv-resource-files"
            onFocus={refreshFiles}
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void open(path)}
          />
          <button type="button" className={panel.button} disabled={busy} onClick={() => void open(path)}>
            Open
          </button>
          <button type="button" className={panel.button} disabled={busy || !config} onClick={() => void save()}>
            Save
          </button>
          <button type="button" className={`${panel.button} ${explorer.primary}`} disabled={busy || !config} onClick={() => void saveAndLoad()}>
            {dirty ? "Save and load" : "Load"}
          </button>
        </div>
        <span className={panel.note}>
          {dirty ? "Unsaved changes. " : ""}
          {isLoaded
            ? `Loaded: ${loaded!.apps.map((a) => `${a.name} (${a.wasmType})`).join(", ")}.`
            : loaded
              ? "Another resource is loaded."
              : appLoaded
                ? "Not loaded. Loading replaces the Debugger's single app."
                : "Not loaded."}
        </span>
      </div>

      {message && <p className={message.error ? panel.error : panel.note}>{message.text}</p>}
      <Suggestions files={files} resourcePath={path} />

      {!config ? (
        <div className={explorer.content}>
          <button type="button" className={panel.button} onClick={() => edit(() => {})}>
            New resource
          </button>
        </div>
      ) : (
        <>
          <AppsSection config={config} edit={edit} onFocusPath={refreshFiles} />
          <section className={styles.section}>
            <div className={explorer.sectionHeader}>
              <h4 className={explorer.sectionTitle}>Rules</h4>
              <span className={panel.note}>The first rule whose regex matches the request path applies; otherwise main.</span>
              <span className={panel.spacer} />
              <button type="button" className={panel.button} onClick={() => edit((c) => void (c.rules ??= []).push({ match: "^/" }))}>
                Add rule
              </button>
            </div>
            <RuleCard
              title="main"
              hooks={config.main.hooks ?? {}}
              origin={config.main.origin}
              apps={apps}
              onHooks={(hooks) => edit((c) => void (c.main.hooks = hooks))}
              onOrigin={(origin) => edit((c) => void (c.main.origin = origin!))}
              paths={paths}
            />
            {(config.rules ?? []).map((rule, i) => (
              <RuleCard
                key={i}
                title={`rule ${i + 1}`}
                rule={rule}
                hooks={rule.hooks}
                origin={rule.origin}
                apps={apps}
                onRule={(field, value) =>
                  edit((c) => {
                    if (field === "match") c.rules![i].match = value;
                    else if (value) c.rules![i].name = value;
                    else delete c.rules![i].name;
                  })
                }
                onHooks={(hooks) => edit((c) => void (c.rules![i].hooks = hooks))}
                onOrigin={(origin) => edit((c) => void (c.rules![i].origin = origin))}
                onMove={(by) => edit((c) => void c.rules!.splice(i + by, 0, ...c.rules!.splice(i, 1)))}
                onRemove={() => edit((c) => void c.rules!.splice(i, 1))}
                first={i === 0}
                last={i === config.rules!.length - 1}
                paths={paths}
              />
            ))}
          </section>
          <RequestSection key={openCount} config={config} enabled={isLoaded && !busy} onResult={onResult} setMessage={setMessage} />
          {result && isLoaded && <ResultSection result={result} />}
        </>
      )}
    </div>
  );
}

/** The path fields' dropdowns: workspace files, written relative to the resource file. */
/** The resource file's folder, workspace-relative ("" = the workspace root). */
function resourceDir(files: WorkspaceFiles | null, resourcePath: string): string {
  const fromRoot = files && resourcePath.startsWith(`${files.root}/`) ? resourcePath.slice(files.root.length + 1) : resourcePath;
  return fromRoot.includes("/") ? fromRoot.slice(0, fromRoot.lastIndexOf("/")) : "";
}

function Suggestions({ files, resourcePath }: { files: WorkspaceFiles | null; resourcePath: string }) {
  if (!files) return null;
  const dir = resourceDir(files, resourcePath);
  const list = (id: string, paths: string[], relative: boolean) => (
    <datalist id={id}>
      {paths.map((p) => (
        <option key={p} value={relative ? relativePath(dir, p) : p} />
      ))}
    </datalist>
  );
  return (
    <>
      {list("rv-resource-files", files.configs, false)}
      {list("rv-configs", files.configs, true)}
      {list("rv-wasm", files.wasm, true)}
      {list("rv-dotenv", files.dotenvDirs, true)}
    </>
  );
}

function AppsSection({ config, edit, onFocusPath }: { config: ResourceConfig; edit: (change: (draft: ResourceConfig) => void) => void; onFocusPath: () => void }) {
  const [name, setName] = useState("");
  const add = () => {
    if (!name || config.apps[name]) return;
    edit((c) => void (c.apps[name] = {}));
    setName("");
  };
  const remove = (app: string) =>
    edit((c) => {
      delete c.apps[app];
      // Hooks and origins that used it go back to off / main's.
      for (const target of [c.main, ...(c.rules ?? [])]) {
        for (const hook of CDN_HOOKS) if (target.hooks && appOf(target.hooks[hook]) === app) delete target.hooks[hook];
        if (target.origin && "app" in target.origin && target.origin.app === app) target.origin = target === c.main ? { url: "built-in" } : undefined;
      }
    });
  const set = (app: string, field: "config" | "wasm", value: string) =>
    edit((c) => {
      if (value) c.apps[app][field] = value;
      else delete c.apps[app][field];
    });

  return (
    <section className={styles.section}>
      <div className={explorer.sectionHeader}>
        <h4 className={explorer.sectionTitle}>Apps</h4>
        <span className={panel.note}>Paths are relative to the resource file; the fields suggest workspace files. A config is an app's fastedge-config.test.json (its wasm and dotenv); a wasm overrides it.</span>
      </div>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Config</th>
            <th>Wasm</th>
            <th>Dotenv</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {Object.entries(config.apps).map(([app, entry]) => (
            <tr key={app}>
              <td className={styles.mono}>{app}</td>
              <td>
                <input aria-label={`${app} config`} title={entry.config} list="rv-configs" onFocus={onFocusPath} value={entry.config ?? ""} placeholder="../app/fastedge-config.test.json" onChange={(e) => set(app, "config", e.target.value)} />
              </td>
              <td>
                <input aria-label={`${app} wasm`} title={entry.wasm} list="rv-wasm" onFocus={onFocusPath} value={entry.wasm ?? ""} placeholder="(from the config)" onChange={(e) => set(app, "wasm", e.target.value)} />
              </td>
              <td>
                <div className={styles.dotenv}>
                  <input
                    type="checkbox"
                    aria-label={`${app} dotenv`}
                    title="Override the config's dotenv: load .env files from this folder"
                    checked={entry.dotenv?.enabled ?? false}
                    onChange={(e) =>
                      edit((c) => {
                        if (e.target.checked) c.apps[app].dotenv = { enabled: true };
                        else delete c.apps[app].dotenv;
                      })
                    }
                  />
                  <input
                    aria-label={`${app} dotenv path`}
                    list="rv-dotenv"
                    onFocus={onFocusPath}
                    disabled={!entry.dotenv?.enabled}
                    value={entry.dotenv?.path ?? ""}
                    placeholder="(the resource file's folder)"
                    onChange={(e) => edit((c) => void (c.apps[app].dotenv = e.target.value ? { enabled: true, path: e.target.value } : { enabled: true }))}
                  />
                </div>
              </td>
              <td>
                <button type="button" className={panel.button} onClick={() => remove(app)}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className={explorer.row}>
        <input aria-label="New app name" placeholder="app name" value={name} onChange={(e) => setName(e.target.value.trim())} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button type="button" className={panel.button} disabled={!name || !!config.apps[name]} onClick={add}>
          Add app
        </button>
      </div>
    </section>
  );
}

const appOf = (hookApp: ResourceHooks[CdnHook]) => (typeof hookApp === "string" ? hookApp : hookApp?.app);

interface RuleCardProps {
  title: string;
  rule?: { name?: string; match: string };
  /** undefined (rules only): main's hooks apply. */
  hooks: ResourceHooks | undefined;
  /** undefined (rules only): main's origin applies. */
  origin: ResourceOrigin | undefined;
  apps: string[];
  onRule?: (field: "name" | "match", value: string) => void;
  onHooks: (hooks: ResourceHooks | undefined) => void;
  onOrigin: (origin: ResourceOrigin | undefined) => void;
  onMove?: (by: -1 | 1) => void;
  onRemove?: () => void;
  first?: boolean;
  last?: boolean;
  paths: PathSuggestions;
}

/** Workspace files for path fields, and how a workspace path is written in the resource file. */
type PathSuggestions = { files: WorkspaceFiles | null; toPath: (workspacePath: string) => string; onFocusPath: () => void };

function RuleCard({ title, rule, hooks, origin, apps, onRule, onHooks, onOrigin, onMove, onRemove, first, last, paths }: RuleCardProps) {
  const isRule = !!rule;

  return (
    <div className={styles.card} aria-label={title}>
      <div className={explorer.sectionHeader}>
        <span className={styles.cardTitle}>{title}</span>
        {isRule && (
          <>
            <input aria-label={`${title} name`} placeholder="name" value={rule.name ?? ""} onChange={(e) => onRule!("name", e.target.value)} />
            <span className={panel.note}>path matches</span>
            <input className={styles.match} aria-label={`${title} match`} value={rule.match} onChange={(e) => onRule!("match", e.target.value)} />
            <span className={panel.spacer} />
            <button type="button" className={panel.button} disabled={first} onClick={() => onMove!(-1)}>
              Up
            </button>
            <button type="button" className={panel.button} disabled={last} onClick={() => onMove!(1)}>
              Down
            </button>
            <button type="button" className={panel.button} onClick={onRemove}>
              Remove
            </button>
          </>
        )}
      </div>

      {isRule && (
        <label className={explorer.check}>
          <input type="checkbox" checked={hooks !== undefined} onChange={(e) => onHooks(e.target.checked ? {} : undefined)} />
          Own hooks (replace main's completely, as on the edge)
        </label>
      )}
      {hooks === undefined ? (
        <p className={panel.note}>main's hooks</p>
      ) : (
        <div className={styles.hooks}>
          {CDN_HOOKS.map((hook) => {
            const value = hooks[hook];
            const app = appOf(value);
            const interrupt = typeof value === "object" ? value.interruptOnError !== false : true;
            const set = (nextApp: string | undefined, nextInterrupt: boolean) => {
              // In flow order, as the file reads best.
              const next: ResourceHooks = {};
              for (const h of CDN_HOOKS) {
                const v = h === hook ? nextApp && (nextInterrupt ? nextApp : { app: nextApp, interruptOnError: false }) : hooks[h];
                if (v) next[h] = v;
              }
              onHooks(next);
            };
            return (
              <div key={hook} className={styles.hook}>
                <span className={styles.mono}>{hook}</span>
                <select aria-label={`${title} ${hook}`} value={app ?? ""} onChange={(e) => set(e.target.value || undefined, interrupt)}>
                  <option value="">off</option>
                  {apps.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
                <label className={explorer.check} title="On a hook error the request ends with 531; unticked, it goes on as if the hook had not run">
                  <input type="checkbox" disabled={!app} checked={interrupt} onChange={(e) => set(app, e.target.checked)} />
                  interrupt on error
                </label>
              </div>
            );
          })}
        </div>
      )}

      <OriginEditor
        label={`${title} origin`}
        value={origin}
        onChange={onOrigin}
        unsetLabel={isRule ? "main's" : undefined}
        apps={apps}
        echoControls={<p className={panel.note}>Status and body follow the request's x-debugger-status / x-debugger-content headers (deprecated: use a fixed response).</p>}
        {...paths}
      />
    </div>
  );
}

function RequestSection({
  config,
  enabled,
  onResult,
  setMessage,
}: {
  config: ResourceConfig;
  enabled: boolean;
  onResult: (result: ResourceResult) => void;
  setMessage: (m: { error: boolean; text: string } | null) => void;
}) {
  const [method, setMethod] = useState(config.request?.method ?? "GET");
  const [url, setUrl] = useState(config.request?.url ?? "https://example.com/");
  const [headers, setHeaders] = useState(
    Object.entries(config.request?.headers ?? {}).map(([k, v]) => `${k}: ${v}`).join("\n"),
  );
  const [body, setBody] = useState(config.request?.body ?? "");
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    try {
      const parsed = Object.fromEntries(
        headers.split("\n").filter((l) => l.includes(":")).map((l) => [l.slice(0, l.indexOf(":")).trim(), l.slice(l.indexOf(":") + 1).trim()]),
      );
      onResult(await resource.send({ url, method, headers: parsed, body }));
      setMessage(null);
    } catch (e) {
      setMessage({ error: true, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSending(false);
    }
  };

  return (
    <section className={styles.section}>
      <div className={explorer.sectionHeader}>
        <h4 className={explorer.sectionTitle}>Request</h4>
        {!enabled && <span className={panel.note}>Load the resource to send requests through it.</span>}
      </div>
      <div className={explorer.row}>
        <select aria-label="Method" value={method} onChange={(e) => setMethod(e.target.value)}>
          {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <input className={styles.url} aria-label="URL" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && enabled && void send()} />
        <button type="button" className={`${panel.button} ${explorer.primary}`} disabled={!enabled || sending} onClick={() => void send()}>
          Send
        </button>
      </div>
      <div className={styles.split}>
        <textarea aria-label="Headers" rows={3} placeholder="name: value (one per line)" value={headers} onChange={(e) => setHeaders(e.target.value)} />
        <textarea aria-label="Body" rows={3} placeholder="body" value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
    </section>
  );
}

type Step = CdnHook | "origin";
const STEPS: Step[] = ["onRequestHeaders", "onRequestBody", "origin", "onResponseHeaders", "onResponseBody"];

/** The Debugger's hook result shape, so the resource view reuses its hook detail panel. */
function asHookResult(r: ResourceHookResult): HookResult {
  return {
    logs: r.logs,
    storeCalls: r.storeCalls,
    returnValue: r.returnCode ?? undefined,
    error: r.returnCode === null ? "The hook failed (see the logs)." : undefined,
    input: r.input,
    output: r.output,
  };
}

type Chip = { step: Step; status: string; kind: "ran" | "error" | "skipped" };
type Group = { label: string; chips: Chip[] };

/** The flow's steps in order, consecutive steps of one app in one group. */
function flowGroups(result: ResourceResult): Group[] {
  const groups: Group[] = [];
  for (const step of STEPS) {
    let label: string;
    let chip: Chip;
    if (step === "origin") {
      const o = result.origin;
      label = o ? `origin: ${o.kind === "app" ? o.app : o.kind}` : "origin";
      chip = o ? { step, status: String(o.response.status), kind: "ran" } : { step, status: "not reached", kind: "skipped" };
    } else {
      const ran = result.hooks[step];
      label = ran ? ran.app : "not run";
      const r = ran?.result;
      chip = !r
        ? { step, status: "—", kind: "skipped" }
        : r.returnCode === null
          ? { step, status: "error", kind: "error" }
          : r.localResponse
            ? { step, status: `sent ${r.localResponse.status}`, kind: "ran" }
            : { step, status: r.returnCode === 1 ? "paused" : "continue", kind: "ran" };
    }
    const last = groups[groups.length - 1];
    if (last && last.label === label && step !== "origin" && last.chips[0].step !== "origin") last.chips.push(chip);
    else groups.push({ label, chips: [chip] });
  }
  return groups;
}

function ResultSection({ result }: { result: ResourceResult }) {
  const [selected, setSelected] = useState<Step>("onRequestHeaders");
  const { logLevel, setLogLevel } = useAppStore();
  const hook = selected !== "origin" ? result.hooks[selected] : undefined;

  return (
    <section className={styles.section}>
      <div className={explorer.sectionHeader}>
        <h4 className={explorer.sectionTitle}>Result</h4>
        <span className={panel.note}>
          {result.rule ? `rule ${result.rule.index + 1}${result.rule.name ? ` (${result.rule.name})` : ""}: ${result.rule.match}` : "main"}
        </span>
        <span className={panel.spacer} />
        <LogLevelSelector logLevel={logLevel} onLogLevelChange={setLogLevel} />
      </div>
      <div className={styles.flow} role="tablist" aria-label="Flow">
        {flowGroups(result).map((group, g) => (
          <div key={g} className={styles.group} aria-label={group.label}>
            <span className={`${styles.groupLabel} ${styles.mono}`}>{group.label}</span>
            <div className={styles.groupChips}>
              {group.chips.map((c) => (
                <button
                  key={c.step}
                  type="button"
                  role="tab"
                  aria-selected={selected === c.step}
                  className={`${styles.step} ${styles[c.kind]} ${selected === c.step ? styles.selectedStep : ""}`}
                  onClick={() => setSelected(c.step)}
                >
                  <span className={styles.mono}>{c.step}</span>
                  <span className={styles.status}>{c.status}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className={styles.detail}>
        {selected === "origin" ? (
          result.origin ? (
            <>
              <JsonDisplay data={{ status: result.origin.response.status, headers: result.origin.response.headers }} title="Origin response" />
              <StoreCallsList calls={result.origin.storeCalls} source="origin" />
            </>
          ) : (
            <p className={panel.empty}>A request hook answered, so the origin was not called.</p>
          )
        ) : !hook ? (
          <p className={panel.empty}>No app on this hook, or the request ended before it.</p>
        ) : (
          <>
            <p className={panel.note}>
              App <span className={styles.mono}>{hook.app}</span>
              {hook.result.customProperties?.length ? `; custom properties set so far: ${hook.result.customProperties.join(", ")}` : ""}
            </p>
            <HookDetail key={selected} hook={selected} results={{ [selected]: asHookResult(hook.result) }} logLevel={logLevel} />
          </>
        )}
      </div>

      <ResponsePanel response={result.finalResponse} />
    </section>
  );
}
