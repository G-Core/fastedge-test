# VSCode Extension Bundling

**Last Updated**: April 13, 2026
**Status**: ✅ Implemented

---

## Overview

The fastedge-test server can be bundled into the FastEdge-vscode extension, providing a zero-setup debugging experience. This document describes how the debugger prepares itself for bundling.

### What gets bundled (and what doesn't)

`pnpm run build` now produces two outputs in `dist/`:
- `dist/server.js` + `dist/frontend/` + `dist/fastedge-cli/` — **included** in the VSCode bundle (debugger artifacts)
- `dist/lib/` — **excluded** from the VSCode bundle (this is the `@gcoredev/fastedge-test` npm package; not needed by VSCode)

The coordinator bundle script (`scripts/bundle-debugger-for-vscode.sh`) and the GitHub Actions workflow (`FastEdge-vscode/.github/workflows/download-debugger.yml`) both explicitly exclude `dist/lib/`.

### Health endpoint identity

The `/health` endpoint returns `{"status":"ok","service":"fastedge-debugger"}`. The VSCode extension uses the `service` field to verify it is talking to its own bundled server before reusing an existing process on the port. Do not remove this field.

---

## Build Script: build:bundle

### Purpose

Create a single, self-contained server file that can be embedded in the VSCode extension without requiring node_modules.

### Usage

```bash
pnpm run build:bundle
```

### What It Does

1. **Compiles TypeScript**: `tsc -p server/tsconfig.json`
   - Outputs to `dist/` directory
   - Includes server, utilities, runner, etc.

2. **Bundles with esbuild**: `node esbuild-bundle-server.js`
   - Takes `dist/server.js` as input
   - Bundles ALL dependencies into single file
   - Outputs `dist/server.bundle.js` (915KB)

3. **Builds Frontend**: `cd frontend && vite build`
   - React UI for debugger
   - Outputs to `dist/frontend/`

### Result

```
dist/
├── server.js              (TypeScript compiled, with imports)
├── server.bundle.js       (esbuild bundled, all deps included!)
├── frontend/              (React UI)
│   ├── index.html
│   └── assets/
├── fastedge-host/         (utilities)
├── runner/                (utilities)
├── utils/                 (utilities)
└── websocket/             (utilities)
```

---

## Bundling Script: esbuild/bundle-server.js

**Location**: `esbuild/bundle-server.js`

### Configuration

```javascript
esbuild.build({
  entryPoints: ['dist/server.js'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: 'dist/server.bundle.js',
  external: [
    'fsevents', // Optional native dependency (Mac only)
  ],
  minify: true,
  sourcemap: false,
})
```

### Key Decisions

**1. Bundle ALL dependencies**
- Before: Externalized `wasi-shim`, requiring it to be copied separately
- After: Bundle everything except `fsevents` (Mac-only, optional)
- Result: Single file with no node_modules needed

**2. Target Node 20**
- VSCode uses Node 20+
- Modern syntax and features available
- Better performance

**3. Minify for size**
- Reduces bundle from ~2MB to 915KB
- Still readable stack traces
- Better extension load time

---

## What Gets Bundled

### Production Dependencies

All of these are included in server.bundle.js:

```
express                    → HTTP server
ws                        → WebSocket server
@assemblyscript/wasi-shim → WASM runtime support
@gcoredev/fastedge-sdk-js → FastEdge SDK
immer                     → State management
zustand                   → Store (if used server-side)
```

Plus all their sub-dependencies:
- body-parser, cookie-parser, cors, etc. (Express deps)
- All Express middleware
- All utility libraries

### Not Bundled

```
fsevents  → Mac-only file watcher (optional)
          → VSCode has its own file watching
```

---

## Integration with VSCode Extension

### Coordinator Script

The coordinator has a script that:
1. Runs `pnpm run build:bundle` in debugger
2. Copies `dist/server.bundle.js` → `FastEdge-vscode/dist/debugger/server.js`
3. Copies `dist/frontend/` → `FastEdge-vscode/dist/debugger/frontend/`
4. Copies other utilities

**Script**: `/scripts/bundle-debugger-for-vscode.sh` (at coordinator level)

### Extension Build Process

```bash
# In FastEdge-vscode
npm run package
  └─→ prebuild hook
      └─→ npm run bundle:debugger
          └─→ cd .. && ./scripts/bundle-debugger-for-vscode.sh
  └─→ npm run build (extension code)
  └─→ vsce package (create .vsix)
```

### Server Auto-Start Architecture (April 2026)

`dist/server.js` unconditionally calls `startServer()` on load. This replaced the old `require.main === module` guard which failed in the bundled CJS context when loaded via dynamic `import()`. The auto-start design works for both entry points:

- **CLI**: `bin/fastedge-debug.js` resolves the app root (walk up to `package.json`/`Cargo.toml`), sets `WORKSPACE_PATH`, then does `import("../dist/server.js")` — the server starts automatically
- **VSCode extension**: `fork(serverPath)` — the forked module starts automatically
- **Library consumers**: Use `dist/lib/` entry points (runner, test framework), which do NOT auto-start

