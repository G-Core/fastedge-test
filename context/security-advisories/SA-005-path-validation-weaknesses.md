# SA-005 — Path validation is a weak blocklist; some routes skip it

**Severity:** Low
**Category:** Improper limitation of a pathname (CWE-22) via blocklist instead of
allowlist (CWE-184 incomplete denylist)
**Status:** Open
**Affected files:** `server/utils/pathValidator.ts:42-131`,
`server/server.ts:640-653` (`/api/schema/:name`)

## Summary

Two defense-in-depth weaknesses in path handling. Neither is the primary hole
(that's SA-002/003), but both should be tightened as part of the same work.

### 1. `validatePath` relies on a hardcoded blocklist

`pathValidator.ts` defends with a `DANGEROUS_PATHS` denylist (`/etc`, `/proc`,
`.ssh`, `node_modules`, …) plus `startsWith`/`includes` string matching. This is
fragile:

- **Incomplete.** It misses plenty of sensitive locations: user home dotfiles
  (`~/.config`, `~/.gitconfig`, `~/.npmrc`, `~/.docker/config.json`), `/var`,
  `/tmp` secrets, `~/.aws` is listed but `~/.config/gcloud` is not, Windows user
  profiles, etc. A blocklist is the wrong shape for this.
- **Sloppy matching.** `absolutePath.startsWith("/etc")` also blocks legitimate
  paths like `/etcetera/app.wasm`, while
  `absolutePath.includes(`${sep}node_modules`)` blocks any path containing
  `node_modules` anywhere — so it is simultaneously over- and under-broad.
- The safe control — `workspaceRoot` containment — **exists but is optional and
  not passed** by `/api/load` (see SA-003).

### 2. `/api/schema/:name` builds a path from a route param

```ts
const schemaPath = path.join(__dirname, "..", "schemas", `${req.params.name}.schema.json`);
if (!existsSync(schemaPath)) { ...404... }
res.setHeader("Content-Type", "application/json");
res.sendFile(schemaPath);
```

`req.params.name` is interpolated into a filesystem path. This is likely a
**live, if constrained, traversal**: an encoded-slash value such as
`..%2f..%2fpackage` can be matched as one segment and then **decoded** into
`../../package` by the time it reaches `path.join`, escaping `schemas/`. The
appended `.schema.json` suffix plus the `existsSync`/`sendFile` limit reads to
existing `*.schema.json` files, which is why severity stays Low — but do **not**
assume it's inert; treat it as a real traversal and close it with an allowlist.
(Exact decoding depends on the Express/`path-to-regexp` version; the fix below
is correct regardless.)

## Impact

- The WASM-path check is easy to bypass conceptually (any `.wasm` outside the
  blocklist — SA-003 is the real containment fix). The schema route is a
  constrained-but-plausibly-live traversal limited to existing `*.schema.json`
  files. Low.

## Remediation

1. **Prefer allowlist containment over the blocklist.** Make `workspaceRoot`
   effectively required for network-driven path inputs: callers
   (`/api/load`, dotenv) pass `WORKSPACE_PATH`, and `validatePath` confines to it
   with `realpath` semantics. Keep `DANGEROUS_PATHS` only as an extra backstop,
   and fix the matching to be segment-aware (compare resolved path prefixes with
   a trailing `sep`, not bare `startsWith`/`includes`).
2. **Allowlist schema names.** Resolve the requested name against the known set
   of schema files (read the `schemas/` dir once at startup) and 404 anything not
   in it, instead of building a path from the raw param:
   ```ts
   const known = new Set(fs.readdirSync(schemasDir).filter(f => f.endsWith(".schema.json")));
   const file = `${req.params.name}.schema.json`;
   if (!known.has(file)) return res.status(404).json({ ok:false, error:"Schema not found" });
   res.sendFile(path.join(schemasDir, file));
   ```

## Test

- `validatePath` with a `workspaceRoot` rejects `/etcetera/app.wasm`? (should be
  allowed — proves matching is segment-aware) and rejects
  `<workspace>/../secret.wasm` (should be denied).
- `/api/schema/..%2f..%2fpackage` and any unknown name → 404; a known schema →
  200.

## Related

- SA-002 / SA-003 (the primary path-confinement gaps this hardens around).
