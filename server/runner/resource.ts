/**
 * A resource: several apps handling one request, as on a CDN resource. `main` gives each hook
 * its app and the origin; the first rule whose regex matches the request path replaces main's
 * hooks completely (when it sets `hooks`) and/or its origin.
 *
 * As on the edge, every app sees the same request: the client and edge are the resource's,
 * headers and properties pass from hook to hook (custom properties too, across apps), and every
 * hook starts with fresh memory. See cdnFlow.ts.
 */
import { existsSync } from "node:fs";
import { readFile, stat } from "fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ResourceConfigSchema, TestConfigSchema, type ResourceConfig, type ResourceConfigInput, type ResourceHooks, type ResourceOrigin } from "../schemas/config.js";
import { createRunner } from "./standalone.js";
import type { IWasmRunner } from "./IWasmRunner.js";
import type { TestStores } from "../stores/testStores.js";
import type { StoreCall } from "../stores/trace.js";
import type { FullFlowResult, HeaderRecord, HookResult } from "./types.js";
import { HeaderManager } from "./HeaderManager.js";
import { PropertyResolver } from "./PropertyResolver.js";
import { cdnContext, withHeaders, type RequestContext } from "./requestContext.js";
import { validatePathOrThrow } from "../utils/pathValidator.js";
import { validateDotenvLeafs } from "../utils/dotenv-loader.js";
import { BUILTIN_SHORTHAND, BUILTIN_URL, CDN_HOOKS, isBuiltInUrl, runCdnFlow, type CdnHook, type OriginRequest, type OriginResponse } from "./cdnFlow.js";
import { confineTo, originHandler, resolveOrigin } from "./origin.js";

/** Where the debugger looks for a resource when none is named (relative to the workspace). */
export const DEFAULT_RESOURCE_FILE = ".fastedge-debug/fastedge-cdn-resource.test.json";

export type ResourceRequest = {
  /** Default: the config's `request.url`. */
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Over the config's `properties` (e.g. request.country), as for a single app. */
  properties?: Record<string, unknown>;
};

export type ResourceResult = {
  /** The rule that matched, or null for main. */
  rule: { index: number; name?: string; match: string } | null;
  /** Each hook that ran, with the app that ran it. */
  hooks: Partial<Record<CdnHook, { app: string; result: HookResult }>>;
  /** What answered before the response hooks. Absent when a request hook sent the response. */
  origin?: { kind: "url" | "built-in" | "app"; app?: string; response: OriginResponse; storeCalls?: StoreCall[] };
  finalResponse: FullFlowResult["finalResponse"];
};

export interface Resource {
  readonly config: ResourceConfig;
  /** The loaded apps by name. */
  readonly apps: ReadonlyMap<string, IWasmRunner>;
  /** Runs one request. An app whose wasm was rebuilt since it loaded is reloaded first. */
  request(request?: ResourceRequest): Promise<ResourceResult>;
  cleanup(): Promise<void>;
}

export type CreateResourceOptions = {
  /** As for createRunner: on by default, false = off, or isolated test stores (createStores). */
  stores?: boolean | TestStores;
  /**
   * Confine every file the resource reads (its config, each app's wasm, referenced config and
   * dotenv folder) to this folder, as the debugger confines loads to its workspace. A resource
   * spanning several projects is then debugged from a folder holding them all (a monorepo).
   */
  root?: string;
};

