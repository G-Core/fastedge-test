/**
 * HTTP WASM Runner
 *
 * Executes HTTP WASM binaries (component model with wasi-http interface)
 * using the FastEdge-run CLI as a process-based runner.
 */

import { spawn, execSync, ChildProcess } from "child_process";
import type {
  IWasmRunner,
  WasmType,
  RunnerConfig,
  HttpRequest,
  HttpResponse,
} from "./IWasmRunner.js";
import type { HookCall, HookResult, FullFlowResult } from "./types.js";
import type { IStateManager } from "./IStateManager.js";
import { PortManager } from "./PortManager.js";
import { findFastEdgeRunCli } from "../utils/fastedge-cli.js";
import {
  writeTempWasmFile,
  removeTempWasmFile,
} from "../utils/temp-file-manager.js";
import { isLegacySyncWasm } from "../utils/legacy-wasm-detect.js";

/**
 * HttpWasmRunner implementation
 *
 * Spawns a long-running fastedge-run process and forwards HTTP requests to it
 */
export class HttpWasmRunner implements IWasmRunner {
  private process: ChildProcess | null = null;
  private port: number | null = null;
  private cliPath: string | null = null;
  private tempWasmPath: string | null = null;
  private currentWasmPath: string | null = null; // resolved path used when spawning
  private logs: Array<{ level: number; message: string }> = [];
  private stateManager: IStateManager | null = null;
  private portManager: PortManager;
  private dotenvEnabled: boolean = true;
  private dotenvPath: string | null = null;
  /** Pinned ports bypass PortManager allocation and must not be released back to it. */
  private isPinnedPort: boolean = false;
  /** @deprecated Legacy sync support — remove when #[fastedge::http] is retired */
  private isLegacySync: boolean = false;

  constructor(portManager: PortManager, dotenvEnabled: boolean = true) {
    this.portManager = portManager;
    this.dotenvEnabled = dotenvEnabled;
  }

