import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { request as undiciRequest } from "undici";

export interface TestServer {
  /** http://127.0.0.1:<port> */
  base: string;
  token: string;
  workspacePath: string;
  close: () => Promise<void>;
}

/**
 * Start the debugger server as a subprocess using the pre-built bundle.
 * The bundle (dist/server.js) must exist — run `pnpm run build:backend` first.
 *
 * Injects a known token via FASTEDGE_DEBUG_TOKEN and a fresh temp dir as
 * WORKSPACE_PATH so path-containment tests have a realistic root.
 * Parses stderr to discover the actual port (the server auto-increments from
 * 5179 if needed, so we can't assume a fixed port).
 */
export async function startTestServer(): Promise<TestServer> {
  const token = randomBytes(16).toString("hex");
  const workspacePath = mkdtempSync(join(tmpdir(), "fastedge-test-"));
  const serverBundle = resolve(process.cwd(), "dist/server.js");

  const proc = spawn("node", [serverBundle], {
    env: {
      ...process.env,
      FASTEDGE_DEBUG_TOKEN: token,
      FASTEDGE_BIND_HOST: "127.0.0.1",
      WORKSPACE_PATH: workspacePath,
    },
    stdio: ["ignore", "ignore", "pipe"],
  });

  const port = await new Promise<number>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Server did not start within 10 s")),
      10_000,
    );

    proc.stderr!.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      const match = text.match(/listening on http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(parseInt(match[1], 10));
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    proc.on("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited before ready (code ${code})`));
    });
  });

  return {
    base: `http://127.0.0.1:${port}`,
    token,
    workspacePath,
    close: () =>
      new Promise<void>((res) => {
        proc.once("exit", () => {
          rmSync(workspacePath, { recursive: true, force: true });
          res();
        });
        proc.kill("SIGTERM");
      }),
  };
}

/** Authenticated fetch — adds the session token header automatically. */
export function authedFetch(
  base: string,
  token: string,
  path: string,
  opts: RequestInit = {},
): Promise<Response> {
  return fetch(`${base}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "x-fastedge-token": token,
      ...((opts.headers as Record<string, string>) ?? {}),
    },
  });
}

/**
 * Raw HTTP request via undici — lets tests set headers that fetch() forbids
 * (e.g. Host). Returns { statusCode, body }.
 */
export async function rawRequest(
  base: string,
  path: string,
  opts: { headers?: Record<string, string>; method?: string; body?: string } = {},
): Promise<{ statusCode: number; body: unknown }> {
  const { statusCode, body } = await undiciRequest(`${base}${path}`, {
    method: opts.method ?? "GET",
    headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
    body: opts.body,
  });
  return { statusCode, body: await body.json().catch(() => null) };
}
