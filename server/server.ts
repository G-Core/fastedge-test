import express, { type Request, type Response, type NextFunction } from "express";
import path from "node:path";
import {
  promises as fs,
  existsSync,
  readdirSync,
  mkdirSync,
  openSync,
  writeSync,
  closeSync,
  realpathSync,
  lstatSync,
  unlinkSync,
  constants as fsConst,
} from "node:fs";
import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { safeTokenEqual, hostAllowed } from "./utils/token.js";
import { WasmRunnerFactory } from "./runner/WasmRunnerFactory.js";
import { connectStores, resolveStoresRoot, request as storesRequest, type StoresConnection } from "./stores/StoresManager.js";
import type { IWasmRunner } from "./runner/IWasmRunner.js";
import { HttpWasmRunner } from "./runner/HttpWasmRunner.js";
import { CLIENT_PRESETS, EDGE_PRESETS, edgeDc, type RequestContext } from "./runner/requestContext.js";
import { WebSocketManager, StateManager } from "./websocket/index.js";
import { detectWasmType } from "./utils/wasmTypeDetector.js";
import { validatePath, validatePathOrThrow } from "./utils/pathValidator.js";
import { resolveDotenvPath, validateDotenvLeafs, DotenvPathError } from "./utils/dotenv-loader.js";
import { createResource, DEFAULT_RESOURCE_FILE, type Resource } from "./runner/resource.js";
import { mountStorageExplorer } from "./storageExplorer.js";
import { listWorkspaceFiles } from "./utils/workspaceFiles.js";
import { confineTo, resolveOrigin } from "./runner/origin.js";
import type { Origin } from "./schemas/config.js";
import {
  ApiResourceLoadBodySchema,
  ApiResourceSaveBodySchema,
  ApiLoadBodySchema,
  ApiSendBodySchema,
  ApiCallBodySchema,
  ApiConfigBodySchema,
  ApiDotenvBodySchema,
  ApiExecuteContextSchema,
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
const SESSION_TOKEN = process.env.FASTEDGE_DEBUG_TOKEN || randomBytes(32).toString("hex");
// Bind to loopback by default; non-loopback requires explicit opt-in.
const HOST = process.env.FASTEDGE_BIND_HOST ?? "127.0.0.1";
const EXPECTED_HOST = process.env.FASTEDGE_EXPECTED_HOST;

// Initialize WebSocket infrastructure
const debug = process.env.PROXY_RUNNER_DEBUG === "1";
const wsManager = new WebSocketManager(httpServer, SESSION_TOKEN, debug); // token validated in verifyClient
const stateManager = new StateManager(wsManager, debug);

// Initialize runner factory
const runnerFactory = new WasmRunnerFactory();
let currentRunner: IWasmRunner | null = null;
/** The loaded resource (several apps), instead of a single app. */
let currentResource: Resource | null = null;

// Allowlist of known schema filenames. The /api/schema/:name route checks this
// before serving a file, preventing path traversal through encoded slashes.
// We scan the directory when it's present; if it's missing (e.g. the VSCode
// extension packaging stripped it), the set is empty and every schema request
// returns 404 — safe, since no file can be served without being allowlisted.
const schemasDir = path.join(__dirname, "schemas");
let knownSchemas: Set<string>;
try {
  knownSchemas = new Set(
    readdirSync(schemasDir).filter((f) => f.endsWith(".schema.json")),
  );
} catch {
  knownSchemas = new Set();
}

// Paths vended by /api/config/show-save-dialog that /api/config/save-as is
// allowed to write to. Single-use: consumed on first write, then removed.
// Prevents save-as from writing to an arbitrary caller-supplied path.
const pendingSavePaths = new Set<string>();

app.use(express.json({ limit: "20mb" }));

// Content-Security-Policy for the debugger frontend (served inside a VS Code webview
// iframe). Restricts scripts to same-origin only and caps connect-src so a compromised
// page cannot exfiltrate the session token to an external host.
// connect-src explicitly includes ws://127.0.0.1:* and ws://localhost:* because the
// frontend converts `localhost` → `127.0.0.1` in the WS URL to avoid IPv6 timeouts,
// making the WebSocket cross-origin relative to a page loaded at http://localhost:PORT.
// These two loopback aliases are equivalent trust-wise; external origins remain blocked.
// frame-ancestors is intentionally omitted: VS Code webview origins vary across versions
// and adding it risks a blank iframe; the session token already gates all useful access.
const FRONTEND_CSP =
  "default-src 'self'; " +
  "connect-src 'self' ws://127.0.0.1:* wss://127.0.0.1:* ws://localhost:* wss://localhost:*; " +
  "img-src 'self' data: blob:; " +
  "style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self';";

app.use(
  express.static(path.join(__dirname, "frontend"), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html")) {
        res.setHeader("Content-Security-Policy", FRONTEND_CSP);
      }
    },
  }),
);

