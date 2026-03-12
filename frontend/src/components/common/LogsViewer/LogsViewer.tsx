import styles from "./LogsViewer.module.css";

interface LogEntry {
  level: number;
  message: string;
}

interface LogsViewerProps {
  logs: LogEntry[];
  logLevel: number;
}

const LOG_LEVEL_NAMES = ["TRACE", "DEBUG", "INFO", "WARN", "ERROR", "CRITICAL"];

const LOG_LEVEL_COLORS: Record<number, string> = {
  0: styles.trace,   // gray
  1: styles.debug,   // blue
  2: styles.info,    // green
  3: styles.warn,    // yellow
  4: styles.error,   // red
  5: styles.critical // red + bold
};

export function LogsViewer({
  logs,
  logLevel
}: LogsViewerProps) {

  /**
   * Filter logs by selected log level
   * Only show logs with level >= selected level
   */
  const filterLogs = (logs: LogEntry[], minLevel: number): LogEntry[] => {
    return logs.filter((log) => log.level >= minLevel);
  };

  /**
   * Get log level name for display
   */
  const getLogLevelName = (level: number): string => {
    return LOG_LEVEL_NAMES[level] || "UNKNOWN";
  };

  const filteredLogs = filterLogs(logs, logLevel);

  // Empty state
  if (logs.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p>No logs captured</p>
      </div>
    );
  }

  return (
    <div className={styles.logsViewer}>
      <pre className={styles.logsContainer}>
        {filteredLogs.length > 0 ? (
          filteredLogs.map((log, idx) => {
            const colorClass = LOG_LEVEL_COLORS[log.level] || styles.trace;
            return (
              <div key={idx} className={styles.logEntry}>
                <span className={`${styles.logLevel} ${colorClass}`}>
                  [{getLogLevelName(log.level)}]
                </span>
                <span className={styles.logMessage}>{log.message}</span>
              </div>
            );
          })
        ) : (
          <div className={styles.noLogs}>
            No logs at this level. Lower the log level to see more output.
          </div>
        )}
      </pre>
    </div>
  );
}
