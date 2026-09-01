# Security

`fastedge-test` runs a local HTTP + WebSocket server (`fastedge-debug`) on the
developer's machine to load and execute WASM modules. This document describes
the security posture of that server and the mitigations in place.

---

## Threat model

The server is a **developer tool**, not a production service. It runs with the
developer's full local privileges and no OS-level sandbox. The relevant threat
is an attacker who can reach the server over the network — via the LAN, a
browser page the developer visits (DNS-rebinding), or another local process —
and issue requests that execute WASM, read secrets, or write files.

---

## Mitigations in place

### Loopback-only bind

The server binds to `127.0.0.1` by default (`FASTEDGE_BIND_HOST` overrides
this). LAN peers and remote hosts cannot reach it.

### Host-header validation

Every `/api/*` request is checked against an allowlist of expected hosts
(`localhost`, `127.0.0.1`, `::1`, and optionally `FASTEDGE_EXPECTED_HOST` for
Codespaces forwarding). A foreign `Host` header — the mechanism a DNS-rebinding
attack relies on — is rejected with 403.

### Per-session capability token

At startup the server generates a random 32-byte token. Every `/api/*` request
and every WebSocket connection must carry it. The token is delivered out of
band:

- **VSCode extension** — the extension passes the token as `FASTEDGE_DEBUG_TOKEN`
  env to the forked server process and injects it into the webview iframe URL
  fragment (`#token=…`). The fragment is not sent to the server and cannot be
  read by a LAN or rebinding attacker.
- **CLI** — the token is logged to stderr at startup as part of the `Open:` URL.
  Only the local user reading the terminal can see it.

### WebSocket origin validation

`verifyClient` rejects connections whose `Origin` header does not match
loopback origins, `vscode-webview://`, or `FASTEDGE_EXPECTED_HOST`. The token
check runs first; origin is a secondary guard.

### Path containment for WASM and dotenv

All file paths accepted by `/api/load` and `/api/dotenv` are confined to
`WORKSPACE_PATH` (set by the CLI and the VSCode extension) using both lexical
and `realpathSync`-based checks. Symlinks inside the workspace that point
outside are rejected. Absolute paths are allowed if they resolve within the
workspace root.

### Save-as write capability

`/api/config/save-as` only writes to a path that was vended in the same
session by `/api/config/show-save-dialog` (the user's Electron save dialog).
The capability is single-use and cannot be replayed.

### Egress policy on WASM HTTP callouts

WASM modules can make outbound HTTP calls via `proxy_http_call` and the
upstream-forward path. Both are checked against a default egress policy before
the request is sent:

- Non-`http/https` schemes are rejected.
- `169.254.0.0/16` (cloud instance metadata — AWS, GCP, Azure) and IPv6
  link-local / metadata ranges are blocked.
- Loopback and RFC-1918 ranges are intentionally **allowed** — proxy-wasm
  tests routinely target local and LAN mock origins.

Hostnames are resolved via DNS before the check so the policy cannot be
bypassed by a hostname that resolves to a blocked IP at connect time.

### Schema route allowlist

`/api/schema/:name` validates the route parameter against a startup-time
allowlist of known schema files. Path traversal via encoded slashes in the
parameter is not possible.

---

## Accepted limitations

### Synchronous WASM execution can block the event loop

Loaded WASM runs synchronously on Node's main event loop. A WASM module
containing an infinite loop will hang the debugger server until the process
is restarted.

**Why this is not mitigated further:** Node.js provides no mechanism to
interrupt a synchronous loop from the same thread. The correct fix is moving
WASM execution to a `worker_threads` Worker with a hard deadline, but the
added complexity is not warranted for a developer tool given that:

1. The remote attack vector is closed (loopback bind + session token means
   only the authenticated local developer can load WASM).
2. The only realistic path to a hang is the developer loading their own
   buggy or malicious WASM.
3. Recovery is a process restart (`fastedge-debug` re-launches in seconds).

If your threat model requires protection against this (e.g. running the
debugger in a shared environment where untrusted WASM can be submitted),
move WASM execution to a dedicated `worker_threads` Worker and call
`worker.terminate()` on deadline.

---

## Environment variables

| Variable | Purpose |
|---|---|
| `FASTEDGE_BIND_HOST` | Override the bind address (default `127.0.0.1`) |
| `FASTEDGE_DEBUG_TOKEN` | Inject a pre-generated session token (VSCode extension sets this) |
| `FASTEDGE_EXPECTED_HOST` | Add an extra allowed `Host` / WebSocket origin (Codespaces forwarded hostname) |
| `WORKSPACE_PATH` | Workspace root for path containment (set by CLI and VSCode extension) |
