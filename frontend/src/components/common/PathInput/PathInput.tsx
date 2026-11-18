import { useRef, useState, type InputHTMLAttributes, type KeyboardEvent } from "react";
import styles from "./PathInput.module.css";

/** A path to offer: `value` is what the field gets; `outside` puts it under "Allowed folders". */
export type PathSuggestion = { value: string; outside: boolean };

const isAbsolute = (p: string) => /^([\\/]|[A-Za-z]:)/.test(p);

/**
 * Suggestions from the server's listing (workspace-relative paths, then approved allowed folders'
 * absolute ones), each written as the field needs it.
 */
export function suggestions(paths: string[] | undefined, toPath: (p: string) => string = (p) => p): PathSuggestion[] {
  return (paths ?? []).map((p) => ({ value: toPath(p), outside: isAbsolute(p) }));
}

type PathInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "list"> & {
  value: string;
  onChange: (value: string) => void;
  suggestions: PathSuggestion[];
};

/**
 * A text field with a path dropdown. Replaces `<datalist>`, whose native popup cuts long paths off
 * at a fixed width: this one wraps them, so the end of the path (the part that differs) shows.
 * Opening shows every suggestion; typing filters them (every word, any case).
 */
export function PathInput({ value, onChange, suggestions: all, onFocus, onBlur, onKeyDown, className, ...input }: PathInputProps) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(false);
  const [active, setActive] = useState(-1);
  const field = useRef<HTMLInputElement>(null);

  const words = typed ? value.toLowerCase().split(/\s+/).filter(Boolean) : [];
  const shown = all.filter((s) => words.every((w) => s.value.toLowerCase().includes(w)));
  const groups = [
    { title: "Workspace", items: shown.filter((s) => !s.outside) },
    { title: "Allowed folders", items: shown.filter((s) => s.outside) },
  ].filter((g) => g.items.length);
  const ordered = groups.flatMap((g) => g.items);
  const visible = open && ordered.length > 0;
  const rect = visible ? field.current?.getBoundingClientRect() : undefined;

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setTyped(false);
  };

  const keys = (e: KeyboardEvent<HTMLInputElement>) => {
    if (visible && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + ordered.length) % ordered.length);
      return;
    }
    if (visible && e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(ordered[active].value);
      return;
    }
    if (e.key === "Escape") setOpen(false);
    else if (e.key === "ArrowDown") setOpen(true);
    onKeyDown?.(e);
  };

  return (
    <>
      <input
        {...input}
        ref={field}
        className={className}
        value={value}
        role="combobox"
        aria-expanded={visible}
        aria-autocomplete="list"
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setTyped(true);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={(e) => {
          setOpen(true);
          setTyped(false);
          setActive(-1);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setOpen(false);
          onBlur?.(e);
        }}
        onKeyDown={keys}
      />
      {visible && rect && (
        // Fixed, so a table cell or a scrolling panel does not clip it.
        <div
          role="listbox"
          className={styles.list}
          style={{ top: rect.bottom + 2, left: rect.left, minWidth: rect.width }}
          // Keep focus in the field, so picking does not blur (and close) first.
          onMouseDown={(e) => e.preventDefault()}
        >
          {groups.map((g) => (
            <div key={g.title}>
              <div className={styles.heading}>{g.title}</div>
              {g.items.map((s) => {
                const index = ordered.indexOf(s);
                return (
                  <div
                    key={s.value}
                    role="option"
                    aria-selected={index === active}
                    className={index === active ? `${styles.option} ${styles.active}` : styles.option}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => pick(s.value)}
                  >
                    {s.value}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
