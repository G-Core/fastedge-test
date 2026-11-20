import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync, symlinkSync, truncateSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { originHandler, resolveOrigin, serveFile, MAX_FILE_BYTES } from "../../../runner/origin";
import { BuiltInOriginSchema, OriginSchema } from "../../../schemas/config";
import type { OriginRequest } from "../../../runner/cdnFlow";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff]);
const quiet = { log: () => {} };

describe("built-in origin: serving files", () => {
  let dir: string;
  let site: string;
  const get = (pathname: string, method = "GET") => serveFile(site, method, pathname, quiet);

  beforeAll(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), "origin-test-")));
    site = join(dir, "site");
    mkdirSync(join(site, "img"), { recursive: true });
    writeFileSync(join(site, "img", "a.png"), PNG);
    writeFileSync(join(site, "index.html"), "<h1>hi</h1>");
    writeFileSync(join(site, ".env"), "SECRET=1");
    mkdirSync(join(site, ".git"));
    writeFileSync(join(site, ".git", "config"), "x");
    writeFileSync(join(dir, "outside.txt"), "outside");
    symlinkSync(join(dir, "outside.txt"), join(site, "escape.txt"));
    symlinkSync(dir, join(site, "up"));
    symlinkSync(join(site, "index.html"), join(site, "alias.html"));
    writeFileSync(join(site, "big.bin"), "");
    truncateSync(join(site, "big.bin"), MAX_FILE_BYTES + 1);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("serves a file by request path, binary as base64, with its content-type", async () => {
    const png = await get("/img/a.png");
    expect(png).toMatchObject({ status: 200, isBase64: true, contentType: "image/png" });
    expect(Buffer.from(png.body, "base64")).toEqual(PNG);
    expect(png.headers).toMatchObject({ "content-length": "10", "x-content-type-options": "nosniff" });
    expect(await get("/index.html")).toMatchObject({ status: 200, isBase64: false, body: "<h1>hi</h1>" });
    expect((await get("/alias.html")).status).toBe(200); // a link that stays inside
  });

  it.each([
    ["missing", "/nope.png"],
    ["the folder itself", "/"],
    ["a directory", "/img"],
    ["a dotfile", "/.env"],
    ["inside a dot directory", "/.git/config"],
    ["an encoded dotfile", "/%2eenv"],
    ["encoded traversal", "/%2e%2e/outside.txt"],
    ["encoded slash traversal", "/img%2f..%2f..%2foutside.txt"],
    ["a backslash", "/img%5c..%5c..%5coutside.txt"],
    ["a NUL byte", "/index.html%00.png"],
    ["a colon (drive letter / stream)", "/index.html:stream"],
    ["malformed encoding", "/%E0%A4%A"],
    ["a symlink to a file outside", "/escape.txt"],
    ["a symlinked folder outside", "/up/outside.txt"],
    ["a file over the size limit", "/big.bin"],
  ])("answers 404 for %s, without file-system paths", async (_case, pathname) => {
    const response = await get(pathname);
    expect(response.status).toBe(404);
    expect(response.body).toBe("Not Found");
  });

  it("answers GET and HEAD only; HEAD has the headers and no body", async () => {
    expect(await get("/index.html", "POST")).toMatchObject({ status: 405, headers: { allow: "GET, HEAD" } });
    const head = await get("/img/a.png", "HEAD");
    expect(head).toMatchObject({ status: 200, body: "", headers: { "content-length": "10" } });
  });

  it("the folder is fixed when the config loads: swapping it for a symlink later serves nothing", async () => {
    const swapDir = realpathSync(mkdtempSync(join(tmpdir(), "origin-swap-")));
    try {
      mkdirSync(join(swapDir, "pub"));
      writeFileSync(join(swapDir, "pub", "a.txt"), "inside");
      mkdirSync(join(swapDir, "secret"));
      writeFileSync(join(swapDir, "secret", "a.txt"), "secret");
      const resolved = resolveOrigin({ builtIn: { files: "pub" } }, swapDir);
      const handler = originHandler(resolved, quiet);
      const req: OriginRequest = { url: "https://example.com/a.txt", method: "GET", headers: {}, body: "", properties: {} };
      expect((await handler(req)).body).toBe("inside");
      rmSync(join(swapDir, "pub"), { recursive: true });
      symlinkSync(join(swapDir, "secret"), join(swapDir, "pub"));
      expect(await handler(req)).toMatchObject({ status: 404, body: "Not Found" });
    } finally {
      rmSync(swapDir, { recursive: true, force: true });
    }
  });

  it("a hook's request.url only picks a path inside the folder", async () => {
    const handler = originHandler({ builtIn: { files: site } }, quiet);
    const request = (url: string): OriginRequest => ({ url, method: "GET", headers: {}, body: "", properties: {} });
    // The URL parser drops dot segments before the path is used: /../outside.txt is /outside.txt.
    expect((await handler(request("https://example.com/a/../../outside.txt"))).status).toBe(404);
    expect((await handler(request("https://example.com/img/a.png?x=1"))).status).toBe(200);
  });
});

