import express, { type Request, type Response, type NextFunction } from "express";
import path from "node:path";
import {
  promises as fs,
  existsSync,
  readdirSync,
  mkdirSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { WasmRunnerFactory } from "./runner/WasmRunnerFactory.js";
import type { IWasmRunner } from "./runner/IWasmRunner.js";
import { HttpWasmRunner } from "./runner/HttpWasmRunner.js";
import { WebSocketManager, StateManager } from "./websocket/index.js";
import { detectWasmType } from "./utils/wasmTypeDetector.js";
import { validatePath } from "./utils/pathValidator.js";
import { resolveDotenvPath, DotenvPathError } from "./utils/dotenv-loader.js";
import {
  ApiLoadBodySchema,
  ApiSendBodySchema,
  ApiCallBodySchema,
  ApiConfigBodySchema,
  ApiDotenvBodySchema,
  SaveAsBodySchema,
  TestConfigSchema,
} from "./schemas/index.js";

// Try to import electron dialog if available
let electronDialog: any = null;
try {
  // This will work if running in Electron context (VSCode extension), but will throw in a plain Node environment
  electronDialog = require("electron")?.dialog;
} catch {
  // Not in Electron, dialog features won't be available, Do nothing
}

const app = express();
const httpServer = createServer(app);

// Per-session capability token. VSCode extension passes FASTEDGE_DEBUG_TOKEN
// via env; CLI generates one and logs it so only the local user sees it.
const SESSION_TOKEN = process.env.FASTEDGE_DEBUG_TOKEN ?? randomBytes(32).toString("hex");
// Bind to loopback by default; non-loopback requires explicit opt-in.
const HOST = process.env.FASTEDGE_BIND_HOST ?? "127.0.0.1";
const ALLOWED_HOSTS = new Set<string>(
  ["localhost", "127.0.0.1", "::1", process.env.FASTEDGE_EXPECTED_HOST].filter(
    Boolean,
  ) as string[],
);

// Initialize WebSocket infrastructure
const debug = process.env.PROXY_RUNNER_DEBUG === "1";
const wsManager = new WebSocketManager(httpServer, debug, SESSION_TOKEN); // token validated in verifyClient
const stateManager = new StateManager(wsManager, debug);

// Initialize runner factory
const runnerFactory = new WasmRunnerFactory();
let currentRunner: IWasmRunner | null = null;

// Allowlist of known schema filenames, built at startup from the schemas/ directory.
// The /api/schema/:name route uses this instead of building a path from the route
// param directly, preventing path traversal through encoded slashes in the param.
const schemasDir = path.join(__dirname, "..", "schemas");
const knownSchemas = new Set(
  readdirSync(schemasDir).filter((f) => f.endsWith(".schema.json")),
);

// Paths vended by /api/config/show-save-dialog that /api/config/save-as is
// allowed to write to. Single-use: consumed on first write, then removed.
// Prevents save-as from writing to an arbitrary caller-supplied path.
const pendingSavePaths = new Set<string>();

app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(__dirname, "frontend")));

// Anti-DNS-rebinding: validate Host header on all /api/* requests.
// Handles IPv6 bracket notation ([::1]:5179) without splitting on the colon inside the brackets.
// This prevents a remote page from rebinding its hostname to 127.0.0.1 and issuing same-origin requests.
app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  const raw = req.headers.host ?? "";
  const host = raw.startsWith("[") ? raw.slice(1, raw.indexOf("]")) : raw.split(":")[0];
  if (!ALLOWED_HOSTS.has(host)) {
    res.status(403).json({ ok: false, error: "Invalid Host" });
    return;
  }
  next();
});

// Session token authentication on all /api/* requests.
// The token is generated at server startup and delivered to callers out-of-band:
//   - VSCode extension: passes it as FASTEDGE_DEBUG_TOKEN env to the forked server and
//     injects it into the webview iframe URL fragment (#token=...) so the frontend reads it.
//   - CLI: the token is logged to stderr at startup; the user opens the printed URL.
// The frontend includes the token as the x-fastedge-token header on every request.
// ponytail: single token per server lifetime; restart to rotate
app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  const token =
    (req.headers["x-fastedge-token"] as string | undefined) ??
    (req.query["token"] as string | undefined);
  if (token !== SESSION_TOKEN) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }
  next();
});

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok", service: "fastedge-debugger" });
});