// Anti-DNS-rebinding: validate Host header on all /api/* requests.
// Handles IPv6 bracket notation ([::1]:5179) without splitting on the colon inside the brackets.
// This prevents a remote page from rebinding its hostname to 127.0.0.1 and issuing same-origin requests.
app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  const raw = req.headers.host ?? "";
  let host: string;
  if (raw.startsWith("[")) {
    // Bracketed IPv6: require exactly [addr] or [addr]:<numeric-port>.
    const close = raw.indexOf("]");
    const suffix = close === -1 ? "" : raw.slice(close + 1);
    if (close === -1 || (suffix !== "" && !/^:\d{1,5}$/.test(suffix))) {
      res.status(403).json({ ok: false, error: "Invalid Host" });
      return;
    }
    host = raw.slice(1, close);
  } else {
    host = raw.split(":")[0];
  }
  if (!hostAllowed(host, EXPECTED_HOST)) {
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
// ?token= query param is intentionally NOT accepted here — log files and browser
// history would expose it. WebSocket upgrades use ?token= because browsers cannot
// set custom headers during the WS handshake.
// ponytail: single token per server lifetime; restart to rotate
app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  const raw = req.headers["x-fastedge-token"];
  const token = Array.isArray(raw) ? raw[0] : raw;
  if (!token || !safeTokenEqual(token, SESSION_TOKEN)) {
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
    supportsPathLoading: true,
    workspaceRoot: process.env.WORKSPACE_PATH ?? null,
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

/**
 * Loads run one at a time, in arrival order, so an older load (e.g. an edge reload) cannot
 * finish last and win. Requests are not queued: each carries its own client / edge.
 */
let queue: Promise<unknown> = Promise.resolve();
function serialized(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response): Promise<void> => {
    const run = queue.then(() => handler(req, res));
    queue = run.catch(() => {});
    return run;
  };
}

app.post("/api/load", serialized(async (req: Request, res: Response) => {
  const parsed = ApiLoadBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.flatten() });
    return;
  }
  const { wasmBase64, wasmPath, dotenv, httpPort, stores, dc, client, edge } = parsed.data;

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

  // Guard against leaf symlinks escaping the workspace — catches HTTP-WASM where
  // fastedge-run reads the dotenv files directly, bypassing loadDotenvFiles().
  if (dotenvBasePath) {
    try {
      validateDotenvLeafs(dotenvBasePath);
    } catch (e) {
      if (e instanceof DotenvPathError) {
        res.status(400).json({ ok: false, error: (e as Error).message });
        return;
      }
      throw e;
    }
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

    // Cleanup previous runner (or resource)
    if (currentRunner) {
      await currentRunner.cleanup();
    }
    await currentResource?.cleanup();
    currentResource = null;

    // Create appropriate runner based on detected type
    loadedStores = null; // until this load succeeds
    const storesConnection = stores !== false ? await getStores() : null;
    const appDc = dc ?? edgeDc(edge) ?? "local";
    currentRunner = runnerFactory.createRunner(
      wasmType,
      dotenv?.enabled ?? false,
      storesConnection && { connection: storesConnection, dc: appDc, owned: false },
    );
    currentRunner.setStateManager(stateManager);

    // Load WASM (accepts either Buffer or string path). httpPort is forwarded
    // from the client so it works regardless of which config file the user
    // loaded (picker, default, or an arbitrary *.test.json). Server-side read
    // would be pinned to a single filename and miss the picker flow.
    await currentRunner.load(bufferOrPath, {
      dotenv: { enabled: dotenv?.enabled ?? false, path: dotenvBasePath },
      httpPort,
      client,
      edge,
    });
    loadedStores = storesConnection && { dc: appDc };

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
}));

