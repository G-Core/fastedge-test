import { useMemo, useState } from "react";
import { computeJsonDiff } from "../../../utils/diff";
import styles from "./JsonDisplay.module.css";

interface JsonDisplayProps {
  data: unknown;
  compareWith?: unknown;
  title?: string;
  style?: React.CSSProperties;
}

/** Content above this many lines or characters starts collapsed to a short preview. */
const LARGE_LINES = 40;
const LARGE_CHARS = 4000;

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

  const size = useMemo(
    () =>
      diffLines
        ? { lines: diffLines.length, chars: diffLines.reduce((n, l) => n + l.content.length, 0) }
        : textSize(formattedData),
    [diffLines, formattedData],
  );

  // If we have diff lines, render diff view
  if (diffLines) {
    return (
      <div>
        {title && <h4 className={styles.title}>{title}</h4>}
        <CollapsiblePre size={size} className={styles.container} style={containerStyle}>
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
        </CollapsiblePre>
      </div>
    );
  }

  // No diff, render regular JSON
  return (
    <div>
      {title && <h4 className={styles.title}>{title}</h4>}
      <CollapsiblePre size={size} className={styles.container} style={containerStyle}>
        {formattedData}
      </CollapsiblePre>
    </div>
  );
}

export function textSize(text: string): { lines: number; chars: number } {
  return { lines: text.split("\n").length, chars: text.length };
}

/**
 * A `<pre>` that starts as a short preview when its content is large, with "Show all" / "Show
 * less". `size` is the content's lines and characters (`textSize` for plain text).
 */
export function CollapsiblePre({
  size,
  className,
  style,
  children,
}: {
  size: { lines: number; chars: number };
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const large = size.lines > LARGE_LINES || size.chars > LARGE_CHARS;
  return (
    <>
      <pre className={`${className ?? ""} ${large && !expanded ? styles.collapsed : ""}`} style={style}>
        {children}
      </pre>
      {large && (
        <button type="button" className={styles.toggle} onClick={() => setExpanded(!expanded)}>
          {expanded ? "Show less" : `Show all (${size.lines.toLocaleString()} lines, ${formatChars(size.chars)})`}
        </button>
      )}
    </>
  );
}

function formatChars(n: number): string {
  return n < 1024 ? `${n} chars` : `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
}