// WebSocket client count — used by VSCode extension to wait for UI connection before loading WASM
app.get("/api/client-count", (_req: Request, res: Response) => {
  res.json({ count: stateManager.getClientCount() });
});

// Environment detection endpoint
app.get("/api/environment", (req: Request, res: Response) => {
  const isVSCode = process.env.VSCODE_INTEGRATION === "true";
  res.json({
    environment: isVSCode ? "vscode" : "node",
    supportsPathLoading: true, // Both environments support path loading
  });
});

// Workspace WASM detection endpoint (VSCode only)
app.get("/api/workspace-wasm", async (req: Request, res: Response) => {
  const isVSCode = process.env.VSCODE_INTEGRATION === "true";
  const workspacePath = process.env.WORKSPACE_PATH;

  // Only available in VSCode with workspace
  if (!isVSCode || !workspacePath) {
    res.json({ path: null });
    return;
  }

  try {
    const wasmPath = path.join(
      workspacePath,
      ".fastedge-debug",
      "app.wasm",
    );

    // Check if file exists
    try {
      await fs.stat(wasmPath);
      // Return path with <workspace> placeholder for cleaner display
      res.json({ path: "<workspace>/.fastedge-debug/app.wasm" });
    } catch {
      // File doesn't exist
      res.json({ path: null });
    }
  } catch (error) {
    console.error("[workspace-wasm] Error checking workspace WASM:", error);
    res.json({ path: null });
  }
});

