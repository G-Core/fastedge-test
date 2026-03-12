import { CSSProperties } from "react";
import styles from "./Toggle.module.css";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  style?: CSSProperties;
  compact?: boolean;
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
  style,
  compact = false,
}: ToggleProps) {
  const toggleLabelClass = `${styles.toggleLabel} ${disabled ? styles.disabled : ""} ${compact ? styles.compact : ""}`;
  const toggleSwitchClass = `${styles.toggleSwitch} ${checked ? styles.checked : ""} ${disabled ? styles.disabled : ""} ${compact ? styles.compact : ""}`;

  return (
    <label className={toggleLabelClass} style={style}>
      {label && <span>{label}</span>}
      <div
        className={toggleSwitchClass}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) {
            onChange(!checked);
          }
        }}
      >
        <div className={styles.toggleSlider} />
      </div>
    </label>
  );
}
