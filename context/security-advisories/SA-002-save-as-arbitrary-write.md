# SA-002 — `/api/config/save-as` arbitrary file write

**Severity:** High
**Category:** Unrestricted write to an attacker-controlled path (CWE-73, CWE-22)
**Status:** Open
**Affected file:** `server/server.ts:598-637`

## Summary

`/api/config/save-as` writes a JSON file to a **client-controlled path with no
confinement and no schema validation**:

```ts
const { config, filePath } = req.body ?? {};   // no Zod schema (unlike /api/config)
...
if (path.isAbsolute(filePath)) {
  targetPath = filePath;                        // absolute path used verbatim
} else {
  targetPath = path.join(projectRoot, filePath); // '..' not rejected
}
if (!targetPath.endsWith(".json")) targetPath += ".json";
const dir = path.dirname(targetPath);
await fs.mkdir(dir, { recursive: true });        // creates arbitrary parent dirs
await fs.writeFile(targetPath, JSON.stringify(config, null, 2), "utf-8");
```

- **Absolute `filePath`** is used as-is → write anywhere the process can write.
- **Relative `filePath`** is `path.join`ed to the project root with **no `..`
  rejection** → traversal out of the project.
- `mkdir(..., { recursive: true })` **creates missing directories** along the way.
- `config` is written **raw** — no `TestConfigSchema`/`ApiConfigBodySchema`
  validation (contrast `/api/config` at `:529`, which validates).

The only constraint is the forced `.json` extension.

## Impact

Combined with SA-001 (unauthenticated, network-reachable), a remote/rebinding/
local attacker can **write arbitrary JSON files anywhere the developer's user can
write**: overwrite project/tool configs, drop files into directories that
auto-load `.json` (CI config, VS Code `tasks.json`/`launch.json`,
`.vscode/mcp.json` → which can specify a command to run, MCP/agent configs,
package manager configs), enabling tampering and, via those secondary loaders,
local code execution. High.

## Remediation

> **Design constraint (do not naively confine to `.fastedge-debug`):** the
> legitimate "Save As" flow *needs* to write to a user-chosen absolute path — the
> frontend calls `/api/config/show-save-dialog` (`:559`), the **user** picks a
> location, and the frontend then sends that **absolute** path to
> `/api/config/save-as`. So simply rejecting absolute paths / confining to the
> config dir would break Save As. The fix is **authenticate the caller and only
> honor a path the *server itself* just handed out.**

1. **Authenticate the route** (SA-001 token) so only the real frontend/extension
   can call it at all. This alone removes the *remote* arbitrary-write.
2. **One-time server-side capability for the dialog path.** Have the server
   remember the path it returned from `show-save-dialog` (a short-lived,
   single-use allowlist entry) and let `save-as` write **only** to a path that
   matches an outstanding capability. A raw absolute path from the network that
   the server didn't just vend is rejected. This keeps Save As working while
   removing "write anywhere the body says".
3. **Validate the body shape.** Add a dedicated schema (do **not** reuse
   `ApiConfigBodySchema` — it has **no `filePath` field**): validate that
   `config` conforms to `TestConfigSchema` and `filePath` is a string, before any
   write.
4. **If a containment check is used anywhere** (e.g. for a relative-path variant
   confined to the config dir), make it **realpath-based, not lexical**: a
   `relative()`/`startsWith("..")` check passes through a symlinked directory
   inside the base that points outside it. Resolve the base and the nearest
   existing target parent with `fs.realpathSync`, reject symlink escapes, then
   write beneath the verified parent.
5. Keep the `.json` enforcement.

## Test

- `save-as` for a path the server did **not** vend via `show-save-dialog` → 403,
  nothing written; a path from a fresh dialog capability → written once, second
  use rejected.
- Unauthenticated caller → 401.
- A symlinked dir inside the base pointing outside is not followed
  (realpath check).
- Non-schema-conforming `config` → 400.

## Related

- SA-001 (makes this remotely reachable). Fixing SA-001 downgrades the *remote*
  risk; this fix contains a *local/authenticated* caller too.
