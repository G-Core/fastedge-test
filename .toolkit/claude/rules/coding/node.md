---
doc_type: policy
audience: bot
lang: en
tags: ['nodejs', 'backend', 'coding', 'standards']
last_modified: 2026-03-10T15:52:23Z
copyright: '© 2026 gcore.com'
paths:
  - '**/*.{js,ts,mjs,cjs,jsx,tsx}'
---

NODE.JS RULES
=============

## TL;DR

Run services on an actively supported Node LTS (Node 24 as of 2026-02-12).
Prefer ESM per package. Never block the event loop: async IO, streams, worker threads.
Validate env and external input. Fail fast on unhandled errors. Use JSON logs and
reproducible dependency installs.

RUNTIME AND MODULES
-------------------

Rules
-----

- New services MUST target the current Active LTS major (Node 24 as of 2026-02-12).
- Existing services on Maintenance LTS MUST have a migration plan before the major reaches EOL.
  Node 20 EOL: 2026-04-30.
- Declare the supported runtime in `package.json` `engines.node` and enforce it in CI and local tooling.
- For applications/services, pin `engines.node` to a single major (`>=24 <25`) and upgrade intentionally
  (tests + deploy).
- Choose ONE module system per package: ESM (`"type": "module"`) or CommonJS (default / `"type": "commonjs"`).
- In ESM packages, use explicit file extensions for relative imports (`./logger.js`).
  Use `node:` specifiers for built-ins.
- Avoid experimental features and experimental Node flags in production.
  If you must enable a flag, document why and review it quarterly.

Examples
--------

package.json baseline for an ESM service:
```json
{
  "type": "module",
  "engines": { "node": ">=24 <25" }
}
```

ASYNC IO AND EVENT LOOP
-----------------------

Rules
-----

- Use asynchronous APIs for IO (`node:fs/promises`, streaming APIs, async crypto variants).
  Do not block the event loop.
- Synchronous APIs (`readFileSync`, `execSync`, `pbkdf2Sync`) are allowed only in short-lived CLI scripts
  or one-time startup.
- Prefer `async`/`await` for new code. If you start a Promise, you MUST `await` it or attach a `.catch()` to avoid
  unhandled rejections.
- Use streams for large payloads and files. Always use `pipeline()` to handle backpressure and propagate stream errors.
- Put explicit timeouts/cancellation on outbound network calls. For `fetch`, use `AbortSignal.timeout(ms)` or
  `AbortController`.

Examples
--------

Non-blocking file read:
```js
import { readFile } from 'node:fs/promises';

export async function readJson(filePath) {
  const text = await readFile(filePath, 'utf8');
  return JSON.parse(text);
}
```

Safe streaming copy with backpressure:
```js
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

export async function copyFile(src, dest) {
  await pipeline(createReadStream(src), createWriteStream(dest));
}
```

Outbound request with timeout:
```js
const res = await fetch(url, { signal: AbortSignal.timeout(2_000) });
```

CONFIGURATION AND SECRETS
-------------------------

Rules
-----

- Treat configuration as runtime input. Use environment variables and/or mounted config files.
  `.env` files are for local development only.
- Validate and parse `process.env` exactly once at startup. Convert to correct types,
  apply defaults explicitly, and fail fast on missing/invalid values.
- Do not commit secrets. Do not log secrets. Redact sensitive fields (auth headers, cookies, tokens) in logs by default.
- Do not rely on implicit global state like `NODE_ENV` being set correctly.
  If behavior differs by environment, make it an explicit config value.

Examples
--------

Typed env validation (example with zod):
```js
import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z.string().url(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export const env = Env.parse(process.env);
```

INPUT VALIDATION AND EXECUTION SAFETY
-------------------------------------

Rules
-----

- Validate untrusted input at boundaries: HTTP bodies, query params, headers, webhooks, queue messages, env vars.
- Keep raw input as `unknown` until validated. Only pass validated/typed data into business logic.
- Enforce payload size limits and content types at the edge (reverse proxy AND application).
- Never build shell commands from untrusted input. Prefer `spawn`/`execFile` with an args array and validate every arg.

Examples
--------

Shell execution — wrong vs right:
```js
// WRONG: shell injection via filename
import { exec } from 'node:child_process';
exec(`ffmpeg -i ${userFile} output.mp4`); // userFile = "; rm -rf /"

// RIGHT: args array, no shell, no injection
import { execFile } from 'node:child_process';
execFile('ffmpeg', ['-i', userFile, 'output.mp4']);
```

ERROR HANDLING
--------------

Rules
-----

- Catch errors only when you can add value (context, mapping to a known outcome, retry). Otherwise let them bubble up.
- When wrapping errors, preserve the original via `cause`: `new Error('...', { cause: err })`.
- Never swallow errors. "Log and continue" is only allowed when you also surface failure (metric/alert)
  and the program is still in a valid state.