`startServer()` probes ports 5179-5228 via HTTP `/health` check before binding (50 slots, expanded from 10 on 2026-04-22; port auto-increment moved from the VSCode extension's `DebuggerServerManager.resolvePort()` into the server). Port file written to `{WORKSPACE_PATH}/.fastedge-debug/.debug-port`. Both the CLI and VSCode extension resolve `WORKSPACE_PATH` before starting the server using the same priority: existing `.fastedge-debug/` dir > nearest `package.json`/`Cargo.toml` > cwd. Startup messages go to stderr so MCP stdio transport is not corrupted.

### Extension Runtime

```typescript
// Extension forks bundled server — auto-starts on load
const serverPath = path.join(
  extensionPath,
  'dist/debugger/server.js'
);

fork(serverPath, [], {
  execPath: process.execPath, // VSCode's Node.js
});
```

---

## Benefits of This Approach

### For Debugger Development

✅ **Independent**: Can build and test debugger standalone
✅ **Standard tools**: Uses normal npm scripts
✅ **Clear output**: Single bundle file is easy to verify
✅ **Maintainable**: Bundling logic stays in debugger repo

### For Extension Integration

✅ **Simple**: Extension just copies pre-built files
✅ **Clean**: No node_modules to package
✅ **Small**: 915KB bundle vs 2-3MB+ with node_modules
✅ **Reliable**: No vsce packaging issues

### For Users

✅ **Zero setup**: No external dependencies
✅ **Fast**: Single file loads quickly
✅ **Portable**: Works anywhere VSCode runs
✅ **Offline**: No network required

---

## Testing the Bundle

### Build and Verify

```bash
# Build bundle
pnpm run build:bundle

# Check output
ls -lh dist/server.bundle.js
# Should show ~915KB

# Verify it's self-contained
grep -q "express" dist/server.bundle.js && echo "Express bundled ✅"
grep -q "wasi-shim" dist/server.bundle.js && echo "WASI bundled ✅"
```

### Test Standalone

```bash
# Run bundled server directly
node dist/server.bundle.js

# Auto-starts on port 5179 (or next available up to 5188)
# Visit http://localhost:<port>
```

### Test in Extension

```bash
# From coordinator root
./scripts/bundle-debugger-for-vscode.sh

# From FastEdge-vscode
npm run package

# Install .vsix in VSCode
# Test debugger commands
```

---

## Troubleshooting

### Bundle Size Too Large

**Check**:
```bash
# Analyze bundle
npx esbuild dist/server.js --bundle --metafile=meta.json
npx esbuild-visualizer --metadata=meta.json
```

**Solutions**:
- Externalize large dependencies (if not needed at runtime)
- Remove unused imports
- Use tree-shaking compatible libraries

### Missing Runtime Dependencies

**Symptom**: `Cannot find module 'xxx'` when running bundled server

**Solution**: Check esbuild externals list - may need to bundle it

### Build Fails

**Check**:
```bash
# Verify TypeScript compiles first
pnpm run build:backend

# Check for esbuild errors
node esbuild-bundle-server.js
```

---

## Maintenance

### Adding New Dependencies

When adding new production dependencies:

1. Add to `package.json` dependencies (not devDependencies)
2. Run `pnpm install`
3. Test bundle:
   ```bash
   pnpm run build:bundle
   node dist/server.bundle.js
   ```
4. Verify dependency is bundled:
   ```bash
   grep -q "new-dependency" dist/server.bundle.js
   ```

### Updating esbuild

```bash
pnpm update esbuild
```

Test after update:
```bash
pnpm run build:bundle
# Verify size hasn't increased significantly
ls -lh dist/server.bundle.js
```

---

## Future Enhancements

### Potential Optimizations

1. **Code splitting**: Separate core and optional features
2. **Lazy loading**: Load heavy dependencies only when needed
3. **Platform-specific builds**: Different bundles for Mac/Win/Linux
4. **Source maps**: Add sourcemaps for debugging bundled code

### CI/CD Integration

Future: GitHub Actions will:
1. Build bundle on each release
2. Upload as release asset
3. Extension downloads pre-built bundle
4. Faster local dev, consistent binaries

---

## Related Documentation

**Debugger:**
- `package.json` - Build scripts
- `esbuild-bundle-server.js` - Bundling configuration
- `context/CHANGELOG.md` - Change history

**Coordinator:**
- `scripts/bundle-debugger-for-vscode.sh` - Copy script
- `context/VSCODE_DEBUGGER_BUNDLING.md` - Full implementation

**Extension:**
- `FastEdge-vscode/context/BUNDLED_DEBUGGER.md` - Extension perspective
- `FastEdge-vscode/src/debugger/` - Integration code

---

**Version**: 0.1.0
**Bundle Size**: 915KB (minified)
**Dependencies**: All bundled (except fsevents)
**Target**: Node 20+
