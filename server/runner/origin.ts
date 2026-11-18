/**
 * A CDN request's origin as declared in a config: a URL (or the "built-in" echo responder), or
 * `builtIn`, a local test double: a fixed response, or files served from a folder.
 *
 * The origin is not part of FastEdge (on the edge it is the customer's server), so nothing here
 * mirrors production; it only has to answer like an HTTP server.
 *
 * Serving files is the security-sensitive part: a request path from the client (or a hook) picks
 * the file. Every path is decoded once, dot segments and dotfiles are refused, and the real path
 * (symlinks resolved) must be inside the folder's real path. Only regular files up to
 * MAX_FILE_BYTES are read; GET and HEAD only. Errors never echo file-system paths.
 */
import { constants, realpathSync, statSync } from "node:fs";
import { open, readlink, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { BuiltInOrigin, Origin } from "../schemas/config.js";
import type { HeaderRecord } from "./types.js";
import { validatePathOrThrow } from "../utils/pathValidator.js";
import { BUILTIN_URL, builtInResponse, fetchOrigin, isBuiltInUrl, type CdnFlowHost, type OriginRequest, type OriginResponse } from "./cdnFlow.js";

/** Larger files are refused (the whole body is held in memory, as base64 too). */
export const MAX_FILE_BYTES = 32 * 1024 * 1024;

const DEPRECATED_HEADERS = ["x-debugger-status", "x-debugger-content"];

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".json": "application/json",
  ".txt": "text/plain; charset=utf-8", ".xml": "application/xml", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".avif": "image/avif",
  ".ico": "image/x-icon", ".pdf": "application/pdf", ".wasm": "application/wasm", ".woff": "font/woff",
  ".woff2": "font/woff2", ".mp4": "video/mp4", ".webm": "video/webm", ".mp3": "audio/mpeg",
};

export function contentTypeOf(file: string): string {
  return TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}

/**
 * The origin with its file paths made absolute (relative ones against `baseDir`), passed through
 * `confine` (the debugger: inside the workspace) and turned into real paths. Call it when the
 * config loads: requests then check against these fixed real paths and never resolve them again,
 * so a folder swapped for a symlink later is not followed.
 */
export function resolveOrigin<T extends Origin | { app: string }>(origin: T, baseDir: string, confine: (absolute: string, kind: "file" | "dir") => string = (p) => p): T {
  if (!("builtIn" in origin)) return origin;
  const builtIn = { ...origin.builtIn };
  if (builtIn.bodyFile !== undefined) {
    if (path.basename(builtIn.bodyFile).startsWith(".")) throw new Error(`origin.builtIn.bodyFile: dotfiles are not served (${builtIn.bodyFile})`);
    builtIn.bodyFile = realpathSync(confine(path.resolve(baseDir, builtIn.bodyFile), "file"));
  }
  if (builtIn.files !== undefined) {
    builtIn.files = realpathSync(confine(path.resolve(baseDir, builtIn.files), "dir"));
    if (path.dirname(builtIn.files) === builtIn.files) throw new Error("origin.builtIn.files: a file-system root cannot be served");
  }
  return { builtIn } as T;
}

/** A `resolveOrigin` confinement: the path must exist inside `root` (lexically and through symlinks). */
export function confineTo(root: string, options: { allowedFolders?: boolean } = {}): (absolute: string, kind: "file" | "dir") => string {
  return (absolute, kind) => {
    const checked = validatePathOrThrow(absolute, { workspaceRoot: root, requireWasmExtension: false, checkExists: kind === "file", allowedFolders: options.allowedFolders });
    if (kind === "dir" && !statSync(checked, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`${absolute} is not a folder`);
    return checked;
  };
}

/** Answers a flow's origin request for a resolved origin (see resolveOrigin). */
export function originHandler(origin: Origin, host: Pick<CdnFlowHost, "log">): (request: OriginRequest) => Promise<OriginResponse> {
  if ("url" in origin) {
    if (isBuiltInUrl(origin.url)) {
      return async (r) => builtInResponse(host, r.method, r.headers, r.body, r.properties, r.isBase64);
    }
    // As a CDN forwards it: the request's path and query, at the origin's host.
    return async (r) => {
      const forwarded = new URL(r.url);
      const target = new URL(forwarded.pathname + forwarded.search, origin.url).href;
      return fetchOrigin(host, target, r.method, r.headers, r.body, { ...r.properties, "request.url": target }, r.isBase64);
    };
  }
  const spec = origin.builtIn;
  return async (r) => {
    const ignored = DEPRECATED_HEADERS.filter((name) => Object.keys(r.headers).some((key) => key.toLowerCase() === name));
    if (ignored.length) host.log(`Ignored ${ignored.join(", ")}: the config's origin.builtIn decides the response (these headers are deprecated)`);
    if (spec.files !== undefined) {
      return withHeaders(await serveFile(spec.files, r.method, new URL(r.url, BUILTIN_URL).pathname, host), spec.headers);
    }
    const response = withHeaders(await fixedResponse(spec), spec.headers);
    return r.method === "HEAD" ? { ...response, body: "", isBase64: false } : response;
  };
}

async function fixedResponse(spec: BuiltInOrigin): Promise<OriginResponse> {
  const status = spec.status ?? 200;
  if (spec.bodyFile !== undefined) {
    const bytes = await readRegularFile(spec.bodyFile, { file: spec.bodyFile });
    if (!bytes) throw new Error("origin.builtIn.bodyFile: not a readable file, or larger than 32 MiB");
    return bytesResponse(status, bytes, contentTypeOf(spec.bodyFile));
  }
  const body = spec.body ?? "";
  return bytesResponse(status, Buffer.from(body), "text/plain; charset=utf-8");
}

/**
 * GET /a/b.png → <folder>/a/b.png; 404 for anything that is not a regular file inside it.
 * `folder` is a real path (resolveOrigin); it is not resolved again here.
 */
export async function serveFile(folder: string, method: string, pathname: string, host: Pick<CdnFlowHost, "log">): Promise<OriginResponse> {
  if (method !== "GET" && method !== "HEAD") return withHeaders(text(405, "Method Not Allowed"), { allow: "GET, HEAD" });
  const located = await locate(folder, pathname);
  if (!located) {
    host.log(`Built-in files: no file for ${JSON.stringify(pathname)}`);
    return text(404, "Not Found");
  }
  const bytes = await readRegularFile(located.file, { folder });
  if (!bytes) {
    host.log(`Built-in files: ${JSON.stringify(pathname)} is not a regular file of at most 32 MiB`);
    return text(404, "Not Found");
  }
  const response = bytesResponse(200, bytes, contentTypeOf(located.file));
  // HEAD: the headers of a GET, no body.
  return method === "HEAD" ? { ...response, body: "", isBase64: false } : response;
}

/** The real path of the file the URL path names inside the real path `folder`, or null. */
async function locate(folder: string, pathname: string): Promise<{ file: string } | null> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null; // malformed percent-encoding
  }
  // Backslash and colon: Windows separators, drive letters and alternate data streams.
  if (/[\0\\:]/.test(decoded)) return null;
  const segments = decoded.split("/").filter(Boolean);
  // "." / ".." and dotfiles (.env, .git, .fastedge-debug) are never served.
  if (!segments.length || segments.some((s) => s.startsWith("."))) return null;
  try {
    const real = await realpath(path.join(folder, ...segments));
    // Symlinks resolved: the file must still be inside the folder.
    return real.startsWith(folder + path.sep) ? { file: real } : null;
  } catch {
    return null; // missing
  }
}

