# VSCode Extension Bundling

## Overview

The fastedge-test server is bundled into the FastEdge-vscode extension, giving a zero-setup debugging experience. This document describes how the debugger is built for that and what the extension relies on.

### What gets bundled (and what doesn't)

`pnpm run build` produces, in `dist/`:
- `dist/server.js` + `dist/frontend/` + `dist/fastedge-cli/` + `dist/schemas/` — **included** in the VSCode bundle (debugger artifacts)
- `dist/lib/` — **excluded** from the VSCode bundle (the `@gcoredev/fastedge-test` npm package library; not needed by VSCode)

### Health endpoint identity

The `/health` endpoint returns `{"status":"ok","service":"fastedge-debugger"}`. The VSCode extension uses the `service` field to verify it is talking to its own bundled server before reusing an existing process on the port. Do not remove this field.

---

## Server Bundle: esbuild/bundle-server.js

`pnpm run build:backend` runs `esbuild/bundle-server.js`:

- Entry `server/server.ts`, compiled and bundled in one step (no separate `tsc`)
- `platform: "node"`, `target: "node20"`, `format: "cjs"`, minified, no source maps
- **All dependencies bundled** except `fsevents` (optional, Mac only), so `dist/server.js` needs no `node_modules`
- `import.meta.url` is shimmed (`__importMetaUrl` banner) so `fileURLToPath()` works in the CJS bundle
- The CDN worker and the stores service are embedded as strings by `embeddedPlugin` (`esbuild/embedded.js`), so no extra files ship
- Copies `schemas/` → `dist/schemas/` and `fastedge-run/` → `dist/fastedge-cli/` (see [DIRECTORY_STRUCTURE.md](./DIRECTORY_STRUCTURE.md))

The frontend is built separately (`pnpm run build:frontend`, Vite → `dist/frontend/`).

### Result

```
dist/
├── server.js        (bundled server, all deps included)
├── frontend/        (React UI)
├── schemas/         (JSON schemas)
├── fastedge-cli/    (fastedge-run binaries + METADATA.json)
└── lib/             (npm library; not used by VSCode)
```

---

## Release and Extension Integration

1. **Release (this repo)**: pushing a `vX.Y.Z` tag runs `.github/workflows/create-release.yml`: tests, download of the pinned `fastedge-run` version (`.fastedge-cli-version`), `pnpm run build`, then `dist/` is zipped as `fastedge-debugger.zip` with a `.sha256` checksum and attached to the GitHub release.
2. **Extension build (FastEdge-vscode)**: its `download-debugger.yml` workflow downloads the release zip, verifies the checksum, removes `dist/lib/`, keeps only the `fastedge-run` binary for each target platform, and uploads a per-platform artifact. The extension build places it at `dist/debugger/`.
3. **Extension runtime**: the extension `fork()`s `dist/debugger/server.js` with VSCode's Node.js and finds `dist/debugger/fastedge-cli/` next to it (see the startDir-relative fallback in `server/utils/fastedge-cli.ts`).

### Server Auto-Start

`dist/server.js` unconditionally calls `startServer()` on load. A `require.main === module` guard would fail in the bundled CJS when it is loaded via dynamic `import()`. The auto-start design works for both entry points:

- **CLI**: `bin/fastedge-debug.js` resolves the app root (walk up to `package.json`/`Cargo.toml`), sets `WORKSPACE_PATH`, then does `import("../dist/server.js")` — the server starts automatically
- **VSCode extension**: `fork(serverPath)` — the forked module starts automatically
- **Library consumers**: Use `dist/lib/` entry points (runner, test framework), which do NOT auto-start

`startServer()` probes ports 5179-5228 via HTTP `/health` check before binding (50 slots; port selection lives in the server, not the extension). Port file written to `{WORKSPACE_PATH}/.fastedge-debug/.debug-port`. Both the CLI and the VSCode extension resolve `WORKSPACE_PATH` before starting the server using the same priority: existing `.fastedge-debug/` dir > nearest `package.json`/`Cargo.toml` > cwd. Startup messages go to stderr so an MCP stdio transport is not corrupted.

---

## Testing the Bundle

```bash
pnpm run build

# Run the bundled server directly
node dist/server.js
# Starts on port 5179 (or the next free one up to 5228)
```

To test inside the extension, build FastEdge-vscode with the local `dist/` placed at its `dist/debugger/`, then package it (`vsce package`) and install the `.vsix`.

---

## Troubleshooting

### Missing Runtime Dependencies

**Symptom**: `Cannot find module 'xxx'` when running the bundled server

**Solution**: Check the esbuild `external` list in `esbuild/bundle-server.js` — the module may need bundling.

### Bundle Size

```bash
npx esbuild server/server.ts --bundle --platform=node --metafile=meta.json --outfile=/dev/null
```

Externalize large dependencies only if they are not needed at runtime.

---

## Maintenance

### Adding New Dependencies

1. Add to `package.json` `dependencies` (not devDependencies)
2. `pnpm install`
3. `pnpm run build:backend && node dist/server.js` — check the server starts

---

## Related Documentation

- `package.json` - Build scripts
- `esbuild/bundle-server.js` - Bundling configuration
- `.github/workflows/create-release.yml` - Release zip
- FastEdge-vscode: `src/debugger/` (integration code), `.github/workflows/download-debugger.yml`