// Trigger workspace WASM reload (VSCode only)
// Called by VSCode extension after F5 rebuild
app.post("/api/reload-workspace-wasm", async (req: Request, res: Response) => {
  const isVSCode = process.env.VSCODE_INTEGRATION === "true";
  const workspacePath = process.env.WORKSPACE_PATH;

  // Only available in VSCode with workspace
  if (!isVSCode || !workspacePath) {
    res.status(400).json({ error: "Only available in VSCode environment" });
    return;
  }

  try {
    const wasmPath = path.join(
      workspacePath,
      ".fastedge-debug",
      "app.wasm",
    );

    // Check if file exists
    try {
      await fs.stat(wasmPath);

      // Emit WebSocket event with <workspace> placeholder
      stateManager.emitReloadWorkspaceWasm(
        "<workspace>/.fastedge-debug/app.wasm",
        "system",
      );

      res.json({ ok: true, path: "<workspace>/.fastedge-debug/app.wasm" });
    } catch {
      // File doesn't exist
      res.status(404).json({ error: "Workspace WASM file not found" });
    }
  } catch (error) {
    console.error("[reload-workspace-wasm] Error:", error);
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/load", async (req: Request, res: Response) => {
  const parsed = ApiLoadBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.flatten() });
    return;
  }
  const { wasmBase64, wasmPath, dotenv, httpPort } = parsed.data;

  // Resolve and validate the dotenv path before touching runner state so a
  // containment violation returns 400 rather than triggering the 500 catch block.
  let dotenvBasePath: string | undefined;
  if (dotenv?.path !== undefined) {
    try {
      dotenvBasePath = resolveDotenvPathFromWorkspace(dotenv.path);
    } catch (e) {
      if (e instanceof DotenvPathError) {
        res.status(400).json({ ok: false, error: e.message });
        return;
      }
      throw e;
    }
  } else {
    dotenvBasePath = process.env.WORKSPACE_PATH || undefined;
  }

  try {
    let bufferOrPath: Buffer | string;
    let fileSize: number;
    let fileName: string;

    // Path-based loading (preferred for performance)
    if (wasmPath) {
      if (typeof wasmPath !== "string") {
        res.status(400).json({ ok: false, error: "wasmPath must be a string" });
        return;
      }

      let resolvedPath = wasmPath;

      // Expand <workspace> placeholder (VSCode integration)
      if (wasmPath.startsWith("<workspace>")) {
        const workspacePath = process.env.WORKSPACE_PATH;
        if (!workspacePath) {
          res.status(400).json({
            ok: false,
            error:
              "<workspace> placeholder only available in VSCode environment",
          });
          return;
        }
        // Replace <workspace> with actual workspace path
        resolvedPath = wasmPath.replace("<workspace>", workspacePath);
      }

      // Validate path for security; workspaceRoot confines the path to the workspace
      // (lexically and via realpath to catch symlink escapes)
      const validationResult = validatePath(resolvedPath, {
        requireWasmExtension: true,
        checkExists: true,
        workspaceRoot: process.env.WORKSPACE_PATH ?? process.cwd(),
      });

      if (!validationResult.valid) {
        res.status(400).json({ ok: false, error: validationResult.error });
        return;
      }

      // Use normalized path
      bufferOrPath = validationResult.normalizedPath!;
      fileName = path.basename(bufferOrPath);

      // Get file size for event emission
      const stats = await fs.stat(bufferOrPath);
      fileSize = stats.size;
    }
    // Buffer-based loading (fallback for web UI)
    else if (wasmBase64) {
      if (typeof wasmBase64 !== "string") {
        res
          .status(400)
          .json({ ok: false, error: "wasmBase64 must be a string" });
        return;
      }

      // Convert to buffer
      bufferOrPath = Buffer.from(wasmBase64, "base64");
      fileSize = bufferOrPath.length;
      fileName = "binary.wasm";
    } else {
      // This shouldn't happen due to validation above, but TypeScript needs it
      res
        .status(400)
        .json({ ok: false, error: "Missing wasmBase64 or wasmPath" });
      return;
    }

    // Auto-detect WASM type
    const wasmType = await detectWasmType(bufferOrPath);

    // Cleanup previous runner
    if (currentRunner) {
      await currentRunner.cleanup();
    }

    // Create appropriate runner based on detected type
    currentRunner = runnerFactory.createRunner(
      wasmType,
      dotenv?.enabled ?? false,
    );
    currentRunner.setStateManager(stateManager);

    // Load WASM (accepts either Buffer or string path). httpPort is forwarded
    // from the client so it works regardless of which config file the user
    // loaded (picker, default, or an arbitrary *.test.json). Server-side read
    // would be pinned to a single filename and miss the picker flow.
    await currentRunner.load(bufferOrPath, {
      dotenv: { enabled: dotenv?.enabled ?? false, path: dotenvBasePath },
      httpPort,
    });

    // Emit WASM loaded event — include runner port for HTTP WASM so the
    // frontend can build the live preview URL without a separate API call
    const source = (req.headers["x-source"] as any) || "ui";
    const runnerPort =
      currentRunner.getType() === "http-wasm"
        ? (currentRunner as HttpWasmRunner).getPort()
        : null;
    const resolvedPath =
      typeof bufferOrPath === "string" ? bufferOrPath : undefined;
    stateManager.emitWasmLoaded(
      fileName,
      fileSize,
      source,
      runnerPort,
      wasmType,
      resolvedPath,
    );
    res.json({ ok: true, wasmType, resolvedPath });
  } catch (error) {
    // Cleanup runner if load failed
    if (currentRunner) {
      await currentRunner.cleanup();
      currentRunner = null;
    }
    res.status(500).json({ ok: false, error: String(error) });
  }
});

app.patch("/api/dotenv", async (req: Request, res: Response) => {
  const parsed = ApiDotenvBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.flatten() });
    return;
  }

  const { dotenv } = parsed.data;

  if (!currentRunner) {
    res.status(400).json({
      ok: false,
      error: "No WASM module loaded. Call /api/load first.",
    });
    return;
  }

  let dotenvPath: string | undefined;
  if (dotenv.path !== undefined) {
    try {
      dotenvPath = resolveDotenvPathFromWorkspace(dotenv.path);
    } catch (e) {
      if (e instanceof DotenvPathError) {
        res.status(400).json({ ok: false, error: (e as Error).message });
        return;
      }
      throw e;
    }
  } else {
    dotenvPath = process.env.WORKSPACE_PATH || undefined;
  }

  try {
    await currentRunner.applyDotenv(dotenv.enabled, dotenvPath);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) });
  }
});