/**
 * The bytes of a regular file of at most MAX_FILE_BYTES, else null. The file actually opened must
 * be `expected.file`, or inside the real folder `expected.folder`: a symlink swapped into the path
 * after it was checked (by a process that can write there) is refused.
 */
async function readRegularFile(file: string, expected: { file: string } | { folder: string }): Promise<Buffer | null> {
  let handle;
  try {
    // O_NOFOLLOW: the last component cannot have become a symlink since realpath.
    handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch {
    return null;
  }
  try {
    // fstat on the opened file: what was opened, not what the path names now.
    const stats = await handle.stat();
    if (!stats.isFile() || stats.size > MAX_FILE_BYTES) return null;
    if (!(await openedAsExpected(handle.fd, file, stats, expected))) return null;
    // Read at most the limit, even if the file grows after the fstat.
    const chunks: Buffer[] = [];
    let total = 0;
    for (;;) {
      const chunk = Buffer.alloc(64 * 1024);
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > MAX_FILE_BYTES) return null;
      chunks.push(chunk.subarray(0, bytesRead));
    }
    return Buffer.concat(chunks, total);
  } finally {
    await handle.close();
  }
}

/** The opened file (by its fd) is the expected one, not something a swapped symlink led to. */
async function openedAsExpected(fd: number, file: string, opened: { dev: number; ino: number }, expected: { file: string } | { folder: string }): Promise<boolean> {
  let actual: string | null = null;
  try {
    // Linux: the kernel's own path of the open file.
    actual = await readlink(`/proc/self/fd/${fd}`);
  } catch {
    // not Linux
  }
  if (actual !== null) return "file" in expected ? actual === expected.file : actual.startsWith(expected.folder + path.sep);
  // Elsewhere: the checked path must still be the very file that was opened.
  // ponytail: a swap and swap-back within this window is not caught off Linux.
  const now = await stat(file).catch(() => null);
  return !!now && now.dev === opened.dev && now.ino === opened.ino;
}

const strictUtf8 = new TextDecoder("utf-8", { fatal: true });

/** Text when the bytes are UTF-8, else base64 (as the flow carries binary bodies). */
function bytesResponse(status: number, bytes: Buffer, contentType: string): OriginResponse {
  let body: string | null = null;
  try {
    body = strictUtf8.decode(bytes);
  } catch {
    // binary
  }
  return {
    status,
    statusText: STATUS_TEXT[status] ?? String(status),
    headers: { "content-type": contentType, "content-length": String(bytes.length), "x-content-type-options": "nosniff" },
    body: body ?? bytes.toString("base64"),
    contentType,
    isBase64: body === null,
  };
}

function text(status: number, message: string): OriginResponse {
  return bytesResponse(status, Buffer.from(message), "text/plain; charset=utf-8");
}

/** The config's headers over the response's (names compared without case). */
function withHeaders(response: OriginResponse, extra: Record<string, string> | undefined): OriginResponse {
  if (!extra) return response;
  const headers: HeaderRecord = { ...response.headers };
  for (const [name, value] of Object.entries(extra)) {
    for (const key of Object.keys(headers)) if (key.toLowerCase() === name.toLowerCase()) delete headers[key];
    headers[name.toLowerCase()] = value;
  }
  const contentType = headers["content-type"];
  return { ...response, headers, contentType: typeof contentType === "string" ? contentType : response.contentType };
}

const STATUS_TEXT: Record<number, string> = { 200: "OK", 201: "Created", 204: "No Content", 301: "Moved Permanently", 302: "Found", 304: "Not Modified", 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed", 500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable" };
