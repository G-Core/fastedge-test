/**
 * WebSocket Manager
 *
 * Handles WebSocket connections, client management, and broadcasting events
 * Single responsibility: Manage WebSocket connections and message distribution
 */

import WebSocket, { WebSocketServer } from "ws";
import { IncomingMessage, Server as HTTPServer } from "http";
import { ServerEvent } from "./types.js";

/**
 * Client metadata for tracking connections
 */
interface ClientMetadata {
  id: string;
  connectedAt: number;
  ip: string;
  lastPing: number;
}

export class WebSocketManager {
  private wss: WebSocketServer;
  private clients = new Map<WebSocket, ClientMetadata>();
  private clientIdCounter = 0;
  private pingInterval: NodeJS.Timeout | null = null;
  private debug: boolean;

  constructor(server: HTTPServer, debug: boolean = false) {
    this.debug = debug;

    if (this.debug) {
      console.log(
        "[WebSocketManager] Initializing WebSocket server on path /ws",
      );
    }

    this.wss = new WebSocketServer({
      server,
      path: "/ws",
      verifyClient: (info: {
        origin: string;
        secure: boolean;
        req: IncomingMessage;
      }) => {
        if (this.debug) {
          console.log(
            `[WebSocketManager] Client attempting connection from ${info.origin}`,
          );
        }
        return true; // Accept all connections
      },
    });

    this.setupServer();
    this.startPingInterval();
  }

  /**
   * Setup WebSocket server event handlers
   */
  private setupServer(): void {
    this.wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });

    this.wss.on("error", (error: Error) => {
      console.error("[WebSocketManager] Server error:", error);
    });

    if (this.debug) {
      console.log("[WebSocketManager] WebSocket server initialized on /ws");
    }
  }

  /**
   * Handle new client connection
   */
  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const clientId = `client-${++this.clientIdCounter}`;
    const ip = req.socket.remoteAddress || "unknown";

    const metadata: ClientMetadata = {
      id: clientId,
      connectedAt: Date.now(),
      ip,
      lastPing: Date.now(),
    };

    this.clients.set(ws, metadata);

    if (this.debug) {
      console.log(
        `[WebSocketManager] Client connected: ${clientId} from ${ip} (total: ${this.clients.size})`,
      );
    }

    // Send welcome message with connection info
    this.sendToClient(ws, {
      type: "connection_status",
      timestamp: Date.now(),
      source: "system",
      data: {
        connected: true,
        clientCount: this.clients.size,
      },
    });

    // Setup client event handlers
    ws.on("message", (data: Buffer) => {
      this.handleMessage(ws, data, metadata);
    });

    ws.on("pong", () => {
      metadata.lastPing = Date.now();
    });

    ws.on("close", () => {
      this.handleDisconnection(ws, metadata);
    });

    ws.on("error", (error: Error) => {
      console.error(`[WebSocketManager] Client error (${metadata.id}):`, error);
    });

    // Notify all clients about updated client count
    this.broadcastClientCount();
  }

  /**
   * Handle incoming message from client
   */
  private handleMessage(
    ws: WebSocket,
    data: Buffer,
    metadata: ClientMetadata,
  ): void {
    try {
      const message = JSON.parse(data.toString());

      if (this.debug) {
        console.log(
          `[WebSocketManager] Message from ${metadata.id}:`,
          message.type,
        );
      }

      // For now, WebSocket is primarily for server → client updates
      // Client commands still go through HTTP API
      // But we could handle ping/pong or other control messages here
      if (message.type === "ping") {
        this.sendToClient(ws, {
          type: "connection_status",
          timestamp: Date.now(),
          source: "system",
          data: { connected: true, clientCount: this.clients.size },
        });
      }
    } catch (error) {
      console.error(
        `[WebSocketManager] Failed to parse message from ${metadata.id}:`,
        error,
      );
    }
  }

  /**
   * Handle client disconnection
   */
  private handleDisconnection(ws: WebSocket, metadata: ClientMetadata): void {
    this.clients.delete(ws);

    if (this.debug) {
      const duration = Date.now() - metadata.connectedAt;
      console.log(
        `[WebSocketManager] Client disconnected: ${metadata.id} (connected for ${Math.round(duration / 1000)}s, remaining: ${this.clients.size})`,
      );
    }

    // Notify remaining clients about updated client count
    this.broadcastClientCount();
  }

  /**
   * Send event to specific client
   */
  private sendToClient(ws: WebSocket, event: ServerEvent): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(event));
      } catch (error) {
        console.error("[WebSocketManager] Failed to send to client:", error);
      }
    }
  }

  /**
   * Broadcast event to all connected clients
   */
  public broadcast(event: ServerEvent): void {
    if (this.debug) {
      console.log(
        `[WebSocketManager] Broadcasting ${event.type} to ${this.clients.size} clients`,
      );
    }

    const message = JSON.stringify(event);
    let successCount = 0;
    let failCount = 0;

    this.clients.forEach((metadata, ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(message);
          successCount++;
        } catch (error) {
          console.error(
            `[WebSocketManager] Failed to send to ${metadata.id}:`,
            error,
          );
          failCount++;
        }
      } else {
        failCount++;
      }
    });

    if (this.debug && failCount > 0) {
      console.log(
        `[WebSocketManager] Broadcast result: ${successCount} sent, ${failCount} failed`,
      );
    }
  }

  /**
   * Broadcast current client count to all clients
   */
  private broadcastClientCount(): void {
    this.broadcast({
      type: "connection_status",
      timestamp: Date.now(),
      source: "system",
      data: {
        connected: true,
        clientCount: this.clients.size,
      },
    });
  }

  /**
   * Start periodic ping to detect dead connections
   */
  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      const now = Date.now();
      const timeout = 30000; // 30 seconds

      this.clients.forEach((metadata, ws) => {
        if (now - metadata.lastPing > timeout) {
          if (this.debug) {
            console.log(
              `[WebSocketManager] Terminating inactive client: ${metadata.id}`,
            );
          }
          ws.terminate();
          this.clients.delete(ws);
        } else if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      });
    }, 15000); // Check every 15 seconds
  }

  /**
   * Get current client count
   */
  public getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get all client IDs (for debugging)
   */
  public getClientIds(): string[] {
    return Array.from(this.clients.values()).map((m) => m.id);
  }

  /**
   * Cleanup and shutdown
   */
  public close(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    // Close all client connections
    this.clients.forEach((metadata, ws) => {
      ws.close(1000, "Server shutting down");
    });

    this.clients.clear();

    // Close WebSocket server
    this.wss.close((err) => {
      if (err) {
        console.error("[WebSocketManager] Error closing server:", err);
      } else if (this.debug) {
        console.log("[WebSocketManager] Server closed");
      }
    });
  }
}
