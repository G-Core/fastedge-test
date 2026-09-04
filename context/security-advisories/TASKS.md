# Security fix follow-up tasks — fastedge-test

Branch: `fix/security-advisories`. Audit date: 2026-09-03.
The SA-*.md files in this folder are background only. **This file is the work list.**
Work top to bottom. Do not skip a task's "Verify" step. Do not commit this folder.

## Rules for every task

- Keep all comments self-explanatory. Never write `SA-001`, "advisory", or reference this folder in code or docs.
- Every non-trivial task adds or updates a test under `server/__tests__/server/` (real HTTP against the built `dist/server.js`; see `helpers.ts` there) or `server/__tests__/unit/`.
- Before finishing: `pnpm build && pnpm test && pnpm run test:server` must be green.
- Do not touch the VSCode repo from here. Tasks that need the extension changed say so; the extension has its own task list.

---

## T1 ✅ DONE — BLOCKER: `/api/config/save-as` rejects every VSCode and browser-prompt Save As

**Where**
- `server/server.ts` ~line 675 (`/api/config/show-save-dialog`) and ~696 (`/api/config/save-as`, `pendingSavePaths` check).
- `frontend/src/components/ConfigEditorModal/ConfigEditorModal.tsx` lines ~36-53 (Strategy 0, VSCode iframe) and ~110-125 (Strategy 3, `prompt()` fallback).

**Problem**
`save-as` now only accepts a path previously vended by `show-save-dialog`. That route returns 501 when the server is forked by VSCode (no Electron). Strategy 0 gets its path from the extension's own `showSaveDialog` and posts it → 403 "filePath was not vended by the save dialog". Strategy 3 (Firefox/Safari, no `showSaveFilePicker`) is now dead code that always 403s. No test covers either.

**Fix**
1. Strategy 0: stop calling `save-as`. Post the config JSON to the host together with the existing `openSavePicker` message (add a `config` field). The extension writes the file itself. (Extension side is task T2 in `FastEdge-vscode/context/security-advisories/TASKS.md`; coordinate the message shape: `{ type: "openSavePicker", config: string }` and the extension replies `{ type: "savePickerResult", path: string | null, saved: boolean }`.) Keep the reply so the UI can show "saved to X".
2. Strategy 3: delete it. If neither `showSaveFilePicker` nor the VSCode host is available, show "Save As is not supported in this browser; use Save" instead of `prompt()`.
3. Leave the server-side vend check as is.

**Verify**
- Unit test in `frontend/` (vitest) that in the iframe case Strategy 0 posts `openSavePicker` with `config` and never calls `/api/config/save-as`.
- Server test: POST `/api/config/save-as` with an un-vended absolute path → 403 (already exists, keep it).

---

## T2 — Egress policy bypasses (SSRF)

**Where** `server/runner/egressPolicy.ts` (whole file, ~73 lines). Call sites `server/runner/ProxyWasmRunner.ts` ~534 and ~975.

**Problem** three bypasses:
1. IPv4-mapped IPv6: `http://[::ffff:169.254.169.254]/` → `URL.hostname` is `[::ffff:a9fe:a9fe]`; none of the regexes match; request reaches the metadata IP.
2. Redirects: both `fetch()` calls default to `redirect: "follow"`, so an allowed host that 302s to `169.254.169.254` is followed with no re-check.
3. DNS resolve-then-fetch: `resolveToIp` does one `dns.lookup`, then `fetch` resolves again (rebinding). Only the first A record is checked.

**Fix**
1. In the blocked-IP check, normalise first: strip `[` `]`; if the address starts with `::ffff:` extract the embedded IPv4 (both `::ffff:a.b.c.d` and `::ffff:hex:hex` forms; `net.isIP` + manual parse) and run the IPv4 rules on it. Also block `fc00::/7` (currently only `fd00::/8`).
2. Pass `redirect: "manual"` to both fetches. If the response is 3xx, return it to the WASM as-is (do not follow). Comment: "redirects are not followed; the redirect target was never checked against the egress policy".
3. Check **every** address returned by `dns.lookup(host, { all: true })`, not just the first.
4. DNS rebinding between check and connect stays as a documented residual risk. Update `docs/SECURITY.md` lines ~78-79 to say so honestly (see T7). Do not claim it is closed.

**Verify** add unit tests in `server/__tests__/unit/` for `checkEgressAllowed`: `[::ffff:169.254.169.254]`, `[::ffff:a9fe:a9fe]`, `fc00::1`, a host that resolves to both a public and a private IP (mock `dns.lookup`) → all blocked. Server test: WASM callout to a local mock origin that 302s to `http://127.0.0.1:1/` must not follow.

---

## T3 — WebSocket Origin check is a substring match

**Where** `server/websocket/WebSocketManager.ts` ~line 68: `origin.includes(expectedHost)`.

**Fix** `new URL(origin).hostname === expectedHost` (wrap in try/catch → reject on parse error). Keep the exact-match loopback and `vscode-webview:` allowances.

**Verify** server test: WS upgrade with `Origin: https://localhost.evil.com` and a valid token → rejected; `Origin: http://localhost:<port>` → accepted.

---

## T4 — Token compare is not constant-time; token accepted in HTTP query string

**Where** `server/server.ts` ~101-102 (HTTP middleware), `server/websocket/WebSocketManager.ts` ~57.

