export type DiffLine = {
  type: "added" | "removed" | "unchanged";
  content: string;
  lineNumber?: number;
};

/**
 * Check if a value is a plain object (not array, not null)
 */
export function isPlainObject(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Compute diff between two data values
 * For objects, uses object-level diffing; otherwise falls back to line-by-line
 */
export function computeJsonDiff(
  before: unknown,
  after: unknown,
): DiffLine[] | null {
  try {
    // For objects, use object-level diffing for better results
    if (isPlainObject(before) && isPlainObject(after)) {
      return computeObjectDiff(
        before as Record<string, unknown>,
        after as Record<string, unknown>,
      );
    }

    // For other types (strings, arrays, etc.), fall back to line-by-line
    const beforeStr = JSON.stringify(before, null, 2);
    const afterStr = JSON.stringify(after, null, 2);

    const beforeLines = beforeStr.split("\n");
    const afterLines = afterStr.split("\n");

    return computeLineDiff(beforeLines, afterLines);
  } catch {
    return null;
  }
}

/**
 * Simple line-by-line diff algorithm using LCS
 * This is a basic implementation - for production you might want to use a library like diff-match-patch
 */
function computeLineDiff(
  beforeLines: string[],
  afterLines: string[],
): DiffLine[] {
  const result: DiffLine[] = [];

  // Use a simple LCS (Longest Common Subsequence) approach
  const lcs = findLCS(beforeLines, afterLines);

  let beforeIdx = 0;
  let afterIdx = 0;
  let lcsIdx = 0;

  while (beforeIdx < beforeLines.length || afterIdx < afterLines.length) {
    const beforeLine = beforeLines[beforeIdx];
    const afterLine = afterLines[afterIdx];
    const lcsLine = lcs[lcsIdx];

    // Both match the LCS - unchanged line
    if (
      beforeLine === lcsLine &&
      afterLine === lcsLine &&
      lcsIdx < lcs.length
    ) {
      result.push({
        type: "unchanged",
        content: beforeLine,
      });
      beforeIdx++;
      afterIdx++;
      lcsIdx++;
    }
    // Before line doesn't match - it was removed
    else if (beforeIdx < beforeLines.length && beforeLine !== lcsLine) {
      result.push({
        type: "removed",
        content: beforeLine,
      });
      beforeIdx++;
    }
    // After line doesn't match - it was added
    else if (afterIdx < afterLines.length && afterLine !== lcsLine) {
      result.push({
        type: "added",
        content: afterLine,
      });
      afterIdx++;
    }
    // Edge case: we've exhausted LCS
    else {
      if (beforeIdx < beforeLines.length) {
        result.push({
          type: "removed",
          content: beforeLines[beforeIdx],
        });
        beforeIdx++;
      }
      if (afterIdx < afterLines.length) {
        result.push({
          type: "added",
          content: afterLines[afterIdx],
        });
        afterIdx++;
      }
    }
  }

  return result;
}

/**
 * Find Longest Common Subsequence of lines
 * This helps identify which lines are unchanged between two versions
 */
function findLCS(a: string[], b: string[]): string[] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array(m + 1)
    .fill(0)
    .map(() => Array(n + 1).fill(0));

  // Build the LCS length table
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find the actual LCS
  const lcs: string[] = [];
  let i = m;
  let j = n;

  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      lcs.unshift(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return lcs;
}

/**
 * Compute object-level diff for better JSON comparison
 * This avoids the trailing comma issue with line-by-line diffing
 */
function computeObjectDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): DiffLine[] {
  const result: DiffLine[] = [];
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const sortedKeys = Array.from(allKeys).sort();

  result.push({ type: "unchanged", content: "{" });

  sortedKeys.forEach((key, index) => {
    const inBefore = key in before;
    const inAfter = key in after;
    const isLast = index === sortedKeys.length - 1;
    const comma = isLast ? "" : ",";

    const beforeValue = before[key];
    const afterValue = after[key];

    // Format the value for display with proper indentation
    const formatValue = (val: unknown, indent: string = "  "): string[] => {
      if (val === null) {
        return ["null"];
      }
      if (val === undefined) {
        return ["undefined"];
      }
      if (typeof val === "string") {
        // Try to parse if it looks like JSON
        if ((val.startsWith("{") || val.startsWith("[")) && val.length > 2) {
          try {
            const parsed = JSON.parse(val);
            const lines = JSON.stringify(parsed, null, 2).split("\n");
            return lines.map((line, idx) =>
              idx === 0 ? line : indent + "  " + line,
            );
          } catch {
            // Not valid JSON, return as string
          }
        }
        return [JSON.stringify(val)];
      }
      if (typeof val === "object") {
        // For nested objects/arrays, format with indentation
        const lines = JSON.stringify(val, null, 2).split("\n");
        return lines.map((line, idx) =>
          idx === 0 ? line : indent + "  " + line,
        );
      }
      return [String(val)];
    };

    if (!inBefore && inAfter) {
      // Key was added
      const formattedLines = formatValue(afterValue);
      if (formattedLines.length === 1) {
        result.push({
          type: "added",
          content: `  "${key}": ${formattedLines[0]}${comma}`,
        });
      } else {
        // Multi-line value
        result.push({
          type: "added",
          content: `  "${key}": ${formattedLines[0]}`,
        });
        formattedLines.slice(1, -1).forEach((line) => {
          result.push({
            type: "added",
            content: line,
          });
        });
        result.push({
          type: "added",
          content: formattedLines[formattedLines.length - 1] + comma,
        });
      }
    } else if (inBefore && !inAfter) {
      // Key was removed
      const formattedLines = formatValue(beforeValue);
      if (formattedLines.length === 1) {
        result.push({
          type: "removed",
          content: `  "${key}": ${formattedLines[0]}${comma}`,
        });
      } else {
        // Multi-line value
        result.push({
          type: "removed",
          content: `  "${key}": ${formattedLines[0]}`,
        });
        formattedLines.slice(1, -1).forEach((line) => {
          result.push({
            type: "removed",
            content: line,
          });
        });
        result.push({
          type: "removed",
          content: formattedLines[formattedLines.length - 1] + comma,
        });
      }
    } else {
      // Key exists in both - check if value changed
      const beforeStr = JSON.stringify(beforeValue);
      const afterStr = JSON.stringify(afterValue);

      if (beforeStr === afterStr) {
        // Value unchanged
        const formattedLines = formatValue(afterValue);
        if (formattedLines.length === 1) {
          result.push({
            type: "unchanged",
            content: `  "${key}": ${formattedLines[0]}${comma}`,
          });
        } else {
          // Multi-line value
          result.push({
            type: "unchanged",
            content: `  "${key}": ${formattedLines[0]}`,
          });
          formattedLines.slice(1, -1).forEach((line) => {
            result.push({
              type: "unchanged",
              content: line,
            });
          });
          result.push({
            type: "unchanged",
            content: formattedLines[formattedLines.length - 1] + comma,
          });
        }
      } else {
        // Value changed - show both (removed then added)
        const beforeLines = formatValue(beforeValue);
        if (beforeLines.length === 1) {
          result.push({
            type: "removed",
            content: `  "${key}": ${beforeLines[0]}${comma}`,
          });
        } else {
          result.push({
            type: "removed",
            content: `  "${key}": ${beforeLines[0]}`,
          });
          beforeLines.slice(1, -1).forEach((line) => {
            result.push({
              type: "removed",
              content: line,
            });
          });
          result.push({
            type: "removed",
            content: beforeLines[beforeLines.length - 1] + comma,
          });
        }

        const afterLines = formatValue(afterValue);
        if (afterLines.length === 1) {
          result.push({
            type: "added",
            content: `  "${key}": ${afterLines[0]}${comma}`,
          });
        } else {
          result.push({
            type: "added",
            content: `  "${key}": ${afterLines[0]}`,
          });
          afterLines.slice(1, -1).forEach((line) => {
            result.push({
              type: "added",
              content: line,
            });
          });
          result.push({
            type: "added",
            content: afterLines[afterLines.length - 1] + comma,
          });
        }
      }
    }
  });

  result.push({ type: "unchanged", content: "}" });

  return result;
}
