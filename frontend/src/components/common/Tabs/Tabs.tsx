import type { ReactNode } from "react";
import styles from "./Tabs.module.css";

export type TabItem<T extends string> = { id: T; label: ReactNode };

interface TabsProps<T extends string> {
  tabs: TabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  /** `main`: a panel's tab row (orange when active). `sub`: a nested row (smaller, uppercase). */
  variant?: "main" | "sub";
  /** Layout of the row (background, padding, flex) from the parent. */
  className?: string;
}

/** The one tab row of the debugger UI: Request, Response, hook and logging tabs. */
export function Tabs<T extends string>({ tabs, active, onChange, variant = "main", className }: TabsProps<T>) {
  return (
    <div role="tablist" className={`${styles.list} ${className ?? ""}`}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === active}
          className={`${styles.tab} ${styles[variant]} ${tab.id === active ? styles.active : ""}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
