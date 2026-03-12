import { ChangeEvent } from "react";
import styles from "./LogLevelSelector.module.css";

interface LogLevelSelectorProps {
  logLevel: number;
  onLogLevelChange: (level: number) => void;
}

export function LogLevelSelector({
  logLevel,
  onLogLevelChange,
}: LogLevelSelectorProps) {
  const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
    onLogLevelChange(parseInt(e.target.value, 10));
  };

  return (
    <div className={styles.logLevelSelector}>
      <label>Log Level:</label>
      <select value={logLevel} onChange={handleChange}>
        <option value="0">Trace (0)</option>
        <option value="1">Debug (1)</option>
        <option value="2">Info (2)</option>
        <option value="3">Warn (3)</option>
        <option value="4">Error (4)</option>
        <option value="5">Critical (5)</option>
      </select>
    </div>
  );
}
