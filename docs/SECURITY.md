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

A second threat is the app itself: a repository you cloned can ship a hostile
`.wasm`, config files or fixtures. See [Running apps you didn't write](#running-apps-you-didnt-write).

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

### Path containment for config paths

Every file path the server reads from a request or a config file is confined
to the workspace root (`WORKSPACE_PATH`: the CLI's resolved root, or the folder
open in VS Code) using both
lexical and `realpathSync`-based checks: the WASM path, dotenv files, resource
files, the built-in origin's `files` folder and `bodyFile`, and the default config
file (`.fastedge-debug/fastedge-config.test.json`, read and saved). Symlinks inside
the workspace that point outside are rejected, including dangling ones (writing
one would create its target). Absolute paths are allowed if
they resolve within the workspace root. The built-in origin also refuses
dotfiles and `..` segments in request paths.

Store fixtures (`fixtures/stores/`) are read only when they resolve inside the
stores root, both when the stores load and in the Storage Explorer's diff. The
Storage Explorer writes only the fixture files listed in its diff, after you
approve them, and refuses to write through a symlink.

### Allowed folders

Folders outside the workspace you let the debugger **read**, for example a folder of
prebuilt wasm files or a website used as an origin. Only you configure them:
`fastedge-debug --allow <dir>`, or the FastEdge for VS Code user setting, which
the extension passes as `FASTEDGE_ALLOWED_FOLDERS`. Workspace settings, config
files, dotenv files and fixtures never add a folder. A folder passed by an npm
script's `--allow` is yours only if you wrote the script.

- **Approved per session, by you, outside the API.** The first time a load reads
  from an allowed folder, you are asked: in VS Code by a dialog the extension
  shows (it answers the server over its private IPC channel), on the command
  line by a prompt in the terminal. With neither, the read is refused. No HTTP
  or WebSocket call can approve a folder, so the page and agents can only cause
  the question to be asked. While the question waits, the page says where to
  answer it. An answer lasts until the server stops; a refusal is not asked
  again; no answer within 2 minutes fails the read, and the next read asks
  again.
- **Read-only.** Resource files, configs and store fixtures are only written
  inside the workspace.
- **The same checks as the workspace.** A path must be in the allowed folder
  both as written and through symlinks, so a link from the workspace into an
  allowed folder, or from an allowed folder out of it, is refused.
- **Visible.** The page lists the allowed folders and whether each is approved
  this session. Its **Ask to read it** button asks for approval up front (it
  only asks, like a load does); an approved folder's files are then offered in
  the path fields, as absolute paths.

The risk that remains: an approved folder is readable by every config loaded in
that session, and a loaded app can send what it reads over the network. A
malicious repository can use a folder you approved for something else in the
same session. Keep secrets out of allowed folders.

### Save-as write capability

`/api/config/save-as` only writes to a path that was vended in the same
session by `/api/config/show-save-dialog` (the user's Electron save dialog).
The capability is single-use and cannot be replayed.

### Egress policy on WASM HTTP callouts

WASM modules can make outbound HTTP calls via `proxy_http_call` and the
upstream-forward path. Both are checked against a default egress policy before
the request is sent:

- Non-`http/https` schemes are rejected.
- `169.254.0.0/16` (cloud instance metadata — AWS, GCP, Azure), IPv6
  link-local (`fe80::/10`), ULA (`fc00::/7`), and IPv4-mapped IPv6
  (`::ffff:169.254.x.x` and equivalent hex forms) are blocked.
- Loopback and RFC-1918 ranges are intentionally **allowed** — proxy-wasm
  tests routinely target local and LAN mock origins.
- HTTP redirects are **not followed** — the upstream response is returned to
  the WASM as-is, so a redirect target that was not present at policy-check
  time cannot be reached.
- All IP addresses a hostname resolves to are checked; a single blocked
  address is enough to block the request.

The policy covers CDN (proxy-wasm) apps, whose requests the debugger makes.
An HTTP app's outbound requests are made by `fastedge-run` itself and are
**not** checked.

Hostnames are resolved via DNS before the check, and all returned addresses
are checked. **DNS rebinding between the policy check and the actual
connect is not mitigated** — an attacker who controls DNS TTL could
(in theory) swap the address between check and connect.

### Schema route allowlist

`/api/schema/:name` validates the route parameter against a startup-time
allowlist of known schema files. Path traversal via encoded slashes in the
parameter is not possible.

---

## Accepted limitations

### Path checks are not atomic with the read or write

The server checks a path (containment, symlinks) and then opens it. A process
that can change the workspace between the two could swap a checked folder or
file for a symlink. Loaded apps have no file access, so only a program already
running as you could do this, and such a program can read and write your files
directly. The stores root (`FASTEDGE_STORES_ROOT`, else the nearest git root
from the app root) is trusted as configured.

The stores database holds cache and Edge KV values unencrypted. On Linux and
macOS its folder (`.fastedge-debug/stores/`) is made readable by you only. On
Windows it keeps the permissions it inherits from its parent folder.

### No time limit on a CDN hook

Each CDN app runs in its own worker thread, so the server stays responsive
while a hook runs. There is no time limit on a hook, though: an app with an
infinite loop hangs that request. Loading another app (or restarting the
server) terminates the worker. HTTP apps are limited by `fastedge-run`, which
stops an app after 10 minutes by default.

On the edge, every app has an execution-time budget set by its plan.

### Network access for apps

Loopback and LAN addresses are reachable from apps on purpose (see the egress
policy above), so an app can send requests to services on your machine or
network.

---

## Running apps you didn't write

Running an app in the debugger is safer than running its repository's code,
but it is not isolated from your network.

**Code that runs natively, with your user's rights** (the same for any
repository you clone):

- Building: `cargo build` runs `build.rs`, procedural macros and settings from
  `.cargo/config.toml`; `npm install` runs package scripts.
- Tests: a test suite such as `fastedge-test/app.test.mjs` is plain Node.js.
- The FastEdge VSCode extension builds the app when you start debugging, but
  only in a folder VSCode trusts: it is disabled in Restricted Mode.

**What a loaded app can reach:**

| | CDN (proxy-wasm) app | HTTP app |
|---|---|---|
| Runs in | Node's WebAssembly sandbox, in a worker thread | `fastedge-run` (wasmtime), a separate process |
| Your files | None: WASI is given no directories; the debugger reads the workspace, and [allowed folders](#allowed-folders) you approve | None; the same for the debugger |
| Environment | Its own dotenv values only | Its own dotenv values only |
| Network | Internet, loopback and LAN; cloud-metadata and link-local ranges blocked | Not filtered |
| Data it sees | The request, its stores, the origin's response | The request, its stores |

So a hostile app cannot read your files or start programs. It can send what it
sees to the internet, and it can call unauthenticated services on your machine
or LAN (for example a Docker daemon exposed over TCP, or a development
database).

**Advice:** build, test and debug only repositories you trust. To examine one
you don't, use a container or a VM.

---

## Environment variables

| Variable | Purpose |
|---|---|
| `FASTEDGE_BIND_HOST` | Override the bind address (default `127.0.0.1`) |
| `FASTEDGE_DEBUG_TOKEN` | Inject a pre-generated session token (VSCode extension sets this) |
| `FASTEDGE_EXPECTED_HOST` | Add an extra allowed `Host` / WebSocket origin (Codespaces forwarded hostname) |
| `WORKSPACE_PATH` | Workspace root for path containment (set by CLI and VSCode extension) |
| `FASTEDGE_APP_ROOT` | App root inside the workspace (set by the VSCode extension); does not widen containment |
| `FASTEDGE_ALLOWED_FOLDERS` | JSON array of allowed folders (set by `--allow` and the VSCode extension); each read from one needs your approval |