/** A resource from a config file (paths relative to it) or an object (paths relative to the cwd). */
export async function createResource(fileOrObject: string | ResourceConfigInput, options: CreateResourceOptions = {}): Promise<Resource> {
  const confine = confinement(options.root);
  const file = typeof fileOrObject === "string" ? confine(fileOrObject, "file") : undefined;
  const baseDir = file ? path.dirname(file) : options.root ?? process.cwd();
  const raw = file ? JSON.parse(await readFile(file, "utf8")) : fileOrObject;
  const config = ResourceConfigSchema.parse(raw);
  checkReferences(config);
  // Built-in origins' files: relative to the resource file, inside `root`.
  const confineOrigin = options.root ? confineTo(options.root) : undefined;
  config.main.origin = resolveOrigin(config.main.origin, baseDir, confineOrigin);
  for (const rule of config.rules) if (rule.origin) rule.origin = resolveOrigin(rule.origin, baseDir, confineOrigin);

  const context: RequestContext = { client: config.client, edge: config.edge };
  const stores = options.stores ?? config.stores;
  const apps = new Map<string, IWasmRunner>();
  // Each app's wasm and when it was built: a rebuilt app reloads before the next request.
  const builds = new Map<string, { wasm: string; dotenv?: { enabled?: boolean; path: string }; mtimeMs: number }>();
  try {
    for (const [name, entry] of Object.entries(config.apps)) {
      const app = await resolveApp(name, entry, baseDir, confine);
      const { mtimeMs } = await stat(app.wasm);
      apps.set(name, await createRunner(app.wasm, {
        dotenv: app.dotenv,
        stores,
        dc: config.dc,
        client: config.client,
        edge: config.edge,
      }));
      builds.set(name, { ...app, mtimeMs });
    }
    checkAppTypes(config, apps);
  } catch (error) {
    await Promise.all([...apps.values()].map((runner) => runner.cleanup()));
    throw error;
  }

  // One reload check at a time, so concurrent requests do not reload an app twice.
  let reloading: Promise<void> = Promise.resolve();
  const reloadRebuilt = () => {
    // A failed reload (a broken build) fails that request; the next one tries again.
    reloading = reloading.catch(() => {}).then(async () => {
      for (const [name, build] of builds) {
        const { mtimeMs } = await stat(build.wasm).catch(() => ({ mtimeMs: build.mtimeMs }));
        if (mtimeMs === build.mtimeMs) continue;
        await apps.get(name)!.load(build.wasm, { dotenv: build.dotenv, client: config.client, edge: config.edge });
        build.mtimeMs = mtimeMs;
      }
    });
    return reloading;
  };

  return {
    config,
    apps,
    request: async (request = {}) => {
      await reloadRebuilt();
      return runRequest(config, apps, context, request);
    },
    cleanup: async () => {
      await Promise.all([...apps.values()].map((runner) => runner.cleanup()));
    },
  };
}

/** The rule matching this URL's path (first match wins), or null for main. */
export function matchRule(config: ResourceConfig, url: string): ResourceResult["rule"] {
  const pathname = new URL(url, "http://resource.invalid").pathname;
  const index = config.rules.findIndex((rule) => new RegExp(rule.match).test(pathname));
  if (index < 0) return null;
  const { name, match } = config.rules[index];
  return { index, name, match };
}