app.post("/api/execute", async (req: Request, res: Response) => {
  const { url, path: reqPath, method, headers, body } = req.body ?? {};

  if (!currentRunner) {
    res.status(400).json({
      ok: false,
      error: "No WASM module loaded. Call /api/load first.",
    });
    return;
  }

  try {
    if (currentRunner.getType() === "http-wasm") {
      // HTTP WASM: Accept either `path` (preferred) or `url` (legacy).
      // When `path` is provided, use it directly (e.g. "/api/hello?q=1").
      // When `url` is provided, extract pathname + search from it.
      let resolvedPath: string;
      if (reqPath && typeof reqPath === "string") {
        resolvedPath = reqPath;
      } else if (url && typeof url === "string") {
        let urlObj: URL;
        try {
          urlObj = new URL(url);
        } catch {
          res
            .status(400)
            .json({ ok: false, error: `Invalid url: ${url} (must be an absolute URL)` });
          return;
        }
        resolvedPath = urlObj.pathname + urlObj.search;
      } else {
        res
          .status(400)
          .json({ ok: false, error: "Missing path (or url) for HTTP WASM request" });
        return;
      }

      const result = await currentRunner.execute({
        path: resolvedPath,
        method: method || "GET",
        headers: headers || {},
        body: body || "",
      });

      // Emit HTTP WASM request completed event
      const source = (req.headers["x-source"] as any) || "ui";
      stateManager.emitHttpWasmRequestCompleted(
        {
          status: result.status,
          statusText: result.statusText,
          headers: result.headers,
          body: result.body,
          contentType: result.contentType,
          isBase64: result.isBase64,
        },
        source,
      );

      res.json({ ok: true, result });
    } else {
      // Proxy-wasm: Use existing callFullFlow
      if (!url || typeof url !== "string") {
        res.status(400).json({ ok: false, error: "Missing url" });
        return;
      }

      const { request, properties } = req.body ?? {};

      const fullFlowResult = await currentRunner.callFullFlow(
        url,
        request?.method || "GET",
        request?.headers || {},
        request?.body || "",
        properties || {},
        true, // enforceProductionPropertyRules
      );

      // Emit request completed event
      const source = (req.headers["x-source"] as any) || "ui";
      stateManager.emitRequestCompleted(
        fullFlowResult.hookResults,
        fullFlowResult.finalResponse,
        fullFlowResult.calculatedProperties,
        source,
      );

      res.json({ ok: true, ...fullFlowResult });
    }
  } catch (error) {
    // Emit request failed event
    const source = (req.headers["x-source"] as any) || "ui";
    stateManager.emitRequestFailed(
      "Request execution failed",
      String(error),
      source,
    );

    res.status(500).json({ ok: false, error: String(error) });
  }
});

app.post("/api/call", async (req: Request, res: Response) => {
  const parsed = ApiCallBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.flatten() });
    return;
  }
  const { hook, request, response, properties } = parsed.data;

  if (!currentRunner) {
    res.status(400).json({
      ok: false,
      error: "No WASM module loaded. Call /api/load first.",
    });
    return;
  }

  try {
    const result = await currentRunner.callHook({
      hook,
      request: request ?? { headers: {}, body: "" },
      response: response ?? { headers: {}, body: "" },
      properties: properties ?? {},
    });

    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) });
  }
});

app.post("/api/send", async (req: Request, res: Response) => {
  const parsed = ApiSendBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.flatten() });
    return;
  }
  const { url, request, properties } = parsed.data;

  if (!currentRunner) {
    res.status(400).json({
      ok: false,
      error: "No WASM module loaded. Call /api/load first.",
    });
    return;
  }

  try {
    // Always capture all logs (trace level) - filtering happens client-side
    const fullFlowResult = await currentRunner.callFullFlow(
      url,
      request?.method || "GET",
      request?.headers || {},
      request?.body || "",
      properties || {},
      true, // enforceProductionPropertyRules
    );

    // Emit request completed event
    const source = (req.headers["x-source"] as any) || "ui";
    stateManager.emitRequestCompleted(
      fullFlowResult.hookResults,
      fullFlowResult.finalResponse,
      fullFlowResult.calculatedProperties,
      source,
    );

    res.json({ ok: true, ...fullFlowResult });
  } catch (error) {
    // Emit request failed event
    const source = (req.headers["x-source"] as any) || "ui";
    stateManager.emitRequestFailed(
      "Request execution failed",
      String(error),
      source,
    );

    res.status(500).json({ ok: false, error: String(error) });
  }
});

/** Resolve the .fastedge-debug config directory.
 *  Prefers WORKSPACE_PATH (VSCode integration) so the config lives next to
 *  the developer's app, not inside the extension/package install folder. */
