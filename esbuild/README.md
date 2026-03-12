# esbuild Scripts

This directory contains esbuild configuration scripts for building the fastedge-debugger.

## Scripts

### bundle-server.js

**Purpose**: Bundle the debugger server into a single file for VSCode extension embedding.

**Usage**:
```bash
# From project root
pnpm run build:bundle

# Or directly
node esbuild/bundle-server.js
```

**What it does**:
1. Takes compiled `dist/server.js`
2. Bundles all dependencies (Express, ws, wasi-shim, etc.)
3. Outputs `dist/server.bundle.js` (915KB, minified)

**Configuration**:
- Platform: Node.js
- Target: Node 20
- Bundle: All dependencies except fsevents
- Minify: Yes
- Source maps: No

**Output**:
- `dist/server.bundle.js` - Single file with all dependencies

---

## Future Scripts

This folder is ready for additional esbuild scripts:

- `bundle-frontend.js` - Frontend bundling (currently uses Vite)
- `bundle-tests.js` - Bundle test utilities
- `analyze-bundle.js` - Bundle analysis and visualization

---

## Why Separate Folder?

**Benefits**:
- ✅ Organized build scripts in one place
- ✅ Easy to find and maintain
- ✅ Can add more esbuild configs without cluttering root
- ✅ Clear separation: `esbuild/` = build, `src/` = code

---

## Related Files

**Package.json scripts**:
- `build:backend:bundle` - Compile TypeScript + run this script
- `build:bundle` - Full bundle (backend + frontend)

**Documentation**:
- `context/VSCODE_BUNDLING.md` - How bundling works
- `../FastEdge-vscode/context/BUNDLED_DEBUGGER.md` - Extension integration