/**
 * Load a resource: several apps, one per hook, as on a CDN resource (default file
 * .fastedge-debug/fastedge-cdn-resource.test.json in the workspace). Every file it reads must be
 * inside the workspace, so a resource spanning several projects is debugged from a folder that
 * holds them all. Replaces the loaded app or resource; /api/send then runs it.
 */
app.post("/api/resource/load", serialized(async (req: Request, res: Response) => {
  const parsed = ApiResourceLoadBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.flatten() });
    return;
  }
  const root = process.env.WORKSPACE_PATH || process.cwd();
  const { config } = parsed.data;
  const configPath = config ? undefined : parsed.data.configPath ?? DEFAULT_RESOURCE_FILE;

  await currentRunner?.cleanup();
  currentRunner = null;
  await currentResource?.cleanup();
  currentResource = null;
  loadedStores = null; // until this load succeeds

  try {
    const storesOn = (await getStores()) !== null;
    const resource = await createResource(configPath ? path.resolve(root, configPath) : (config as never), {
      root,
      ...(storesOn ? {} : { stores: false }),
    });
    currentResource = resource;
    const stores = storesOn && resource.config.stores !== false;
    loadedStores = stores ? { dc: resource.config.dc ?? edgeDc(resource.config.edge) ?? "local" } : null;

    const apps = [...resource.apps].map(([name, runner]) => ({ name, wasmType: runner.getType() }));
    const source = (req.headers["x-source"] as any) || "ui";
    stateManager.emitResourceLoaded({ configPath: configPath ? path.resolve(root, configPath) : null, apps }, source);
    res.json({ ok: true, apps, config: resource.config });
  } catch (error) {
    // A config, path or build problem: the caller can fix it.
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}));

/** A resource file in the workspace (default: the default resource file); it need not exist yet. */
function resourceFile(configPath: unknown): string {
  const root = process.env.WORKSPACE_PATH || process.cwd();
  const file = typeof configPath === "string" && configPath ? configPath : DEFAULT_RESOURCE_FILE;
  if (!file.endsWith(".json")) throw new Error("a resource file is a .json file");
  return validatePathOrThrow(path.resolve(root, file), { workspaceRoot: root, requireWasmExtension: false, checkExists: false });
}

