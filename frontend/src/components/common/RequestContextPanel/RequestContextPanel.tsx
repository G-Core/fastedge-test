import { useEffect, useState, type ReactNode } from "react";
import { CollapsiblePanel } from "../CollapsiblePanel";
import { getRequestContextPresets } from "../../../api";
import type { ClientContext, EdgeContext, Preset } from "../../../stores/types";
import styles from "./RequestContextPanel.module.css";

type Presets = Awaited<ReturnType<typeof getRequestContextPresets>>;
type Context = { preset?: Preset } & Record<string, string | undefined>;
/** `blur`: the field applies on blur / Enter, not per keystroke (the edge dc reloads the app). */
type Field = { key: string; label: string; apply?: "blur" };

export const FLAGS: Record<Preset, string> = { de: "🇩🇪", nl: "🇳🇱", us: "🇺🇸" };

const CLIENT_FIELDS: Field[] = [
  { key: "ip", label: "IP" },
  { key: "asn", label: "ASN" },
  { key: "country", label: "Country code" },
  { key: "countryName", label: "Country name" },
  { key: "city", label: "City" },
  { key: "region", label: "Region" },
  { key: "continent", label: "Continent" },
  { key: "lat", label: "Latitude" },
  { key: "long", label: "Longitude" },
];

const EDGE_FIELDS: Field[] = [
  { key: "dc", label: "dc (cache bucket)", apply: "blur" },
  { key: "hostname", label: "Hostname" },
  { key: "region", label: "Region" },
  { key: "country", label: "Country" },
  { key: "city", label: "City" },
];

const POP_FIELDS: Field[] = [
  { key: "popCity", label: "pop-city" },
  { key: "popReg", label: "pop-reg" },
  { key: "popCountryCode", label: "pop-country-code" },
  { key: "popCountryName", label: "pop-country-name" },
  { key: "popContinent", label: "pop-continent" },
  { key: "popLat", label: "pop-lat" },
  { key: "popLong", label: "pop-long" },
];

