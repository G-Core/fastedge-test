import express, { type Request, type Response } from "express";
import path from "node:path";
import {
  promises as fs,
  existsSync,
  mkdirSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { createServer } from "node:http";
import { WasmRunnerFactory } from "./runner/WasmRunnerFactory.js";
import type { IWasmRunner } from "./runner/IWasmRunner.js";
import { HttpWasmRunner } from "./runner/HttpWasmRunner.js";
import { WebSocketManager, StateManager } from "./websocket/index.js";
import { detectWasmType } from "./utils/wasmTypeDetector.js";
import { validatePath } from "./utils/pathValidator.js";
import {
  ApiLoadBodySchema,
  ApiSendBodySchema,
  ApiCallBodySchema,
  ApiConfigBodySchema,
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

// Initialize WebSocket infrastructure
const debug = process.env.PROXY_RUNNER_DEBUG === "1";
const wsManager = new WebSocketManager(httpServer, debug);
const stateManager = new StateManager(wsManager, debug);

// Initialize runner factory
const runnerFactory = new WasmRunnerFactory();
let currentRunner: IWasmRunner | null = null;

app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(__dirname, "frontend")));

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
  const { wasmBase64, wasmPath, dotenv } = parsed.data;

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

      // Validate path for security
      const validationResult = validatePath(resolvedPath, {
        requireWasmExtension: true,
        checkExists: true,
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

    // Precedence: client-provided path → WORKSPACE_PATH (VSCode) → undefined (CWD).
    // When running inside VSCode the server CWD is the extension's dist/debugger/
    // directory, so WORKSPACE_PATH is the fallback. A client-provided path wins.
    const dotenvPath = dotenv?.path || process.env.WORKSPACE_PATH || undefined;

    // Load WASM (accepts either Buffer or string path)
    await currentRunner.load(bufferOrPath, {
      dotenv: { enabled: dotenv?.enabled ?? false, path: dotenvPath },
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
  const { dotenv } = req.body ?? {};
  if (!dotenv || typeof dotenv.enabled !== "boolean") {
    res
      .status(400)
      .json({ ok: false, error: "dotenv.enabled must be a boolean" });
    return;
  }

  if (!currentRunner) {
    res.status(400).json({
      ok: false,
      error: "No WASM module loaded. Call /api/load first.",
    });
    return;
  }

  try {
    const dotenvPath =
      (typeof dotenv.path === "string" ? dotenv.path : undefined) ||
      process.env.WORKSPACE_PATH ||
      undefined;
    await currentRunner.applyDotenv(dotenv.enabled, dotenvPath);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) });
  }
});

app.post("/api/execute", async (req: Request, res: Response) => {
  const { url, method, headers, body } = req.body ?? {};

  if (!currentRunner) {
    res.status(400).json({
      ok: false,
      error: "No WASM module loaded. Call /api/load first.",
    });
    return;
  }

  try {
    if (currentRunner.getType() === "http-wasm") {
      // HTTP WASM: Simple request/response
      if (!url || typeof url !== "string") {
        res
          .status(400)
          .json({ ok: false, error: "Missing url for HTTP WASM request" });
        return;
      }

      const urlObj = new URL(url);
      const result = await currentRunner.execute({
        path: urlObj.pathname + urlObj.search,
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

      const { request, response, properties } = req.body ?? {};

      const fullFlowResult = await currentRunner.callFullFlow(
        url,
        request?.method || "GET",
        request?.headers || {},
        request?.body || "",
        response?.headers || {},
        response?.body || "",
        response?.status || 200,
        response?.statusText || "OK",
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
  const { url, request, response, properties } = parsed.data;

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
      response?.headers || {},
      response?.body || "",
      200,
      "OK",
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

// Get test configuration
app.get("/api/config", async (req: Request, res: Response) => {
  try {
    const configPath = path.join(__dirname, "..", ".fastedge-debug", "fastedge-config.test.json");
    const configData = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(configData);
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
    const configDir = path.join(__dirname, "..", ".fastedge-debug");
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

      res.json({ ok: true, filePath: result.filePath });
    } catch (error) {
      res.status(500).json({ ok: false, error: String(error) });
    }
  },
);

// Save config to a specific file path
app.post("/api/config/save-as", async (req: Request, res: Response) => {
  try {
    const { config, filePath } = req.body ?? {};
    if (!config) {
      res.status(400).json({ ok: false, error: "Missing config" });
      return;
    }
    if (!filePath) {
      res.status(400).json({ ok: false, error: "Missing filePath" });
      return;
    }

    // Resolve path relative to project root (where server runs)
    const projectRoot = path.join(__dirname, "..");
    let targetPath: string;

    // Check if path is absolute or relative
    if (path.isAbsolute(filePath)) {
      targetPath = filePath;
    } else {
      targetPath = path.join(projectRoot, filePath);
    }

    // Ensure .json extension
    if (!targetPath.endsWith(".json")) {
      targetPath += ".json";
    }

    // Create directory if it doesn't exist
    const dir = path.dirname(targetPath);
    await fs.mkdir(dir, { recursive: true });

    // Write the file
    await fs.writeFile(targetPath, JSON.stringify(config, null, 2), "utf-8");

    res.json({ ok: true, savedPath: targetPath });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) });
  }
});

// Serve JSON Schema files for API consumers and agents
app.get("/api/schema/:name", (req: Request, res: Response) => {
  const schemaPath = path.join(
    __dirname,
    "..",
    "schemas",
    `${req.params.name}.schema.json`,
  );
  if (!existsSync(schemaPath)) {
    res.status(404).json({ ok: false, error: "Schema not found" });
    return;
  }
  res.setHeader("Content-Type", "application/json");
  res.sendFile(schemaPath);
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
  const appRoot = process.env.WORKSPACE_PATH;
  if (!appRoot) return null;
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

export function startServer(port = defaultPort): Promise<void> {
  return new Promise((resolve) => {
    httpServer.listen(port, () => {
      console.log(`Proxy runner listening on http://localhost:${port}`);
      console.log(`WebSocket available at ws://localhost:${port}/ws`);
      writePortFile(port);
      resolve();
    });
  });
}

// Auto-start when run directly as CLI (node dist/server.js or via bin)
// When imported programmatically, call startServer() manually
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if ((require as any).main === module) {
  startServer();
}

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