describe("built-in origin: fixed responses and config", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "origin-fixed-"));
    writeFileSync(join(dir, "pic.png"), PNG);
    writeFileSync(join(dir, ".env"), "SECRET=1");
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const request: OriginRequest = { url: "https://example.com/x", method: "GET", headers: { "x-debugger-status": "500" }, body: "", properties: {} };

  it("answers with the declared status, headers and body; the config wins over x-debugger-* (logged)", async () => {
    const logs: string[] = [];
    const handler = originHandler({ builtIn: { status: 404, headers: { "Content-Type": "application/json", "x-a": "1" }, body: '{"e":1}' } }, { log: (m) => logs.push(m) });
    expect(await handler(request)).toMatchObject({ status: 404, body: '{"e":1}', contentType: "application/json", headers: { "content-type": "application/json", "x-a": "1" } });
    expect(logs.join()).toMatch(/Ignored x-debugger-status.*deprecated/);
  });

  it("HEAD gets a fixed response's headers without its body", async () => {
    const response = await originHandler({ builtIn: { body: "hello" } }, quiet)({ ...request, method: "HEAD", headers: {} });
    expect(response).toMatchObject({ status: 200, body: "", headers: { "content-length": "5" } });
  });

  it("bodyFile: relative to the config, binary kept; dotfiles and paths outside the confinement refused", async () => {
    const resolved = resolveOrigin({ builtIn: { bodyFile: "pic.png" } }, dir);
    const response = await originHandler(resolved, quiet)(request);
    expect(response).toMatchObject({ status: 200, isBase64: true, contentType: "image/png" });
    expect(Buffer.from(response.body, "base64")).toEqual(PNG);

    expect(() => resolveOrigin({ builtIn: { bodyFile: ".env" } }, dir)).toThrow(/dotfiles/);
    const confine = () => {
      throw new Error("outside the workspace");
    };
    expect(() => resolveOrigin({ builtIn: { files: "/etc" } }, dir, confine)).toThrow(/outside/);
    expect(() => resolveOrigin({ builtIn: { files: "/" } }, dir)).toThrow(/root cannot be served/);
    expect(resolveOrigin({ url: "built-in" }, dir, confine)).toEqual({ url: "built-in" });
  });

  it("the schema allows one body source, no status with files, and only safe header names and values", () => {
    expect(BuiltInOriginSchema.safeParse({ body: "a", files: "x" }).success).toBe(false);
    expect(BuiltInOriginSchema.safeParse({ files: "x", status: 200 }).success).toBe(false);
    expect(BuiltInOriginSchema.safeParse({ headers: { "x-a": "1\r\nset-cookie: a" } }).success).toBe(false);
    expect(BuiltInOriginSchema.safeParse({ headers: { "bad name": "1" } }).success).toBe(false);
    expect(BuiltInOriginSchema.safeParse({ status: 99 }).success).toBe(false);
    expect(BuiltInOriginSchema.safeParse({ unknown: 1 }).success).toBe(false);
    expect(BuiltInOriginSchema.safeParse({ files: "" }).success).toBe(false);
    expect(BuiltInOriginSchema.safeParse({ bodyFile: "" }).success).toBe(false);
    expect(OriginSchema.safeParse({ builtIn: { status: 201, body: "ok" } }).success).toBe(true);
  });
});

describe("URL origin", () => {
  it("forwards the request's path at the origin's host, even a path starting with //", async () => {
    const seen: string[] = [];
    const server = http.createServer((req, res) => {
      seen.push(`${req.headers.host} ${req.url}`);
      res.end("ok");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as { port: number };
    try {
      const handler = originHandler({ url: `http://127.0.0.1:${port}/base` }, quiet);
      const request = (url: string): OriginRequest => ({ url, method: "GET", headers: {}, body: "", properties: {} });
      expect(await handler(request("https://client.example/p?q=1"))).toMatchObject({ status: 200 });
      await handler(request("https://client.example//attacker.example/p"));
      expect(seen).toEqual([`127.0.0.1:${port} /p?q=1`, `127.0.0.1:${port} //attacker.example/p`]);
    } finally {
      server.close();
    }
  });
});
