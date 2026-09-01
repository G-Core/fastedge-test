# SA-004 — WASM HTTP callouts have no egress allowlist (SSRF)

**Severity:** Medium
**Category:** Server-Side Request Forgery (CWE-918)
**Status:** Open
**Affected files:** `server/runner/ProxyWasmRunner.ts:533` (upstream forward),
`:973` (`proxy_http_call`)

> **Scope correction:** `HttpWasmRunner.ts:182` is **not** an SSRF sink — it
> always builds `http://localhost:${this.port}${request.path}` and forwards to
> the local runner process; the caller can't choose the host there. The
> attacker-controlled egress is the two `ProxyWasmRunner` `fetch` sites. (The
> spawned FastEdge runtime may separately make downstream requests; if so, harden
> that in the runtime — but this line is not the sink.)

## Summary

When proxy-wasm runs, its HTTP callouts are made by the host with `fetch()` to a
URL the WASM (or the request) controls, with **no destination allowlist and no
blocking of internal ranges**:

```ts
// ProxyWasmRunner.ts:973 — proxy_http_call dispatch
const resp = await fetch(url, { ... });          // url from WASM upstream
// ProxyWasmRunner.ts:533 — upstream forward
const response = await fetch(actualTargetUrl, fetchOptions);
```

Making callouts is the *intended* function of a proxy-wasm test runner, so this
is not a bug in isolation. It becomes a security issue because of **SA-001**: the
server is unauthenticated and network-reachable, so an attacker who can reach
`/api/load` + `/api/execute` (or `/api/send`) supplies both the WASM and the
target URL, turning the developer's machine into an **SSRF proxy**.

## Impact

From the victim's host/network position, an attacker can make the machine issue
arbitrary outbound HTTP requests to:

- **Cloud metadata endpoints** (`http://169.254.169.254/…`) → steal cloud
  credentials/instance identity in Codespaces/CI/cloud dev boxes.
- **Internal/RFC-1918 services** (`10.*`, `192.168.*`, `127.0.0.1:<other-port>`)
  not otherwise reachable by the attacker — including *other* local dev servers.
- **Link-local / `.internal` names.**

Responses flow back to the WASM, so this is a *readable* SSRF (data exfiltration,
not just blind). Medium — the main gate is SA-001; egress hardening is the
defense-in-depth layer that limits damage even for a local/authenticated caller
or a genuinely malicious test WASM.

## Remediation

1. **Fix SA-001 first** — that removes remote reachability, which is what makes
   this exploitable at range.
2. **Add an egress policy to the two `ProxyWasmRunner` callout sites.**
   > **Do NOT default-deny loopback / RFC-1918.** Proxy-wasm tests routinely
   > target arbitrary **localhost / LAN mock origins** (not only origins
   > registered through the `mock-origins` mechanism), so blocking private ranges
   > by default would break the tool's core workflow.
   Default policy: reject non-`http(s)` schemes, and **block only cloud-metadata
   / link-local by default** (`169.254.0.0/16` incl. `169.254.169.254`,
   `fe80::/10`, `fd00::/8` metadata variants). Preserve loopback and RFC-1918 for
   testing. Guard against DNS-rebinding of the *callout* target (resolve once,
   connect to the resolved IP, or re-check after connect) so a hostname can't
   resolve to metadata after the check.
3. **Make stricter egress opt-in.** Expose a config policy
   (e.g. `calloutEgress: "local" | "strict" | "custom-allowlist"`) so users who
   want production-parity lockdown can default-deny everything except an
   allowlist — but the default preserves local/LAN testing.
4. Centralize the check in one helper used by both `ProxyWasmRunner` fetch sites.
5. Document that pointing the runner at production/internal endpoints is a
   deliberate choice.

## Test

- With default policy, a WASM callout to `169.254.169.254` or a `10.x` address is
  blocked; a callout to an allowlisted localhost mock origin succeeds.

## Related

- SA-001 (reachability), SA-003 (attacker supplies the WASM that calls out).