function resolveConfigDir(): string {
  const root = process.env.WORKSPACE_PATH || process.cwd();
  return path.join(root, ".fastedge-debug");
}

/** Resolve a potentially relative dotenv path using the same base as resolveConfigDir(). */
function resolveDotenvPathFromWorkspace(dotenvPath: string | undefined): string | undefined {
  const base = process.env.WORKSPACE_PATH || process.cwd();
  return resolveDotenvPath(dotenvPath, base);
}

// Get test configuration
app.get("/api/config", async (req: Request, res: Response) => {
  try {
    const configDir = resolveConfigDir();
    const configPath = path.join(configDir, "fastedge-config.test.json");
    const configData = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(configData);

    // Resolve relative dotenv.path against the config file's directory
    if (config.dotenv?.path && !path.isAbsolute(config.dotenv.path)) {
      config.dotenv.path = path.resolve(configDir, config.dotenv.path);
    }

    // Validate config against schema, include validation result in response
    const validation = TestConfigSchema.safeParse(config);
    res.json({
      ok: true,
      config,
      valid: validation.success,
      validationErrors: validation.success
        ? undefined
        : validation.error.flatten(),
    });
  } catch (error) {
    res.status(404).json({ ok: false, error: "Config file not found" });
  }
});

// Save test configuration
app.post("/api/config", async (req: Request, res: Response) => {
  const parsed = ApiConfigBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.flatten() });
    return;
  }
  const { config } = parsed.data;

  try {
    const configDir = resolveConfigDir();
    mkdirSync(configDir, { recursive: true });
    const configPath = path.join(configDir, "fastedge-config.test.json");
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");

    // Emit properties updated event if properties changed
    if (config.properties) {
      const source = (req.headers["x-source"] as any) || "ui";
      stateManager.emitPropertiesUpdated(
        config.properties as Record<string, string>,
        source,
      );
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) });
  }
});

// Show save dialog (Electron only)
app.post(
  "/api/config/show-save-dialog",
  async (req: Request, res: Response) => {
    try {
      const { suggestedName } = req.body ?? {};

      if (!electronDialog) {
        res.status(501).json({
          ok: false,
          error: "Dialog API not available (not running in Electron)",
          fallbackRequired: true,
        });
        return;
      }

      // Show Electron save dialog
      const result = await electronDialog.showSaveDialog({
        title: "Save Config File",
        defaultPath: suggestedName || "fastedge-config.test.json",
        filters: [
          { name: "JSON Files", extensions: ["json"] },
          { name: "All Files", extensions: ["*"] },
        ],
        properties: ["createDirectory", "showOverwriteConfirmation"],
      });

      if (result.canceled || !result.filePath) {
        res.json({ ok: true, canceled: true });
        return;
      }

      // Register this path as a one-time write capability; save-as will consume it.
      pendingSavePaths.add(result.filePath);
      res.json({ ok: true, filePath: result.filePath });
    } catch (error) {
      res.status(500).json({ ok: false, error: String(error) });
    }
  },
);

// Save config to a specific file path.
// Only accepts paths that were previously vended by /api/config/show-save-dialog
// (registered in pendingSavePaths). This ensures the write destination was chosen
// by the user through the dialog, not supplied by an arbitrary caller.
app.post("/api/config/save-as", async (req: Request, res: Response) => {
  const parsed = SaveAsBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.flatten() });
    return;
  }

  const { config, filePath } = parsed.data;

  if (!pendingSavePaths.has(filePath)) {
    res.status(403).json({
      ok: false,
      error: "filePath was not vended by the save dialog",
    });
    return;
  }
  pendingSavePaths.delete(filePath); // single-use

  try {
    let targetPath = filePath;
    if (!targetPath.endsWith(".json")) targetPath += ".json";

    const dir = path.dirname(targetPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(targetPath, JSON.stringify(config, null, 2), "utf-8");

    res.json({ ok: true, savedPath: targetPath });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) });
  }
});

// Serve JSON Schema files for API consumers and agents.
// Name is validated against a startup-time allowlist of known files so a
// caller cannot traverse outside schemas/ via an encoded slash in the param.
app.get("/api/schema/:name", (req: Request, res: Response) => {
  const file = `${req.params.name}.schema.json`;
  if (!knownSchemas.has(file)) {
    res.status(404).json({ ok: false, error: "Schema not found" });
    return;
  }
  res.setHeader("Content-Type", "application/json");
  res.sendFile(path.join(schemasDir, file));
});