  /**
   * Load WASM binary and spawn fastedge-run process
   */
  async load(
    bufferOrPath: Buffer | string,
    config?: RunnerConfig,
  ): Promise<void> {
    // Update config if provided
    if (config?.dotenv?.enabled !== undefined) {
      this.dotenvEnabled = config.dotenv.enabled;
    }
    if (config?.dotenv?.path !== undefined) {
      this.dotenvPath = config.dotenv.path;
    }

    // Cleanup previous process if any
    await this.cleanup();

    // Find fastedge-run CLI
    this.cliPath = await findFastEdgeRunCli();

    // Determine WASM path
    let wasmPath: string;

    if (typeof bufferOrPath === "string") {
      // Path provided directly - use it without creating temp file
      wasmPath = bufferOrPath;
      this.tempWasmPath = null; // Don't cleanup this file (user-provided)
    } else {
      // Buffer provided - write to temp file (existing behavior)
      wasmPath = await writeTempWasmFile(bufferOrPath);
      this.tempWasmPath = wasmPath; // Cleanup this temp file later
    }

    // Detect legacy sync binaries (deprecated #[fastedge::http] pattern)
    this.isLegacySync = await isLegacySyncWasm(bufferOrPath);

    // Port selection: pinned (RunnerConfig.httpPort / fastedge-config.test.json)
    // takes precedence and bypasses the dynamic pool. Load fails fast if the
    // pinned port is not free — there is no fallback to dynamic allocation,
    // because the whole point of pinning is a predictable address for external
    // tooling (port-forwarding rules, Docker maps, bookmarks).
    if (config?.httpPort !== undefined) {
      const pinned = config.httpPort;
      if (!(await this.portManager.isPortFree(pinned))) {
        throw new Error(
          `fastedge-run port ${pinned} is not available — release it or choose a different httpPort in fastedge-config.test.json`,
        );
      }
      this.port = pinned;
      this.isPinnedPort = true;
    } else {
      // Dynamic allocation — OS check prevents cross-process port collisions
      this.port = await this.portManager.allocate();
      this.isPinnedPort = false;
    }

    // Build command arguments
    const wasi_http = !this.isLegacySync;
    const args = [
      "http",
      "-p",
      this.port.toString(),
      "-w",
      wasmPath,
      "--wasi-http",
      String(wasi_http),
    ];

    // Add dotenv flag if enabled; pass explicit path when provided so fastedge-run
    // reads from that directory instead of its CWD. This is needed for test fixtures
    // and non-standard project layouts. npm package users with .env files at their
    // project root can use dotenvEnabled: true without specifying a path.
    if (this.dotenvEnabled) {
      if (this.dotenvPath) {
        args.push("--dotenv", this.dotenvPath);
      } else {
        args.push("--dotenv");
      }
    }

    // Remember resolved path so applyDotenv can restart the process
    this.currentWasmPath = wasmPath;

    // Spawn process
    this.process = spawn(this.cliPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        RUST_LOG: "info",
        ...process.env,
      },
    });

    // Setup log capture
    this.setupLogCapture();

    // Setup error handlers
    this.setupErrorHandlers();

    // Wait for server to be ready
    // Timeout accounts for:
    // - Large WASM files that take time to compile (10MB+ can take 3-5s)
    // - WASMs that make downstream HTTP requests on first request (up to 5s)
    // - Test environments where startup can be slower
    const timeout =
      process.env.NODE_ENV === "test" || process.env.VITEST ? 20000 : 10000;
    await this.waitForServerReady(this.port, timeout);
  }

  /**
   * Execute an HTTP request through the WASM module.
   *
   * Redirects are surfaced verbatim — `fetch` is called with
   * `redirect: "manual"` so 3xx responses (status + `Location`) reach the
   * caller intact. This matches FastEdge edge behaviour, which returns
   * redirects to the client rather than following them server-side. See
   * `IWasmRunner.execute` for the public contract.
   */
  async execute(request: HttpRequest): Promise<HttpResponse> {
    if (!this.port || !this.process) {
      throw new Error("HttpWasmRunner not loaded. Call load() first.");
    }

    // Clear previous logs
    this.logs = [];

    try {
      // Forward request to local fastedge-run server
      const url = `http://localhost:${this.port}${request.path}`;
      const response = await fetch(url, {
        method: request.method,
        headers: request.headers,
        body: request.body || undefined,
        signal: AbortSignal.timeout(30000), // 30 second timeout
        // Surface 3xx responses verbatim so tests can assert on status/Location.
        // A FastEdge edge returns redirects to the client rather than following
        // them server-side; production parity requires the same here.
        redirect: "manual",
      });

      // Read response body
      const arrayBuffer = await response.arrayBuffer();
      const bodyBuffer = Buffer.from(arrayBuffer);

      // Determine if response is binary
      const contentType = response.headers.get("content-type") || "";
      const isBinary = this.isBinaryContentType(contentType);

      // Convert body to string or base64
      const body = isBinary
        ? bodyBuffer.toString("base64")
        : bodyBuffer.toString("utf8");

      return {
        status: response.status,
        statusText: response.statusText,
        headers: this.parseHeaders(response.headers),
        body,
        contentType,
        isBase64: isBinary,
        logs: [...this.logs], // Copy logs
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logs.push({ level: 4, message: `Request failed: ${errorMessage}` });

      throw new Error(`HTTP request failed: ${errorMessage}`);
    }
  }

  /**
   * Not supported for HTTP WASM (proxy-wasm only)
   */
  async callHook(_hookCall: HookCall): Promise<HookResult> {
    throw new Error(
      "callHook() is not supported for HTTP WASM. Use execute() instead.",
    );
  }

  /**
   * Not supported for HTTP WASM (proxy-wasm only)
   */
  async callFullFlow(
    _url: string,
    _method: string,
    _headers: Record<string, string>,
    _body: string,
    _responseHeaders: Record<string, string>,
    _responseBody: string,
    _responseStatus: number,
    _responseStatusText: string,
    _properties: Record<string, unknown>,
    _enforceProductionPropertyRules: boolean,
  ): Promise<FullFlowResult> {
    throw new Error(
      "callFullFlow() is not supported for HTTP WASM. Use execute() instead.",
    );
  }

  /**
   * Apply dotenv settings by restarting the fastedge-run process.
   * The WASM file is not re-read; only the --dotenv flag changes.
   */
  async applyDotenv(enabled: boolean, dotenvPath?: string): Promise<void> {
    this.dotenvEnabled = enabled;
    if (dotenvPath !== undefined) {
      this.dotenvPath = dotenvPath;
    }

    if (
      !this.process ||
      !this.currentWasmPath ||
      !this.cliPath ||
      this.port === null
    ) {
      // No running process to restart — settings will apply on next load()
      return;
    }

    // Kill current process and respawn with updated dotenv flag
    await this.killProcess();
    this.process = null;

    const wasi_http = !this.isLegacySync;
    const args = [
      "http",
      "-p",
      this.port.toString(),
      "-w",
      this.currentWasmPath,
      "--wasi-http",
      String(wasi_http),
    ];

    if (this.dotenvEnabled) {
      if (this.dotenvPath) {
        args.push("--dotenv", this.dotenvPath);
      } else {
        args.push("--dotenv");
      }
    }

    this.process = spawn(this.cliPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        RUST_LOG: "info",
        ...process.env,
      },
    });

    this.setupLogCapture();
    this.setupErrorHandlers();

    const timeout =
      process.env.NODE_ENV === "test" || process.env.VITEST ? 20000 : 10000;
    await this.waitForServerReady(this.port, timeout);
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    // Kill process
    if (this.process) {
      await this.killProcess();
      this.process = null;
    }

    // Release port — pinned ports were never added to PortManager's pool, so
    // releasing them would be a no-op at best and an accounting bug at worst.
    if (this.port !== null) {
      if (!this.isPinnedPort) {
        this.portManager.release(this.port);
      }
      this.port = null;
      this.isPinnedPort = false;
    }

    // Remove temp file
    if (this.tempWasmPath) {
      await removeTempWasmFile(this.tempWasmPath);
      this.tempWasmPath = null;
    }

    // Clear logs
    this.logs = [];
  }

  /**
   * Get runner type
   */
  getType(): WasmType {
    return "http-wasm";
  }

  /**
   * Get the port the fastedge-run HTTP server is listening on
   */
  getPort(): number | null {
    return this.port;
  }

  /**
   * Set state manager
   */
  setStateManager(stateManager: IStateManager): void {
    this.stateManager = stateManager;
  }

  /**
   * Parse log level from a process output line.
   * Matches bare prefixes (e.g. "INFO  target > msg") and bracketed prefixes (e.g. "[INFO] msg").
   * Falls back to the provided default if no known level prefix is found.
   */
  private parseLogLevel(message: string, fallback: number): number {
    const match = message.trimStart().match(/^\[?(\w+)\]?/);
    const prefix = match?.[1]?.toUpperCase();
    switch (prefix) {
      case "TRACE":
        return 0;
      case "DEBUG":
        return 1;
      case "INFO":
        return 2;
      case "WARN":
        return 3;
      case "ERROR":
        return 4;
      default:
        return fallback;
    }
  }

  /**
   * Setup log capture from process stdout/stderr
   */
  private setupLogCapture(): void {
    if (!this.process) return;

    this.process.stdout?.on("data", (data: Buffer) => {
      const message = data.toString().trim();
      if (message) {
        const log = { level: this.parseLogLevel(message, 2), message };
        this.logs.push(log);
        this.stateManager?.emitHttpWasmLog(log);
      }
    });

    this.process.stderr?.on("data", (data: Buffer) => {
      const message = data.toString().trim();
      if (message) {
        const log = { level: this.parseLogLevel(message, 4), message };
        this.logs.push(log);
        this.stateManager?.emitHttpWasmLog(log);
      }
    });
  }

  /**
   * Setup error handlers for process
   */
  private setupErrorHandlers(): void {
    if (!this.process) return;

    this.process.on("error", (error) => {
      this.logs.push({
        level: 4,
        message: `Process error: ${error.message}`,
      });
    });

    this.process.on("exit", (code, signal) => {
      if (code !== null && code !== 0) {
        this.logs.push({
          level: 4,
          message: `Process exited with code ${code}`,
        });
      } else if (signal) {
        this.logs.push({
          level: 3,
          message: `Process killed with signal ${signal}`,
        });
      }
    });
  }

  /**
   * Wait for the fastedge-run HTTP server to be ready by watching process logs
   * for the "Listening on" message.
   *
   * We intentionally avoid HTTP probing here. HTTP probes trigger WASM execution
   * (the app calls event.request.text() to read the body), which can hang for
   * many seconds in CI due to WASM JIT compilation on the first request, or
   * because newer fastedge-run builds hold the body stream open regardless of
   * content-length. Watching logs avoids all of this: fastedge-run emits
   * "Listening on http://127.0.0.1:<port>" as soon as the HTTP listener is bound,
   * before any WASM execution occurs.
   */
  private waitForServerReady(port: number, timeoutMs: number): Promise<void> {
    const startTime = Date.now();
    return new Promise((resolve, reject) => {
      const check = () => {
        if (this.process && this.process.exitCode !== null) {
          return reject(
            new Error(
              `FastEdge-run process exited with code ${this.process.exitCode} before server started`,
            ),
          );
        }

        if (this.logs.some((l) => l.message.includes("Listening on"))) {
          return resolve();
        }

        if (Date.now() - startTime >= timeoutMs) {
          const processInfo = this.process
            ? `Process state: exitCode=${this.process.exitCode}, killed=${this.process.killed}, pid=${this.process.pid}`
            : "Process is null";
          const recentLogs = this.logs
            .slice(-5)
            .map((l) => `[${l.level}] ${l.message}`)
            .join("\n");
          return reject(
            new Error(
              `FastEdge-run server did not start within ${timeoutMs}ms on port ${port}\n` +
                `${processInfo}\n` +
                `Recent logs:\n${recentLogs || "(no logs)"}`,
            ),
          );
        }

        setTimeout(check, 50);
      };
      check();
    });
  }

  /**
   * Kill the process gracefully (SIGINT) with platform-specific force-kill fallback.
   * SIGINT is sent first on all platforms — Node.js translates it for Windows.
   * If the process does not exit within 2 seconds:
   *   - Windows: taskkill /F /T to terminate the process tree
   *   - Unix: SIGKILL
   */
  private async killProcess(): Promise<void> {
    if (!this.process) return;

    return new Promise((resolve) => {
      if (!this.process) {
        resolve();
        return;
      }

      // Try graceful shutdown first with SIGINT (FastEdge-run's preferred signal)
      this.process.kill("SIGINT");

      // Wait up to 2 seconds for graceful shutdown, then force kill
      const timeout = setTimeout(() => {
        if (
          this.process &&
          this.process.exitCode === null &&
          this.process.signalCode === null
        ) {
          if (process.platform === "win32") {
            const pid = this.process.pid;
            if (pid) {
              try {
                execSync(`taskkill /F /T /PID ${pid}`);
              } catch {
                // Process may have already exited — not an error
              }
            }
          } else {
            this.process.kill("SIGKILL");
          }
        }
        resolve();
      }, 2000);

      // Resolve immediately if process exits cleanly
      this.process.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  /**
   * Check if content type is binary
   */
  private isBinaryContentType(contentType: string): boolean {
    const binaryTypes = [
      "image/",
      "audio/",
      "video/",
      "application/octet-stream",
      "application/pdf",
      "application/zip",
      "application/gzip",
    ];

    return binaryTypes.some((type) => contentType.toLowerCase().includes(type));
  }

  /**
   * Parse headers from fetch Headers object
   */
  private parseHeaders(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
}
