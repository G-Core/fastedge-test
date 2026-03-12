import { useState, ReactNode } from "react";
import styles from "./CollapsiblePanel.module.css";

interface CollapsiblePanelProps {
  title: string;
  children: ReactNode;
  defaultExpanded?: boolean;
  headerExtra?: ReactNode;
}

export function CollapsiblePanel({
  title,
  children,
  defaultExpanded = true,
  headerExtra,
}: CollapsiblePanelProps) {
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);

  const arrowClass = `${styles.arrow} ${isExpanded ? styles.expanded : ""}`;

  return (
    <div className={styles.panel}>
      <div className={styles.header} onClick={() => setIsExpanded(!isExpanded)}>
        <h3 className={styles.title}>{title}</h3>
        <div className={styles.headerRight}>
          {headerExtra}
          <div className={arrowClass}></div>
        </div>
      </div>

      {isExpanded && <div className={styles.content}>{children}</div>}
    </div>
  );
}
