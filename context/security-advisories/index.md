# fastedge-test (@gcoredev/fastedge-test) — Security Advisories

Tracking index for security findings in `fastedge-test` — the FastEdge debugger
/ test-runner. This package ships the **local HTTP+WebSocket server** (`server/`,
bundled to `dist/server.js`) that the VSCode extension and the CLI drive. The
VSCode extension audit (`FastEdge-vscode/context/security-advisories/SA-003`)
pointed here: **these advisories are the server-side root cause** of that
finding, reviewed against the real source (not the minified bundle).

**Audit date:** 2026-09-01
**Scope reviewed:** `server/server.ts` (all routes), `server/utils/`
(`pathValidator.ts`, `dotenv-loader.ts`), `server/runner/` (WASM execution +
outbound `fetch`), `server/fastedge-host/`, `server/websocket/`.

## Threat model (read this first)

`fastedge-test` runs on the **developer's machine** — as a CLI (`fastedge-debug`)
or `fork()`ed by the VSCode extension — with the developer's full privileges and
**no sandbox**. It stands up an Express server (`server/server.ts`) that:

- **binds all network interfaces** (`httpServer.listen(port)` with no host — the
  `127.0.0.1` in `PortManager` is only a free-port *probe*), and
- has **no authentication, no CORS policy, and no `Host`-header validation**.

The exposed `/api/*` endpoints load and **execute WASM**, **read `.env` secrets**,
**write files**, and make **outbound HTTP requests**. So the untrusted callers in
scope are: any process/user on the host, any host on the LAN, and — via
**DNS-rebinding** — any web page the developer visits. (A cross-site
`Content-Type: application/json` POST is preflighted and blocked by the browser,
so *ordinary* CSRF is limited; DNS-rebinding, LAN, and local clients are the
real vectors.)

## Severity scale

CVSS-style qualitative bands (**Critical / High / Medium / Low**), estimated for
this local, unsandboxed, network-reachable context.

## Open findings

| ID | Title | Severity | File | Status |
|----|-------|----------|------|--------|
| SA-001 | Server binds all interfaces; no auth / CORS / Host / WebSocket-origin validation | **High** | [SA-001-server-no-auth-binds-all.md](SA-001-server-no-auth-binds-all.md) | Open |
| SA-002 | `/api/config/save-as` arbitrary file write (absolute path, no schema) | **High** | [SA-002-save-as-arbitrary-write.md](SA-002-save-as-arbitrary-write.md) | Open |
| SA-003 | `/api/load` runs attacker WASM + reads `.env` from any directory | **High** | [SA-003-load-wasm-and-dotenv.md](SA-003-load-wasm-and-dotenv.md) | Open |
| SA-004 | WASM HTTP callouts have no egress allowlist (SSRF) | **Medium** | [SA-004-wasm-callout-ssrf.md](SA-004-wasm-callout-ssrf.md) | Open |
| SA-006 | Unbounded synchronous WASM execution hangs the server (DoS) | **Medium** | [SA-006-unbounded-wasm-execution-dos.md](SA-006-unbounded-wasm-execution-dos.md) | Open |
| SA-005 | Path validation is a weak blocklist; some routes skip it | **Low** | [SA-005-path-validation-weaknesses.md](SA-005-path-validation-weaknesses.md) | Open |

**Suggested fix order:** SA-001 first — it is the **root mitigation**. Binding to
loopback + `Host`-header validation + a per-session capability token (+ fixing the
`/ws` `verifyClient`) removes *remote* reachability for SA-002/003/004/006 in one
stroke, turning them from network-exploitable into local-only. Then fix the
per-endpoint handling (SA-002 write capability, SA-003 WASM/dotenv containment,
SA-006 execution isolation, SA-004 egress policy, SA-005 defense-in-depth) so a
*local* or authenticated-but-malicious caller is still contained.

> **Reviewed 2026-09-01** by a second independent model (cross-examination), with
> every load-bearing claim re-verified against the real `server/` source.
> Corrections applied: **SA-001** — the capability token must be delivered
> **out-of-band** (injecting it into the same-origin `index.html` is readable by a
> LAN/rebinding attacker and defeats it); the `Host` allowlist can't hardcode the
> Codespaces `asExternalUri` host (extension must pass it via env) and must parse
> IPv6 correctly; **added the WebSocket gap** — `verifyClient` returns
> unconditional `true`, so a hostile page reads all broadcasts over `/ws` with no
> rebinding. **SA-002** — confining `save-as` to `.fastedge-debug` would break the
> real Electron "Save As" flow (user picks an absolute path); fix is auth + a
> one-time server-vended path capability, and `ApiConfigBodySchema` has no
> `filePath` field. **SA-003** — must **contain** absolute paths under
> `WORKSPACE_PATH ?? cwd` (the CLI *does* set `WORKSPACE_PATH`), not reject them,
> since `/api/config` and FS WASM selection legitimately send absolute paths;
> containment must be realpath-based. **SA-004** — `HttpWasmRunner:182` is not a
> sink (fixed localhost); default egress policy must block only metadata/link-
> local and **preserve** loopback/LAN testing. **SA-005** — the schema route is a
> plausibly-live traversal, not just a future risk. **SA-006 added** — WASM runs
> synchronously with no deadline/worker isolation; an infinite loop hangs the
> whole server (remote-triggerable via SA-001).

## Cross-repo linkage

- **FastEdge-vscode SA-003** (the extension's copy of the "unauthenticated local
  server" finding) is fixed *here*. Its client-side token-plumbing depends on
  SA-001's server-side token design. Coordinate the two.
- **FastEdge-vscode SA-006** (`.debug-port` trust) pairs with this repo's port
  file writer (`server.ts:writePortFile`).

## Already reasonable (don't churn these)

- Zod schema validation is applied on `/api/load`, `/api/call`, `/api/send`,
  `/api/config` (`ApiLoadBodySchema` etc.). **Exception:** `/api/config/save-as`
  and `/api/execute` and `/api/dotenv` read `req.body` **without** a schema — see
  SA-002/SA-003.
- `proxy-wasm` property access has an allow/deny control layer
  (`PropertyAccessControl.ts`). That governs WASM *properties*, not network
  egress or file paths — it does not mitigate SA-002/003/004.
- The port-free probe correctly uses `127.0.0.1`; the bug is that the **real**
  server listen (SA-001) does not pin a host.

## How to work these

1. Start with SA-001 (root). Open its file, apply the loopback/Host/token fix.
2. Then the per-endpoint items. Keep diffs minimal.
3. Run `pnpm run check-types` and the vitest suites
   (`vitest.integration.*.config.ts`) after changes.
4. Flip the row's **Status** to `Fixed` here and add the commit hash.