// SPA fallback - serve index.html for all non-API routes
app.get("*", (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "frontend", "index.html"));
});

const defaultPort = process.env.PORT ? Number(process.env.PORT) : 5179;

// Port file: written on startup, deleted on shutdown.
// Placed inside .fastedge-debug/ alongside the app's other debug artifacts,
// so port discovery is co-located with the config and WASM that anchor
// each app's identity.
function getPortFilePath(): string | null {
  const appRoot = process.env.WORKSPACE_PATH || process.cwd();
  return path.join(appRoot, ".fastedge-debug", ".debug-port");
}

function writePortFile(port: number): void {
  const portFilePath = getPortFilePath();
  if (!portFilePath) return;
  try {
    mkdirSync(path.dirname(portFilePath), { recursive: true });
    writeFileSync(portFilePath, String(port), "utf8");
  } catch (err) {
    console.warn(`Could not write port file: ${(err as Error).message}`);
  }
}

function deletePortFile(): void {
  const portFilePath = getPortFilePath();
  if (!portFilePath) return;
  try {
    unlinkSync(portFilePath);
  } catch {
    // File may not exist — not an error
  }
}

/**
 * Check if a port is available by attempting a TCP connection.
 * If something is listening, check if it's a fastedge-debugger via /health.
 */
async function isPortAvailable(port: number): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 500);
  try {
    await fetch(`http://localhost:${port}/health`, {
      signal: controller.signal,
    });
    // Something is listening — port is taken
    return false;
  } catch (err) {
    // Connection refused → nothing listening → port is free.
    // Abort/timeout or other errors → something may be there, treat as taken.
    if (
      err instanceof TypeError &&
      (err as any).cause?.code === "ECONNREFUSED"
    ) {
      return true;
    }
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Find an available port starting from the preferred port.
 * Tries up to 50 ports (5179-5228 by default) so developers can run many
 * concurrent debug sessions (Codespaces, multi-app projects) without
 * exhausting the pool. Upper bound stays below common dev-tooling defaults.
 */
async function resolvePort(preferred: number): Promise<number> {
  const maxAttempts = 50;
  for (let port = preferred; port < preferred + maxAttempts; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
    console.error(`Port ${port} is in use, trying ${port + 1}...`);
  }
  throw new Error(
    `Could not find a free port (tried ${preferred}-${preferred + maxAttempts - 1}). ` +
      `Set PORT env var to use a specific port.`
  );
}

export async function startServer(port = defaultPort): Promise<void> {
  const resolvedPort = await resolvePort(port);
  return new Promise((resolve) => {
    httpServer.listen(resolvedPort, HOST, () => {
      console.error(`Proxy runner listening on http://${HOST}:${resolvedPort}`);
      console.error(`WebSocket available at ws://${HOST}:${resolvedPort}/ws`);
      // When no token was injected externally (CLI mode), log the full URL with
      // the token in the fragment so only the local user reading stderr can open it.
      if (!process.env.FASTEDGE_DEBUG_TOKEN) {
        console.error(
          `Open: http://localhost:${resolvedPort}/#token=${SESSION_TOKEN}`,
        );
      }
      writePortFile(resolvedPort);
      resolve();
    });
  });
}

// Auto-start: this bundle is only loaded by bin/fastedge-debug.js (CLI)
// or fork() from the VSCode extension. Both need the server running.
// Library consumers use separate entry points (dist/lib/).
void startServer().catch((error: unknown) => {
  console.error("Failed to start server:");
  console.error(error);
  process.exit(1);
});

// Port file cleanup on exit — covers Windows where SIGTERM is never sent.
// The unlinkSync in deletePortFile is already try/catch so double-deletion is safe.
process.on("exit", () => {
  deletePortFile();
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, closing server...");
  if (currentRunner) {
    await currentRunner.cleanup();
  }
  wsManager.close();
  deletePortFile();
  httpServer.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, closing server...");
  if (currentRunner) {
    await currentRunner.cleanup();
  }
  wsManager.close();
  deletePortFile();
  httpServer.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});