**Fix**
1. Add one helper (in `server.ts` or a tiny `server/utils/token.ts`): `timingSafeEqual` on `Buffer.from(a)` / `Buffer.from(b)` after a length check. Use it in both places.
2. HTTP middleware: read the token **only** from the `x-fastedge-token` header. Remove `req.query["token"]`. Keep `?token=` for the WebSocket upgrade only (browsers cannot set WS headers).
3. Update the existing test at `server/__tests__/server/middleware.test.ts` ~46-51 (it currently asserts the query form is accepted on HTTP → flip it to assert 401).

**Verify** middleware tests: header → 200, query on `/api/*` → 401, query on `/ws` upgrade → accepted.

---

## T5 — Cargo workspace crates fail `/api/load` containment with an unhelpful error

**Where** `bin/fastedge-debug.js` ~26-32 (anchors `WORKSPACE_PATH` at nearest `Cargo.toml`/`package.json`); `server/utils/pathValidator.ts` ~110 and ~121 (400 error text).

**Problem** a Cargo workspace member builds to `<workspace-root>/target/…`, which is outside the member crate dir → 400.

**Fix** append to both 400 messages: `If your build output lives above this directory (e.g. a Cargo workspace), start the debugger with --project-dir <workspace root>.` Confirm `--project-dir` exists in `bin/fastedge-debug.js`; if it doesn't, add it (sets `WORKSPACE_PATH`).

**Verify** unit test on the error string; manual run from a two-crate Cargo workspace.

---

## T6 — Documentation: authentication contract is missing everywhere

**Where** `docs/API.md`, `docs/WEBSOCKET.md`, `docs/DEBUGGER.md` (~21 and ~170 still say "open http://localhost:5179").

**Fix** add one "Authentication" section (write it once in API.md, link from the others) covering:
- Server prints `Open: http://localhost:<port>/#token=<hex>` to stderr in CLI mode. The fragment is the session token.
- HTTP: `x-fastedge-token: <token>` header on every `/api/*` request. `/health` is unauthenticated.
- WebSocket: `ws://127.0.0.1:<port>/ws?token=<token>`.
- Env: `FASTEDGE_DEBUG_TOKEN` (inject a known token; when set the URL is not printed), `FASTEDGE_BIND_HOST` (default `127.0.0.1`), `FASTEDGE_EXPECTED_HOST` (extra allowed Host/Origin hostname), `WORKSPACE_PATH` (defaults to `process.cwd()`).
- Decision needed from the repo owner, record the answer in SECURITY.md: should the token also be written next to `.fastedge-debug/.debug-port` (e.g. `.debug-token`, mode 0600) so local agent tooling (fastedge-plugin `test` skill, MCP server) can find it? Same trust boundary as `.env`. If yes, implement in `writePortFile` and document; if no, document that tooling must read the stderr line.

**Verify** grep the three docs for `x-fastedge-token`; each must hit.

---

## T7 — `docs/SECURITY.md` overstates the egress protection

**Where** `docs/SECURITY.md` ~73-79.

**Fix** after T2: state that IPv4-mapped IPv6 and `fc00::/7` are blocked, redirects are not followed, all resolved addresses are checked, and that DNS rebinding between check and connect is **not** mitigated. Add `WORKSPACE_PATH` default to the env table. Remove the `?token=` HTTP mention if any (T4).

---

## T8 — Nits (do after T1-T7, each is a few lines)

- `frontend`: when `getToken()` returns `""` show a one-line banner "Missing session token, reopen the URL printed by the server" instead of silently looping 401s / 15 WS retries (`frontend/src/hooks/useWebSocket.ts`).
- `server/server.ts` ~777: port probe uses `localhost`; use `HOST` so probe and bind agree when `FASTEDGE_BIND_HOST=::1`.
- `frontend/vite.config.ts` / dev docs: note that in Vite dev mode the token must be in the 5173 URL fragment, or set `FASTEDGE_DEBUG_TOKEN` for both processes.
- `server/utils/pathValidator.ts` ~110,121,180,190 and `server/utils/dotenv-loader.ts` ~158,166: drop the `${workspaceRoot}` from error strings returned to clients (callers are authenticated, but there is no need to echo absolute paths).

---

## T9 — `FASTEDGE_EXPECTED_HOST` must be a suffix match (Codespaces)

**Where** `server/server.ts` ~46-50 (allowed Host list) and `server/websocket/WebSocketManager.ts` ~60-69 (Origin check, after T3).

**Problem** in GitHub Codespaces the browser/iframe reaches the server through `https://<name>-<port>.app.github.dev`. The VSCode extension will set `FASTEDGE_EXPECTED_HOST=app.github.dev` (it cannot know the full hostname because this server picks the port). Exact match therefore never succeeds.

**Fix** one helper `hostAllowed(hostname)`: exact match against the loopback names, and for `FASTEDGE_EXPECTED_HOST` value `h`: `hostname === h || hostname.endsWith("." + h)`. Use it for both the HTTP Host check and the WS Origin check. Comment why a suffix is needed. Strip any `:port` before comparing.

**Verify** middleware test: with `FASTEDGE_EXPECTED_HOST=app.github.dev`, Host `abc-5179.app.github.dev` → 200, Host `app.github.dev.evil.com` → 403, Host `evilapp.github.dev` → 403.

---

## Not fixing (already decided, leave as documented)

- Unbounded synchronous WASM execution (DoS). Documented as accepted in `docs/SECURITY.md` ~91-111; `/api/load` and `/api/execute` are token-gated. Do not reopen.

## Release ordering (owner action, not a code task)

An old published VSCode extension cannot talk to this server once merged (401 on everything). Publish the hardened extension **before** cutting the fastedge-test release that the extension CI downloads.