/** A file's content version (a hash), or null when there is no file. */
function contentVersion(text: string | null): string | null {
  return text === null ? null : createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/** A resource file as written (no defaults filled in), for the Resource page; config null = no file yet. */
app.get("/api/resource/config", async (req: Request, res: Response) => {
  try {
    const file = resourceFile(req.query.path);
    const text = existsSync(file) ? await fs.readFile(file, "utf-8") : null;
    res.json({ ok: true, path: file, config: text === null ? null : JSON.parse(text), version: contentVersion(text) });
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

/** A request's origin with its files resolved against the workspace and confined to it. */
function workspaceOrigin(origin: Origin): Origin {
  const root = process.env.WORKSPACE_PATH || process.cwd();
  return resolveOrigin(origin, root, confineTo(root));
}

/** Suggestions for the Resource page's path fields: wasm, *.test.json and .env folders in the workspace. */
app.get("/api/workspace/files", (_req: Request, res: Response) => {
  const root = process.env.WORKSPACE_PATH || process.cwd();
  res.json({ ok: true, root, ...listWorkspaceFiles(root) });
});

/** Writes a resource file (checked against the resource schema first). Does not load it. */
app.post("/api/resource/save", async (req: Request, res: Response) => {
  const parsed = ApiResourceSaveBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.flatten() });
    return;
  }
  try {
    const file = resourceFile(parsed.data.configPath);
    // lstat: a dangling link too (the path check above follows only links that resolve).
    if (lstatSync(file, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error(`${file} is a symlink: not saving through it`);
    // Someone else (an agent, an editor) changed the file since the caller read it.
    if (parsed.data.expectedVersion !== undefined && !parsed.data.force) {
      const current = contentVersion(existsSync(file) ? await fs.readFile(file, "utf-8") : null);
      if (current !== parsed.data.expectedVersion) {
        res.status(409).json({ ok: false, conflict: true, version: current, error: `${file} changed since it was read` });
        return;
      }
    }
    mkdirSync(path.dirname(file), { recursive: true });
    // As given: the schema's defaults stay out of the file.
    const text = JSON.stringify(req.body.config, null, 2) + "\n";
    await fs.writeFile(file, text, "utf-8");
    const version = contentVersion(text)!;
    stateManager.emitResourceSaved({ configPath: file, version }, (req.headers["x-source"] as any) || "ui");
    res.json({ ok: true, path: file, version });
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

/**
 * The storage service connection, shared by every runner this server creates and held for
 * the server's lifetime. If the service cannot start, runners go on with stores off.
 */
let storesConnection: Promise<StoresConnection> | null = null;
async function getStores(): Promise<StoresConnection | null> {
  storesConnection ??= connectStores(resolveStoresRoot(process.env.WORKSPACE_PATH || process.cwd()));
  try {
    return await storesConnection;
  } catch (error) {
    storesConnection = null;
    console.error(`Stores are off: ${(error as Error).message}`);
    return null;
  }
}

/** The loaded app's stores: its cache bucket, or null (no app loaded, or stores off). */
let loadedStores: { dc: string } | null = null;

/** One admin call to the storage service; null when the loaded app has no stores. */
async function storesAdmin(body: Record<string, unknown>): Promise<unknown> {
  const connection = loadedStores && (await getStores());
  if (!connection) return null;
  const reply = await storesRequest(connection, "admin", body);
  if (!reply.ok) {
    // snapshot / reset are newer than the first service protocol: an older service refuses them.
    throw new Error(
      reply.error === "bad-request"
        ? "the running storage service is older than this debugger: close other fastedge-test instances, then restart this debugger"
        : `stores service: ${reply.error}`,
    );
  }
  return reply.value;
}

/** Stores panel: what the cache (one `dc`, default the loaded app's) and Edge KV hold. */
app.get("/api/stores", async (req: Request, res: Response) => {
  const appDc = loadedStores?.dc ?? "local";
  const dc = typeof req.query.dc === "string" && req.query.dc ? req.query.dc : appDc;
  try {
    const snapshot = await storesAdmin({ op: "snapshot", dc });
    res.json(snapshot ? { ok: true, enabled: true, appDc, ...snapshot } : { ok: true, enabled: false });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) });
  }
});

/** Storage panel: one value, `?dc=&key=` (cache) or `?store=&key=` (Edge KV); null if gone. */
app.get("/api/stores/value", async (req: Request, res: Response) => {
  const { dc, store, key } = req.query;
  if (typeof key !== "string" || (typeof dc === "string") === (typeof store === "string")) {
    res.status(400).json({ ok: false, error: "key and exactly one of dc / store are required" });
    return;
  }
  try {
    if (!loadedStores) {
      res.status(409).json({ ok: false, error: "no app with stores is loaded" });
      return;
    }
    const value = await storesAdmin({ op: "inspect", key, ...(typeof dc === "string" ? { dc } : { store }) });
    res.json({ ok: true, value });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) });
  }
});

/** Back to the fixtures: cache emptied (every `dc`), Edge KV re-seeded. */
app.post("/api/stores/reset", async (_req: Request, res: Response) => {
  try {
    if (!loadedStores) {
      res.status(409).json({ ok: false, error: "no app with stores is loaded" });
      return;
    }
    await storesAdmin({ op: "reset" });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) });
  }
});

/** Move the service clock (cache expiry) forward by `ms`. */
app.post("/api/stores/advance-clock", async (req: Request, res: Response) => {
  const ms = req.body?.ms;
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) {
    res.status(400).json({ ok: false, error: "ms must be a positive number" });
    return;
  }
  try {
    if (!loadedStores) {
      res.status(409).json({ ok: false, error: "no app with stores is loaded" });
      return;
    }
    await storesAdmin({ op: "advance-clock", ms });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) });
  }
});