- Do not leak internal details to clients. API responses must be safe; logs must contain the full diagnostic detail.

Examples
--------

Preserve the original error cause:
```js
try {
  await connectToDatabase();
} catch (err) {
  throw new Error('Database connection failed', { cause: err });
}
```

PROCESS LIFECYCLE
-----------------

Rules
-----

- Services MUST shut down gracefully on `SIGTERM`/`SIGINT`: stop accepting new work,
  wait for in-flight work, then exit.
- Add a hard shutdown timeout so deploys cannot hang forever (for example, force-exit after 30 seconds).
- Treat `uncaughtException` and `unhandledRejection` as fatal: log once and exit non-zero. Do not keep running in an
  unknown state.
- Prefer one process per container/VM and scale horizontally. Use worker threads only for CPU-bound work.

Examples
--------

Graceful shutdown with hard timeout (implements all rules above):
```js
import { createServer } from 'node:http';

const SHUTDOWN_TIMEOUT_MS = 30_000;
const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('ok');
});

server.listen(3000);

const shutdown = (signal) => {
  console.log(`received ${signal}, shutting down`);

  // Hard timeout — force-exit if graceful shutdown hangs
  const forceExit = setTimeout(() => {
    console.error(`graceful shutdown timed out after ${SHUTDOWN_TIMEOUT_MS}ms, forcing exit`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref(); // do not keep the event loop alive just for the timer

  server.close((err) => {
    clearTimeout(forceExit);
    if (err) {
      console.error(err);
      process.exit(1);
    }
    process.exit(0);
  });
};

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
```

Fatal handler for unhandled errors (log once, exit immediately):
```js
process.on('unhandledRejection', (reason) => {
  console.error('unhandled rejection, crashing', reason);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('uncaught exception, crashing', err);
  process.exit(1);
});
```

LOGGING AND OBSERVABILITY
-------------------------

Rules
-----

- Use structured (JSON) logs in services. Log entries MUST include at least: `level`, `msg`, and an error stack when an
  error occurs.
- Prefer a real logger over raw `console.*` in long-running services (levels, redaction, serializers, performance).
- Include correlation identifiers (request id / trace id) so operators can follow a request across services.
- Redact secrets and avoid PII by default. If you must log PII, document why and how it is protected.

Examples
--------

Structured logger with redaction (example with pino):
```js
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie'],
    remove: true,
  },
});
```

DEPENDENCIES AND BUILDS
-----------------------

Rules
-----

- Commit exactly one lockfile (`package-lock.json`, `pnpm-lock.yaml`, or `yarn.lock`). Do not commit multiple lockfiles.
- Use reproducible installs in CI and deploy pipelines (never plain `npm install`):

Tool | Command
---- | -----------------------------
npm  | `npm ci`
pnpm | `pnpm install --frozen-lockfile`
yarn | `yarn install --immutable`

- Do not pin every direct dependency to an exact version in `package.json` by default. Use semver ranges and rely on the
  lockfile for exact resolution.
- Keep dependencies updated. High/critical vulnerabilities in runtime dependencies are release blockers until mitigated.
- Use `overrides`/`resolutions` to patch vulnerable transitive dependencies and document why the override exists.
- Avoid adding large dependencies when a built-in Node API is sufficient.
  New runtime dependencies must be justified in the PR description (why needed, maintenance health, license).

TESTING
-------

Rules
-----

- Tests MUST run on the supported Node major in CI (the same `engines.node` range).
- Prefer the built-in test runner for simple Node projects (`node --test`) or use a well-maintained framework.
- Avoid flaky tests: no real network calls, no real time, no shared global state across tests.
- Mock time with `mock.timers` instead of real delays. Mock network with interceptors, not live endpoints.
- Each test file must be independently runnable — no implicit dependency on test execution order.
- Test error paths, not just happy paths. If a function can throw, test that it throws the right thing.

Examples
--------

Built-in test runner with mocked timers (no real delays, no flakiness):
```js
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

describe('retry', () => {
  it('retries after delay on failure', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });

    const fn = mock.fn()
      .mockImplementationOnce(() => { throw new Error('fail'); })
      .mockImplementationOnce(() => 'ok');

    const promise = retry(fn, { delay: 1000, attempts: 2 });
    mock.timers.tick(1000);
    const result = await promise;

    assert.equal(result, 'ok');
    assert.equal(fn.mock.callCount(), 2);
    mock.timers.reset();
  });
});
```

Testing error paths — verify the error, not just that it throws:
```js
it('rejects with cause on db failure', async () => {
  await assert.rejects(
    () => getUser('bad-id'),
    (err) => {
      assert.equal(err.message, 'User lookup failed');
      assert.equal(err.cause?.code, 'ECONNREFUSED');
      return true;
    },
  );
});
```
