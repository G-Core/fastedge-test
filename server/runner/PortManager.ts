/**
 * Port Manager
 *
 * Manages port allocation for HTTP WASM server instances.
 * Allocates ports from 8100-8199 range.
 *
 * Uses OS-level availability checks in addition to in-memory tracking so that
 * multiple server processes running simultaneously (one per app) don't collide
 * on the same inner ports.
 */

import { createServer } from "net";

export class PortManager {
  private readonly minPort = 8100;
  private readonly maxPort = 8199;
  private allocatedPorts = new Set<number>();
  private lastAllocatedPort = this.minPort - 1;

  /**
   * Check whether a port is actually free at the OS level.
   * This is necessary when multiple server processes run simultaneously —
   * each has its own PortManager with independent in-memory state, so
   * in-memory tracking alone is not enough to prevent cross-process conflicts.
   *
   * Public so pinned-port callers (HttpWasmRunner with RunnerConfig.httpPort)
   * can reuse the same OS-level check without going through allocate().
   */
  isPortFree(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = createServer();
      server.once("error", () => resolve(false));
      server.once("listening", () => server.close(() => resolve(true)));
      server.listen(port, "127.0.0.1");
    });
  }

  /**
   * Allocate an available port from the pool.
   * Combines in-memory tracking (avoids TCP TIME_WAIT reuse within this process)
   * with an OS-level check (avoids cross-process collisions).
   * @returns The allocated port number
   * @throws Error if no ports are available
   */
  async allocate(): Promise<number> {
    for (let offset = 1; offset <= (this.maxPort - this.minPort + 1); offset++) {
      const port =
        this.minPort +
        ((this.lastAllocatedPort - this.minPort + offset) %
          (this.maxPort - this.minPort + 1));

      if (!this.allocatedPorts.has(port) && (await this.isPortFree(port))) {
        this.allocatedPorts.add(port);
        this.lastAllocatedPort = port;
        return port;
      }
    }

    throw new Error(
      `No available ports in range ${this.minPort}-${this.maxPort}. All ports are allocated.`
    );
  }

  /**
   * Release a previously allocated port back to the pool
   */
  release(port: number): void {
    this.allocatedPorts.delete(port);
  }

  getAllocatedCount(): number {
    return this.allocatedPorts.size;
  }

  getAvailableCount(): number {
    return this.maxPort - this.minPort + 1 - this.allocatedPorts.size;
  }

  isAllocated(port: number): boolean {
    return this.allocatedPorts.has(port);
  }

  reset(): void {
    this.allocatedPorts.clear();
  }
}
