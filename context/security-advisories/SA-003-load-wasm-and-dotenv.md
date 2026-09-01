# SA-003 — `/api/load` runs attacker WASM + reads `.env` from any directory

**Severity:** High
**Category:** Execution of attacker-supplied code (CWE-494) + unrestricted file
read via unconfined path (CWE-22 / CWE-73)
**Status:** Open
**Affected files:** `server/server.ts:142-274` (`/api/load`),
`server/utils/dotenv-loader.ts:122-129` (`resolveDotenvPath`),
`server/utils/pathValidator.ts` (called without `workspaceRoot`)

## Summary

`/api/load` takes untrusted input and (a) **executes attacker-supplied WASM** and
(b) **reads `.env*` files from an attacker-chosen directory** and injects them as
secrets into that WASM. Two sub-issues:

### 1. Arbitrary WASM execution (`wasmBase64`)

```ts
else if (wasmBase64) {
  bufferOrPath = Buffer.from(wasmBase64, "base64");   // attacker-supplied bytes
  ...
}
...
currentRunner = runnerFactory.createRunner(wasmType, dotenv?.enabled ?? false);
await currentRunner.load(bufferOrPath, { ... });       // instantiated + run
```

The caller supplies raw WASM bytes; the server instantiates and runs them. WASM
is WASI-sandboxed, but it has **host functions** (`server/fastedge-host/`,
`server/runner/HostFunctions.ts`) including **outbound HTTP callouts** (SA-004),
so "sandboxed" does not mean "harmless" — it is a controllable execution + egress
primitive on the developer's machine.

### 2. `.env` read from any directory (`dotenv.path`)

`resolveDotenvPath` passes **absolute paths through unchanged** and applies **no
containment**:

```ts
export function resolveDotenvPath(dotenvPath, base) {
  if (!dotenvPath) return undefined;
  if (path.isAbsolute(dotenvPath)) return dotenvPath;   // absolute → used as-is
  return path.resolve(base, dotenvPath);                // relative → no '..' guard
}
```

`loadDotenvFiles(dotenvPath)` then reads `<dir>/.env`, `<dir>/.env.secrets`,
`<dir>/.env.variables` from that directory and loads their values as **secrets /
dictionary** into the running WASM. So `POST /api/load` with
`dotenv: { enabled: true, path: "/home/victim/some-other-project" }` reads that
project's secrets and hands them to attacker-controlled WASM, which can exfiltrate
them (SA-004 callout). Arbitrary `.env*` read across the whole filesystem.

### 3. `wasmPath` is not workspace-confined

`/api/load` calls `validatePath(resolvedPath, { requireWasmExtension: true,
checkExists: true })` — **without `workspaceRoot`**, so the workspace-containment
branch never runs. Confinement relies only on the weak `DANGEROUS_PATHS`
blocklist (see SA-005). Any readable `.wasm` outside that blocklist can be loaded.

## Impact

Remote/rebinding/local attacker (via SA-001) executes arbitrary WASM on the dev
machine and reads `.env` secrets from any directory, then exfiltrates via WASM
HTTP callout. High.

## Remediation

> **Do not reject absolute paths — contain them.** Absolute paths are *normal*
> here: `GET /api/config` (`:509-511`) resolves a relative `dotenv.path` to an
> **absolute** path before the frontend sends it on to `/api/load`, and
> filesystem-backed WASM selection also sends an absolute path. The containment
> base is reliably available: the **VSCode fork** sets `WORKSPACE_PATH`, and the
> **CLI sets it too** (`bin/fastedge-debug.js:74`,
> `WORKSPACE_PATH = resolveAppRoot(startPath)`), with `process.cwd()` as a final
> fallback. So confine to `WORKSPACE_PATH ?? process.cwd()` rather than rejecting
> absolute inputs.

1. **Confine `dotenv.path` under the workspace base (allow contained absolutes).**
   Update `resolveDotenvPath` / `resolveDotenvPathFromWorkspace` (`server.ts:495`)
   and the `/api/dotenv` handler (`:276`) to resolve the path and verify it is
   contained under `base = WORKSPACE_PATH ?? process.cwd()` using **realpath
   semantics** (resolve base and the nearest existing ancestor with
   `fs.realpath`, reject symlink escapes), returning `INVALID` → route 400
   otherwise. A contained absolute path is fine; an escaping one (absolute or
   `../`) is rejected.
2. **Confine `wasmPath` the same way.** Pass
   `workspaceRoot: process.env.WORKSPACE_PATH ?? process.cwd()` to `validatePath`
   so its existing (currently-unused) containment branch runs. Keep
   `allowAbsolute: true` (contained absolutes are legitimate); rely on the
   containment check, not the `DANGEROUS_PATHS` blocklist (SA-005).
3. **Gate `wasmBase64` behind auth (SA-001 token) and cap size.** Running
   user-provided WASM is the tool's purpose — the fix is that only an
   authenticated local caller can, and bytes are bounded. `express.json({limit:
   "20mb"})` bounds the request; validate/limit explicitly too.
   (Execution *time* is a separate, serious issue — see **SA-006**.)
4. `/api/dotenv` (`:276`) has the same unconfined resolution **and no Zod
   schema** — add a schema and the same containment.

## Test

- `dotenv.path` that escapes the base (e.g. `/etc` or `../../`) → 400; a path
  **contained** under `WORKSPACE_PATH` (absolute or relative) → accepted and read.
- `wasmPath` outside the base → 400 once `workspaceRoot` is passed; a contained
  absolute `.wasm` → loads.
- `wasmBase64` without the SA-001 token → 401.
- A symlink inside the workspace pointing outside is not followed.

## Related

- SA-001 (remote reachability), SA-004 (the callout that exfiltrates what this
  loads), SA-005 (the blocklist this currently leans on).
