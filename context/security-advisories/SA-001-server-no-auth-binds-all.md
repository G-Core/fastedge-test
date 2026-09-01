# SA-001 — Server binds all interfaces with no auth / CORS / Host validation

**Severity:** High
**Category:** Missing authentication for critical functions (CWE-306) + binding
to an unrestricted address (CWE-1327) + missing origin/host validation (CWE-346)
**Status:** Open
**Affected file:** `server/server.ts` (whole file; `startServer` at `:740-750`,
middleware at `:47-48`)

## Summary

The debugger server is a plain Express app with **no authentication middleware,
no CORS configuration, and no `Host`-header validation**, and it **binds to all
network interfaces**:

```ts
httpServer.listen(resolvedPort, () => { ... });   // :743 — no host arg → 0.0.0.0 / ::
```

The `127.0.0.1` seen in `PortManager.ts:34` is only a **free-port probe**
(`createServer().listen(port, "127.0.0.1")` then closed); the real server bind
above pins no host. The only per-request "identity" is the non-secret
`x-source` header, used solely to label WebSocket events — **not auth**.

Every state-changing endpoint is therefore reachable by untrusted callers:
`/api/load` (run WASM), `/api/config/save-as` (write files), `/api/config`,
`/api/dotenv`, `/api/execute`, `/api/send`, `/api/call`,
`/api/reload-workspace-wasm`.

## Who can reach it

- **Any host on the LAN / any routable network** the machine is on (0.0.0.0
  bind).
- **Any other local process or user** on the machine.
- **Any web page the developer visits, via DNS-rebinding** — the page rebinds
  its own hostname to `127.0.0.1:<port>` and then issues same-origin requests;
  with no `Host` check this succeeds. (Note: a *direct* cross-site
  `fetch` with `Content-Type: application/json` is CORS-preflighted and blocked,
  so ordinary CSRF is limited — DNS-rebinding is the browser vector that works.)
- **Any web page, directly, over WebSocket — no rebinding needed.**
  `WebSocketManager.ts:41-52` sets `verifyClient` to `return true; // Accept all
  connections`, ignoring `info.origin`. WebSocket handshakes are **not** subject
  to fetch/CORS, so a hostile page can open `ws://localhost:<port>/ws` to a
  guessed port and passively receive every broadcast — **request/response bodies,
  headers, resolved properties, and logs**, which can include secrets loaded from
  `.env`. This is a direct cross-origin **data-disclosure** channel independent
  of the HTTP CSRF/rebinding discussion.

The port isn't secret either: it's written to
`<workspace>/.fastedge-debug/.debug-port` (`server.ts:writePortFile`) and the
range is a small, guessable 5179–5228.

## Impact

This finding is the **force multiplier** for SA-002/003/004: it converts
"malicious local input" into "remotely triggerable". A remote/rebinding attacker
can run arbitrary WASM (SA-003), read `.env` secrets from any directory (SA-003),
write files (SA-002), and drive SSRF (SA-004) — all on the developer's machine,
unauthenticated. High.

## Remediation (this is the root fix — do it first)

1. **Bind to loopback only.** Pass an explicit host to `listen`:
   ```ts
   const HOST = process.env.FASTEDGE_BIND_HOST ?? "127.0.0.1";
   httpServer.listen(resolvedPort, HOST, () => { ... });
   ```
   Default `127.0.0.1`. Only allow a non-loopback bind behind an explicit,
   documented opt-in. Update the free-port probe to check the same host.
2. **Validate the `Host` header** on every `/api/*` request (anti-DNS-rebinding).
   > **Two corrections vs. a naive version:** (a) `String.split(":")` mangles
   > IPv6 (`[::1]:5179` → `[`), so parse with the URL/`net` helpers or match the
   > bracketed form explicitly; (b) the server is **not** handed the Codespaces
   > `asExternalUri` forwarded hostname, so it cannot hardcode it — the
   > **extension must pass the expected external host** to the child via env
   > (alongside the token below), and the check allows loopback **or** that
   > env-provided host. Treat Host validation as a secondary control; the token
   > (item 3) is the primary one.
   ```ts
   const EXPECTED_HOSTS = new Set(
     ["localhost", "127.0.0.1", "::1", process.env.FASTEDGE_EXPECTED_HOST].filter(Boolean),
   );
   app.use("/api", (req, res, next) => {
     const raw = req.headers.host ?? "";
     const host = raw.startsWith("[") ? raw.slice(1, raw.indexOf("]")) : raw.split(":")[0];
     if (!EXPECTED_HOSTS.has(host)) return res.status(403).json({ ok:false, error:"Invalid Host" });
     next();
   });
   ```
3. **Per-session capability token — delivered OUT OF BAND.**
   > **Correction:** do **not** inject the token into the same-origin
   > `index.html`/a config the server serves. That origin is unauthenticated, so
   > a LAN caller can just `GET` the token, and a rebinding page can read it after
   > rebinding — defeating the control. The token must reach the frontend by a
   > channel the attacker can't read.
   - Generate a random token at startup (`crypto.randomBytes`); require it on
     every `/api/*` request **and** on the `/ws` handshake.
   - **VSCode extension:** the extension generates the token, passes it to the
     forked server via env (`FASTEDGE_DEBUG_TOKEN`, next to the `WORKSPACE_PATH`
     it already sets), and injects it into the **iframe URL fragment**
     (`…/#token=…`) so the webview frontend reads it from `location.hash` (a
     fragment is not sent to the server and not logged) and sends it on `fetch`
     and as the WS `?token=`/subprotocol.
   - **CLI (`bin/fastedge-debug.js`):** open the browser at a URL carrying the
     token in the fragment, same as above.
   - Validate the token in the `/api/*` middleware and in
     `WebSocketManager.verifyClient` (WebSocket can't set an `Authorization`
     header → read it from the `?token=` query or subprotocol). Do not use
     `x-source` for anything security-relevant.
4. **Fix the WebSocket `verifyClient`** (currently `return true`): require the
   token **and** validate `info.origin` against the expected origin(s). Reject
   otherwise. This closes the passive-disclosure channel noted above.
5. **Do not send permissive CORS headers.** Keep JSON endpoints requiring
   `application/json` so browser cross-site POSTs stay preflighted.

## Test

- `startServer` binds `127.0.0.1` by default (assert via a connection test to a
  non-loopback address failing).
- A request with a foreign `Host` header → 403; a `Host` of `[::1]:5179` is
  parsed correctly and accepted; missing/invalid token → 401; loopback + valid
  token → 200.
- WebSocket connection without token **or** with a foreign `Origin` is rejected
  (`verifyClient` no longer returns unconditional `true`).

## Related

- FastEdge-vscode **SA-003** (client side of this) and **SA-006** (`.debug-port`).
- SA-002/003/004 here (endpoints this exposes).