async function runRequest(
  config: ResourceConfig,
  apps: Map<string, IWasmRunner>,
  context: RequestContext,
  request: ResourceRequest,
): Promise<ResourceResult> {
  const url = request.url ?? config.request?.url;
  if (!url) throw new Error("resource.request: no url (set request.url in the config or pass one)");
  const rule = matchRule(config, url);
  const chosen = rule ? config.rules[rule.index] : undefined;
  const hooks: ResourceHooks = chosen?.hooks ?? config.main.hooks;
  const origin: ResourceOrigin = chosen?.origin ?? config.main.origin;
  // The request is the client's (its URL gives request.url / path / query ...); the origin gets it
  // at the origin's host, with the request's path and query, as a CDN forwards it.
  const requestUrl = url === BUILTIN_SHORTHAND ? BUILTIN_URL : url;

  // The client and edge apply once, to the request every app sees.
  const applied = cdnContext(context);
  const requestId = randomUUID();
  const properties = new PropertyResolver();
  properties.extractRuntimePropertiesFromUrl(requestUrl);
  const { "request.method": _method, ...urlProperties } = properties.getCalculatedProperties();
  const result: Omit<ResourceResult, "finalResponse"> = { rule, hooks: {} };
  let originStoreCalls: StoreCall[] | undefined;

  const hookApp = (hook: CdnHook) => {
    const assigned = hooks[hook];
    if (!assigned) return undefined;
    return typeof assigned === "string" ? { app: assigned, interruptOnError: true } : { app: assigned.app, interruptOnError: assigned.interruptOnError ?? true };
  };

  const flow = await runCdnFlow({
    runnerFor: (hook) => {
      const assigned = hookApp(hook);
      if (!assigned) return undefined;
      const runner = apps.get(assigned.app)!;
      return { callHook: (call) => runner.callHook({ ...call, requestId, context }) };
    },
    start: () => {},
    calculatedProperties: () => properties.getCalculatedProperties(),
    log: () => {},
    onHookError: (hook) => (hookApp(hook)!.interruptOnError ? "interrupt" : "continue"),
    onOrigin: (response) => {
      result.origin = "app" in origin
        ? { kind: "app", app: origin.app, response, ...(originStoreCalls ? { storeCalls: originStoreCalls } : {}) }
        : { kind: "builtIn" in origin || isBuiltInUrl(origin.url) ? "built-in" : "url", response };
    },
    origin: "app" in origin
      ? async (originRequest: OriginRequest) => {
          const answer = await httpAppOrigin(apps.get(origin.app)!, originRequest, context);
          originStoreCalls = answer.storeCalls;
          return answer.response;
        }
      : originHandler(origin, { log: () => {} }),
  }, {
    hook: "",
    request: {
      headers: withHeaders(applied.headers, request.headers ?? config.request?.headers ?? {}),
      body: request.body ?? config.request?.body ?? "",
      method: request.method ?? config.request?.method ?? "GET",
    },
    properties: { ...urlProperties, ...applied.properties, ...config.properties, ...request.properties },
    enforceProductionPropertyRules: true,
  }, requestUrl);

  for (const hook of CDN_HOOKS) {
    const hookResult = flow.hookResults[hook];
    if (hookResult) result.hooks[hook] = { app: hookApp(hook)!.app, result: hookResult };
  }
  return { ...result, finalResponse: flow.finalResponse };
}

/** An HTTP app of the resource answering as the origin. */
async function httpAppOrigin(
  runner: IWasmRunner,
  request: { url: string; method: string; headers: HeaderRecord; body: string },
  context: RequestContext,
): Promise<{ response: OriginResponse; storeCalls?: StoreCall[] }> {
  const url = new URL(request.url);
  const response = await runner.execute({
    path: url.pathname + url.search,
    method: request.method,
    headers: Object.fromEntries(Object.entries(HeaderManager.flattenToMap(request.headers)).filter(([key]) => !key.startsWith(":"))),
    // ponytail: execute() takes text, so a request body a hook made binary (isBase64) reaches the
    // app as its base64; give HttpRequest a byte body if a resource needs that.
    body: request.body,
    context,
  });
  const headers: HeaderRecord = {};
  for (const [key, value] of Object.entries(response.headers)) {
    if (value !== undefined) headers[key] = value;
  }
  return { response: {
    status: response.status,
    statusText: response.statusText,
    headers,
    body: response.body,
    contentType: response.contentType ?? "text/plain",
    isBase64: response.isBase64 ?? false,
  }, storeCalls: response.storeCalls };
}

/** An app entry's wasm and dotenv, from its own fields and its referenced config. */
type Confine = (file: string, kind: "file" | "wasm" | "dir") => string;

/** Checks a path is inside `root` (lexically and through symlinks); identity without a root. */
function confinement(root: string | undefined): Confine {
  return (file, kind) => {
    const absolute = path.resolve(file);
    if (!root) return absolute;
    const checked = validatePathOrThrow(absolute, { workspaceRoot: root, requireWasmExtension: kind === "wasm", checkExists: kind === "file" });
    if (kind === "dir") validateDotenvLeafs(checked);
    return checked;
  };
}

