/**
 * WebSocket Status Indicator
 *
 * Displays current WebSocket connection status with visual feedback
 */

import type { WebSocketStatus } from "../../hooks/useWebSocket";
import styles from "./ConnectionStatus.module.css";

export interface ConnectionStatusProps {
  status: WebSocketStatus;
}

export function ConnectionStatus({ status }: ConnectionStatusProps) {
  const getStatusClass = (): string => {
    if (status.connected) return styles.indicatorConnected;
    if (status.reconnecting) return styles.indicatorReconnecting;
    if (status.error) return styles.indicatorError;
    return styles.indicatorDisconnected;
  };

  const getStatusText = (): string => {
    if (status.connected) {
      return status.clientCount > 1
        ? `Connected (${status.clientCount} clients)`
        : "Connected";
    }
    if (status.reconnecting) return "Reconnecting...";
    if (status.error) return "Disconnected";
    return "Not connected";
  };

  return (
    <div className={styles.container}>
      <div
        className={`${styles.indicator} ${getStatusClass()}`}
        title={status.error || getStatusText()}
      />
      <span className={styles.text}>{getStatusText()}</span>
    </div>
  );
}