// Storage Explorer: manage the stores with or without an app loaded.
mountStorageExplorer(app, getStores, () => process.env.WORKSPACE_PATH || process.cwd(), () => loadedStores?.dc ?? null);

/** Pause (true) or resume (false) the service clock; advance-clock still moves it. */
app.post("/api/stores/clock", async (req: Request, res: Response) => {
  const paused = req.body?.paused;
  if (typeof paused !== "boolean") {
    res.status(400).json({ ok: false, error: "paused must be a boolean" });
    return;
  }
  try {
    if (!loadedStores) {
      res.status(409).json({ ok: false, error: "no app with stores is loaded" });
      return;
    }
    res.json({ ok: true, paused: await storesAdmin({ op: "pause-clock", paused }) });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) });
  }
});

/** Release the shared lease on shutdown, so an unused service exits without waiting for the TTL. */
async function releaseStores(): Promise<void> {
  const connection = await storesConnection?.catch(() => null);
  await connection?.close();
}

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

  if (dotenvPath) {
    try {
      validateDotenvLeafs(dotenvPath);
    } catch (e) {
      if (e instanceof DotenvPathError) {
        res.status(400).json({ ok: false, error: (e as Error).message });
        return;
      }
      throw e;
    }
  }

  try {
    await currentRunner.applyDotenv(dotenv.enabled, dotenvPath);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) });
  }
});

/**
 * The client / edge a request body names, for that request only (one left out is none).
 * Neither named: undefined, so the runner's own (from load) applies. The cache bucket stays
 * as loaded.
 */
function requestContextOf(body: object, context: RequestContext): RequestContext | undefined {
  return "client" in body || "edge" in body ? context : undefined;
}

/** Client and edge presets, for the request context panel. */
app.get("/api/request-context/presets", (_req: Request, res: Response) => {
  res.json({ ok: true, client: CLIENT_PRESETS, edge: EDGE_PRESETS });
});

