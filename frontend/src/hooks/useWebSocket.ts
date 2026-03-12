/**
 * WebSocket Hook
 *
 * Manages WebSocket connection, automatic reconnection, and event handling
 * Single responsibility: Provide real-time server updates to React components
 */

import { useEffect, useRef, useState, useCallback } from "react";
import type { ServerEvent } from "./websocket-types";

export interface WebSocketStatus {
  connected: boolean;
  reconnecting: boolean;
  clientCount: number;
  error: string | null;
}

export interface UseWebSocketOptions {
  url?: string;
  autoConnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  onEvent?: (event: ServerEvent) => void;
  debug?: boolean;
}

export interface UseWebSocketReturn {
  status: WebSocketStatus;
  lastEvent: ServerEvent | null;
  connect: () => void;
  disconnect: () => void;
  send: (data: any) => void;
}

/**
 * Custom hook for WebSocket connection with automatic reconnection
 */
export function useWebSocket(
  options: UseWebSocketOptions = {},
): UseWebSocketReturn {
  // Construct WebSocket URL - handle both dev (with port) and production (without)
  const defaultUrl = (() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    // Use 127.0.0.1 instead of localhost to avoid IPv6 timeout issues
    const hostname =
      window.location.hostname === "localhost"
        ? "127.0.0.1"
        : window.location.hostname;

    // In dev mode (Vite on 5173), proxy handles routing to 5179
    // In production (Express on 5179), connect directly
    const port = window.location.port ? `:${window.location.port}` : ":5179";
    return `${protocol}//${hostname}${port}/ws`;
  })();

  const {
    url = defaultUrl,
    autoConnect = true,
    reconnectInterval = 200, // Fast initial reconnection
    maxReconnectAttempts = 15,
    onEvent,
    debug = false,
  } = options;

  const [status, setStatus] = useState<WebSocketStatus>({
    connected: false,
    reconnecting: false,
    clientCount: 0,
    error: null,
  });

  const [lastEvent, setLastEvent] = useState<ServerEvent | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const intentionalDisconnectRef = useRef(false);

  /**
   * Log debug messages if debug mode enabled
   */
  const logDebug = useCallback(
    (message: string, ...args: any[]) => {
      if (debug) {
        console.log(`[useWebSocket] ${message}`, ...args);
      }
    },
    [debug],
  );

  /**
   * Handle incoming WebSocket message
   */
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const serverEvent: ServerEvent = JSON.parse(event.data);
        logDebug(
          `Received event: ${serverEvent.type} from ${serverEvent.source}`,
        );

        // Update last event
        setLastEvent(serverEvent);

        // Handle connection status events
        if (serverEvent.type === "connection_status") {
          setStatus((prev) => ({
            ...prev,
            clientCount: serverEvent.data.clientCount,
          }));
        }

        // Call external event handler
        if (onEvent) {
          onEvent(serverEvent);
        }
      } catch (error) {
        console.error("[useWebSocket] Failed to parse message:", error);
      }
    },
    [onEvent, logDebug],
  );

  /**
   * Attempt to reconnect after connection loss
   */
  const attemptReconnect = useCallback(() => {
    if (intentionalDisconnectRef.current) {
      logDebug("Skipping reconnect - intentional disconnect");
      return;
    }

    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      logDebug(`Max reconnect attempts (${maxReconnectAttempts}) reached`);
      setStatus((prev) => ({
        ...prev,
        connected: false,
        reconnecting: false,
        error: "Failed to reconnect after multiple attempts",
      }));
      return;
    }

    reconnectAttemptsRef.current++;
    logDebug(
      `Reconnect attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts}`,
    );

    setStatus((prev) => ({
      ...prev,
      reconnecting: true,
      error: `Reconnecting... (attempt ${reconnectAttemptsRef.current})`,
    }));

    // Exponential backoff: 200ms, 200ms, 400ms, 800ms, 1600ms, max 3000ms
    const delay = Math.min(
      reconnectInterval * Math.pow(1.5, reconnectAttemptsRef.current - 1),
      3000,
    );

    reconnectTimeoutRef.current = setTimeout(() => {
      connect();
    }, delay);
  }, [reconnectInterval, maxReconnectAttempts, logDebug]);

  /**
   * Connect to WebSocket server
   */
  const connect = useCallback(() => {
    // Clear any existing reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    try {
      const connectStart = performance.now();
      logDebug(`Connecting to ${url}`);
      const ws = new WebSocket(url);

      ws.onopen = () => {
        const connectTime = performance.now() - connectStart;
        logDebug(`Connected (took ${connectTime.toFixed(0)}ms)`);
        reconnectAttemptsRef.current = 0;
        intentionalDisconnectRef.current = false;

        setStatus({
          connected: true,
          reconnecting: false,
          clientCount: 0,
          error: null,
        });
      };

      ws.onmessage = handleMessage;

      ws.onerror = (event) => {
        console.error("[useWebSocket] WebSocket error:", event);
        setStatus((prev) => ({
          ...prev,
          error: "WebSocket error occurred",
        }));
      };

      ws.onclose = (event) => {
        logDebug(`Disconnected (code: ${event.code}, reason: ${event.reason})`);

        setStatus((prev) => ({
          ...prev,
          connected: false,
          error: event.reason || "Connection closed",
        }));

        wsRef.current = null;

        // Attempt reconnection if not intentional
        if (!intentionalDisconnectRef.current) {
          attemptReconnect();
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error("[useWebSocket] Failed to create WebSocket:", error);
      setStatus((prev) => ({
        ...prev,
        connected: false,
        error: error instanceof Error ? error.message : "Failed to connect",
      }));

      // Retry connection
      attemptReconnect();
    }
  }, [url, handleMessage, attemptReconnect, logDebug]);

  /**
   * Disconnect from WebSocket server
   */
  const disconnect = useCallback(() => {
    logDebug("Intentional disconnect");
    intentionalDisconnectRef.current = true;

    // Clear reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Close connection
    if (wsRef.current) {
      wsRef.current.close(1000, "Client disconnect");
      wsRef.current = null;
    }

    setStatus({
      connected: false,
      reconnecting: false,
      clientCount: 0,
      error: null,
    });
  }, [logDebug]);

  /**
   * Send data through WebSocket
   */
  const send = useCallback(
    (data: any) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        console.warn("[useWebSocket] Cannot send - not connected");
        return;
      }

      try {
        const message = typeof data === "string" ? data : JSON.stringify(data);
        wsRef.current.send(message);
        logDebug("Sent message:", data);
      } catch (error) {
        console.error("[useWebSocket] Failed to send message:", error);
      }
    },
    [logDebug],
  );

  /**
   * Auto-connect on mount if enabled
   */
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    // Cleanup on unmount
    return () => {
      intentionalDisconnectRef.current = true;

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      if (wsRef.current) {
        wsRef.current.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect]); // connect not included - it's stable

  return {
    status,
    lastEvent,
    connect,
    disconnect,
    send,
  };
}