async function resolveApp(name: string, entry: ResourceConfig["apps"][string], baseDir: string, confine: Confine) {
  let wasm = entry.wasm && path.resolve(baseDir, entry.wasm);
  let dotenv = entry.dotenv && { ...entry.dotenv, path: path.resolve(baseDir, entry.dotenv.path ?? ".") };
  if (entry.config) {
    const file = confine(path.resolve(baseDir, entry.config), "file");
    const raw = JSON.parse(await readFile(file, "utf8"));
    if (raw && typeof raw === "object" && "apps" in raw) throw new Error(`app "${name}": ${entry.config} is a resource (resources cannot be nested)`);
    const referenced = TestConfigSchema.parse(raw);
    const dir = path.dirname(file);
    // As the debugger reads a config: wasm.path is relative to the app's project root, and
    // "<workspace>" is that root (dotenv.path stays relative to the config file).
    if (!wasm && referenced.wasm) {
      const root = projectRoot(dir);
      wasm = path.resolve(root, referenced.wasm.path.replace(/^<workspace>[\\/]?/, ""));
    }
    dotenv ??= referenced.dotenv && { ...referenced.dotenv, path: path.resolve(dir, referenced.dotenv.path ?? ".") };
  }
  if (!wasm) throw new Error(`app "${name}": no wasm (set "wasm" or "config")`);
  try {
    wasm = confine(wasm, "wasm");
    if (dotenv) dotenv.path = confine(dotenv.path, "dir");
  } catch (error) {
    throw new Error(`app "${name}": ${(error as Error).message}`);
  }
  try {
    await readFile(wasm);
  } catch {
    throw new Error(`app "${name}": ${wasm} not found (build ${name} first)`);
  }
  return { wasm, dotenv };
}

/** The nearest folder at or above `dir` with a Cargo.toml or package.json; else `dir`. */
function projectRoot(dir: string): string {
  for (let at = dir; ; at = path.dirname(at)) {
    if (existsSync(path.join(at, "Cargo.toml")) || existsSync(path.join(at, "package.json"))) return at;
    if (path.dirname(at) === at) return dir;
  }
}

function checkReferences(config: ResourceConfig): void {
  const known = (app: string, where: string) => {
    if (!(app in config.apps)) throw new Error(`${where}: unknown app "${app}"`);
  };
  const checkHooks = (hooks: ResourceHooks | undefined, where: string) => {
    for (const [hook, assigned] of Object.entries(hooks ?? {})) {
      if (assigned) known(typeof assigned === "string" ? assigned : assigned.app, `${where}.hooks.${hook}`);
    }
  };
  const checkOrigin = (origin: ResourceOrigin | undefined, where: string) => {
    if (origin && "app" in origin) known(origin.app, `${where}.origin`);
  };
  checkHooks(config.main.hooks, "main");
  checkOrigin(config.main.origin, "main");
  config.rules.forEach((rule, index) => {
    try {
      new RegExp(rule.match);
    } catch {
      throw new Error(`rules[${index}].match: invalid regex ${rule.match}`);
    }
    checkHooks(rule.hooks, `rules[${index}]`);
    checkOrigin(rule.origin, `rules[${index}]`);
  });
}

/** Hooks need CDN (proxy-wasm) apps; an app origin needs an HTTP app. */
function checkAppTypes(config: ResourceConfig, apps: Map<string, IWasmRunner>): void {
  const sections = [{ where: "main", hooks: config.main.hooks, origin: config.main.origin }, ...config.rules.map((rule, index) => ({ where: `rules[${index}]`, hooks: rule.hooks, origin: rule.origin }))];
  for (const { where, hooks, origin } of sections) {
    for (const [hook, assigned] of Object.entries(hooks ?? {})) {
      const app = typeof assigned === "string" ? assigned : assigned?.app;
      if (app && apps.get(app)!.getType() !== "proxy-wasm") throw new Error(`${where}.hooks.${hook}: "${app}" is an HTTP app; hooks need a CDN app`);
    }
    if (origin && "app" in origin && apps.get(origin.app)!.getType() !== "http-wasm") {
      throw new Error(`${where}.origin: "${origin.app}" is a CDN app; an origin app must be an HTTP app`);
    }
  }
}