app.post("/api/execute", async (req: Request, res: Response) => {
  const { url, path: reqPath, method, headers, body } = req.body ?? {};
  const context = ApiExecuteContextSchema.safeParse(req.body ?? {});
  if (!context.success) {
    res.status(400).json({ ok: false, error: context.error.flatten() });
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
    const requestContext = requestContextOf(req.body ?? {}, context.data);
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
        context: requestContext,
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
          storeCalls: result.storeCalls,
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
        requestContext,
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
      context: requestContextOf(req.body, parsed.data),
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

  if (currentResource && parsed.data.origin) {
    res.status(400).json({ ok: false, error: "origin: a resource sets its origins in its file (main / rules)" });
    return;
  }
  let origin: Origin | undefined;
  try {
    origin = parsed.data.origin && workspaceOrigin(parsed.data.origin);
  } catch (error) {
    res.status(400).json({ ok: false, error: (error as Error).message });
    return;
  }

  if (currentResource) {
    const source = (req.headers["x-source"] as any) || "ui";
    try {
      const result = await currentResource.request({
        url,
        method: request?.method,
        headers: request?.headers,
        body: request?.body,
        properties,
      });
      stateManager.emitResourceRequestCompleted(result, source);
      res.json({ ok: true, ...result });
    } catch (error) {
      stateManager.emitRequestFailed("Request execution failed", String(error), source);
      res.status(500).json({ ok: false, error: String(error) });
    }
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
    // Always capture all logs (trace level) - filtering happens client-side
    const fullFlowResult = await currentRunner.callFullFlow(
      url,
      request?.method || "GET",
      request?.headers || {},
      request?.body || "",
      properties || {},
      true, // enforceProductionPropertyRules
      requestContextOf(req.body, parsed.data),
      origin,
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

      // Normalize now so the registered path and the eventual write target are identical.
      const filePath = result.filePath.endsWith(".json")
        ? result.filePath
        : result.filePath + ".json";
      pendingSavePaths.add(filePath);
      res.json({ ok: true, filePath });
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
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(config, null, 2), "utf-8");

    res.json({ ok: true, savedPath: filePath });
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
  res.setHeader("Content-Security-Policy", FRONTEND_CSP);
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
    const debugDir = path.dirname(portFilePath);
    mkdirSync(debugDir, { recursive: true });

    // Reject if .fastedge-debug is itself a symlink pointing outside the workspace.
    const appRoot = process.env.WORKSPACE_PATH || process.cwd();
    try {
      const realDir = realpathSync(debugDir);
      const realRoot = realpathSync(appRoot);
      if (realDir !== realRoot && !realDir.startsWith(realRoot + path.sep)) {
        console.warn("Port file directory is outside workspace — refusing to write");
        return;
      }
    } catch { /* unreachable in practice — let the write attempt fail naturally */ }

    const tokenHash = createHash("sha256").update(SESSION_TOKEN).digest("hex");
    const content = `${port}:${tokenHash}`;
    // O_NOFOLLOW atomically rejects a symlink at the leaf. On Windows it is
    // unavailable (undefined → 0), so fall back to an explicit lstat check.
    // The lstat path has a narrow TOCTOU window, but a static malicious workspace
    // cannot exploit it without active intervention between the check and the open.
    const O_NOFOLLOW: number = (fsConst.O_NOFOLLOW as number | undefined) ?? 0;
    if (O_NOFOLLOW === 0) {
      try {
        if (lstatSync(portFilePath).isSymbolicLink()) {
          console.warn("Port file is a symlink — refusing to write");
          return;
        }
      } catch { /* file does not exist — OK */ }
    }
    const fd = openSync(
      portFilePath,
      fsConst.O_WRONLY | fsConst.O_CREAT | fsConst.O_TRUNC | O_NOFOLLOW,
      0o600,
    );
    try {
      writeSync(fd, content);
    } finally {
      closeSync(fd);
    }
  } catch (err) {
    console.warn(`Could not write port file: ${(err as Error).message}`);
  }
}

function deletePortFile(): void {
  const portFilePath = getPortFilePath();
  if (!portFilePath) return;
  // Apply the same parent-directory containment check as writePortFile so that
  // cleanup cannot delete a file in an external directory if .fastedge-debug is
  // (or was replaced with) a symlink pointing outside the workspace.
  try {
    const appRoot = process.env.WORKSPACE_PATH || process.cwd();
    try {
      const realDir = realpathSync(path.dirname(portFilePath));
      const realRoot = realpathSync(appRoot);
      if (realDir !== realRoot && !realDir.startsWith(realRoot + path.sep)) return;
    } catch { /* unreachable in practice */ }
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
    // Unspecified bind addresses (0.0.0.0 / ::) aren't connectable — probe loopback instead.
    const probeHost = HOST === "0.0.0.0" ? "127.0.0.1" : HOST === "::" ? "::1" : HOST;
    const hostForUrl = probeHost.includes(":") ? `[${probeHost}]` : probeHost;
    await fetch(`http://${hostForUrl}:${port}/health`, {
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
      const hostForUrl = HOST.includes(":") ? `[${HOST}]` : HOST;
      console.error(`Proxy runner listening on http://${hostForUrl}:${resolvedPort}`);
      console.error(`WebSocket available at ws://${hostForUrl}:${resolvedPort}/ws`);
      // When no token was injected externally (CLI mode), log the full URL with
      // the token in the fragment so only the local user reading stderr can open it.
      if (!process.env.FASTEDGE_DEBUG_TOKEN) {
        // The link to click: highlighted (bold, underlined cyan) on a colour terminal, or with
        // FORCE_COLOR (pnpm dev, whose runner pipes output); never with NO_COLOR.
        const color = !process.env.NO_COLOR && (process.stderr.isTTY || !!process.env.FORCE_COLOR);
        const link = (url: string) => (color ? `\x1b[1;4;36m${url}\x1b[0m` : url);
        console.error(`\nOpen: ${link(`http://${hostForUrl}:${resolvedPort}/#token=${SESSION_TOKEN}`)}`);
        // pnpm dev: the Vite dev server (hot reload) needs the same token.
        const devFrontend = process.env.FASTEDGE_DEV_FRONTEND;
        if (devFrontend) console.error(`Dev:  ${link(`${devFrontend.replace(/\/$/, "")}/#token=${SESSION_TOKEN}`)} (hot reload)`);
        console.error("");
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
  await releaseStores();
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
  await releaseStores();
  wsManager.close();
  deletePortFile();
  httpServer.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});