/** A field input; with `onBlurOnly` it keeps a draft and applies it on blur or Enter. */
function FieldInput({
  value,
  placeholder,
  overridden,
  onBlurOnly,
  onChange,
}: {
  value: string;
  placeholder: string;
  overridden: boolean;
  onBlurOnly: boolean;
  onChange: (text: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null); // null = not editing
  const commit = () => {
    if (draft !== null && draft !== value) onChange(draft);
    setDraft(null);
  };
  return (
    <input
      className={overridden ? styles.overridden : undefined}
      value={draft ?? value}
      placeholder={placeholder}
      title={overridden ? "Overrides the preset" : onBlurOnly ? "Applies when you leave the field or press Enter" : undefined}
      onChange={(e) => (onBlurOnly ? setDraft(e.target.value) : onChange(e.target.value))}
      onBlur={onBlurOnly ? commit : undefined}
      onKeyDown={
        onBlurOnly
          ? (e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") setDraft(null);
            }
          : undefined
      }
    />
  );
}

interface ContextSectionProps {
  title: string;
  hint: ReactNode;
  value: Context | null;
  presets: Record<Preset, Record<string, string>> | null;
  fields: Field[];
  /** Preset button sub-label (the edge shows its city). */
  sublabel?: (preset: Preset) => string | undefined;
  onChange: (value: Context | null) => void;
}

/** Preset buttons ("None" or a preset) and the fields: the preset's value, or an override. */
function ContextSection({ title, hint, value, presets, fields, sublabel, onChange }: ContextSectionProps) {
  const base = value?.preset && presets ? presets[value.preset] : {};

  const setField = (key: string, text: string) => {
    const next: Context = { ...(value ?? {}) };
    if (text === (base[key] ?? "")) delete next[key];
    else next[key] = text;
    onChange(next);
  };

  return (
    <div className={styles.section}>
      <h4 className={styles.sectionTitle}>{title}</h4>
      <p className={styles.hint}>{hint}</p>
      <div className={styles.presets} role="radiogroup" aria-label={`${title} preset`}>
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          className={`${styles.preset} ${value === null ? styles.active : ""}`}
          onClick={() => onChange(null)}
        >
          None
        </button>
        {(Object.keys(FLAGS) as Preset[]).map((preset) => (
          <button
            key={preset}
            type="button"
            role="radio"
            aria-checked={value?.preset === preset}
            className={`${styles.preset} ${value?.preset === preset ? styles.active : ""}`}
            // A new preset starts clean: overrides belong to the preset they were made on.
            onClick={() => onChange({ preset })}
          >
            <span className={styles.flag} aria-hidden="true">{FLAGS[preset]}</span>
            <span>
              {preset.toUpperCase()}
              {sublabel?.(preset) && <span className={styles.presetSub}>{sublabel(preset)}</span>}
            </span>
          </button>
        ))}
        {value !== null && !value.preset && (
          <button type="button" role="radio" aria-checked className={`${styles.preset} ${styles.active}`}>
            Custom
          </button>
        )}
      </div>
      {value !== null && (
        <div className={styles.fields}>
          {fields.map(({ key, label, apply }) => (
            <label key={key} className={styles.field}>
              {label}
              <FieldInput
                value={value[key] ?? base[key] ?? ""}
                placeholder={base[key] ?? ""}
                overridden={value[key] !== undefined}
                onBlurOnly={apply === "blur"}
                onChange={(text) => setField(key, text)}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

interface RequestContextPanelProps {
  appType: "proxy-wasm" | "http-wasm";
  client: ClientContext | null;
  edge: EdgeContext | null;
  onClientChange: (client: ClientContext | null) => void;
  onEdgeChange: (edge: EdgeContext | null) => void;
  /** Extra sections (CDN apps: origin, raw properties). */
  children?: ReactNode;
}

/**
 * Request context: where the client is, which edge POP runs the app, and (CDN apps) the origin.
 * Presets fill the fields; an edited field overrides its preset value. Explicit request headers
 * and properties still win over everything here.
 */
export function RequestContextPanel({
  appType,
  client,
  edge,
  onClientChange,
  onEdgeChange,
  children,
}: RequestContextPanelProps) {
  const [presets, setPresets] = useState<Presets | null>(null);

  useEffect(() => {
    getRequestContextPresets()
      .then(setPresets)
      .catch(() => setPresets(null)); // fields still work, without preset values
  }, []);

  const cdn = appType === "proxy-wasm";

  return (
    <CollapsiblePanel title="Request Context" defaultExpanded={false}>
      <ContextSection
        title="Client"
        hint={
          cdn ? (
            <>Sets the <code>request.*</code> geo properties and the <code>GeoIP-*</code> / <code>X-Real-IP</code> headers.</>
          ) : (
            <>Sets the <code>geoip-*</code> and <code>x-real-ip</code> request headers.</>
          )
        }
        value={client as Context | null}
        presets={presets?.client ?? null}
        fields={CLIENT_FIELDS}
        sublabel={(p) => presets?.client[p].city}
        onChange={(v) => onClientChange(v as ClientContext | null)}
      />
      <ContextSection
        title="Edge"
        hint={
          cdn ? (
            <>Sets the dictionary keys (<code>dc</code>, <code>region</code>, <code>country</code>, <code>city</code>, <code>hostname</code>) and <code>X-ID</code>. Its <code>dc</code> is the cache bucket.</>
          ) : (
            <>Sets the <code>dc</code> and <code>pop-*</code> request headers. Its <code>dc</code> is the cache bucket.</>
          )
        }
        value={edge as Context | null}
        presets={presets?.edge ?? null}
        fields={cdn ? EDGE_FIELDS : [...EDGE_FIELDS.filter((f) => f.key === "dc"), ...POP_FIELDS]}
        sublabel={(p) => (presets ? `${presets.edge[p].city} (${presets.edge[p].dc})` : undefined)}
        onChange={(v) => onEdgeChange(v as EdgeContext | null)}
      />
      {children}
    </CollapsiblePanel>
  );
}
