import { useMemo } from "react";
import { computeJsonDiff, type DiffLine } from "../../../utils/diff";
import styles from "./JsonDisplay.module.css";

interface JsonDisplayProps {
  data: unknown;
  compareWith?: unknown;
  title?: string;
  style?: React.CSSProperties;
}

/**
 * JsonDisplay component renders prettified JSON with optional diff view.
 * When compareWith is provided, shows a git-style diff with added (green) and removed (red) lines.
 */
export function JsonDisplay({
  data,
  compareWith,
  title,
  style = {},
}: JsonDisplayProps) {
  const diffLines = useMemo(() => {
    if (!compareWith) {
      return null;
    }

    return computeJsonDiff(compareWith, data);
  }, [data, compareWith]);

  const formattedData = useMemo(() => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }, [data]);

  const containerStyle = {
    ...style,
  };

  // If we have diff lines, render diff view
  if (diffLines) {
    return (
      <div>
        {title && <h4 className={styles.title}>{title}</h4>}
        <pre className={styles.container} style={containerStyle}>
          {diffLines.map((line, idx) => {
            let lineClass = styles.diffLine;
            let prefix = " ";

            if (line.type === "added") {
              lineClass = `${styles.diffLine} ${styles.diffLineAdded}`;
              prefix = "+";
            } else if (line.type === "removed") {
              lineClass = `${styles.diffLine} ${styles.diffLineRemoved}`;
              prefix = "-";
            }

            return (
              <div key={idx} className={lineClass}>
                <span className={styles.diffPrefix}>{prefix}</span>
                <span>{line.content}</span>
              </div>
            );
          })}
        </pre>
      </div>
    );
  }

  // No diff, render regular JSON
  return (
    <div>
      {title && <h4 className={styles.title}>{title}</h4>}
      <pre className={styles.container} style={containerStyle}>
        {formattedData}
      </pre>
    </div>
  );
}
