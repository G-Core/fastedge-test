# Directory Structure

## Source Directory: `fastedge-run/`

Contains the FastEdge-run CLI binaries for running WASI-HTTP applications.

**Location**: `/fastedge-run/`

**Contents**:
- `fastedge-run-linux-x64` - Linux x64 binary
- `fastedge-run-darwin-arm64` - macOS ARM64 binary
- `fastedge-run.exe` - Windows x64 binary
- `METADATA.json` - Version information

**Source**: Downloaded from https://github.com/G-Core/FastEdge-lib releases

---

## Build Output: `dist/fastedge-cli/`

During build, the `fastedge-run/` directory is **copied** to `dist/fastedge-cli/`.

**Location**: `/dist/fastedge-cli/`

**Why the rename?**
- The runtime code looks for `fastedge-cli/` (generic name)
- Multiple tools (debugger, VSCode extension) expect this name
- Easier to update binary sources without changing runtime code

---

## Build Process

### esbuild (esbuild/bundle-server.js)

```javascript
// Copy fastedge-run/ → dist/fastedge-cli/
const cliSourceDir = path.join(projectRoot, "fastedge-run");
const cliDestDir = path.join(distDir, "fastedge-cli");
fs.cpSync(cliSourceDir, cliDestDir, { recursive: true });
```

**Result**:
```
dist/
├── server.js                    # Bundled server
├── frontend/                    # React UI
└── fastedge-cli/               # CLI binaries (copied from fastedge-run/)
    ├── fastedge-run-linux-x64
    ├── fastedge-run-darwin-arm64
    ├── fastedge-run.exe
    └── METADATA.json
```

---

## Runtime Path Resolution

`findFastEdgeRunCli()` in `server/utils/fastedge-cli.ts` resolves the binary in this order (first that exists wins):

1. `FASTEDGE_RUN_PATH` environment variable (an error if set but missing)
2. Bundled binary, anchored on the `@gcoredev/fastedge-test` package root: `dist/fastedge-cli/<binary>` (published npm layout), then `fastedge-run/<binary>` (source tree)
3. Fallback relative to the server bundle: `fastedge-cli/` next to or one level above it. This covers the VSCode extension, which copies `dist/server.js` and `dist/fastedge-cli/` into its own tree without this package's `package.json`
4. `PATH` (`which` / `where fastedge-run`)

The runtime looks for `fastedge-cli/` (a generic name that the VSCode extension also expects); the source directory is `fastedge-run/`, and the build copies it across.

---

## Adding New Binaries

### Option 1: Manual (Development)

```bash
# Download binaries from FastEdge-lib releases
cd fastedge-run/
curl -L -O https://github.com/G-Core/FastEdge-lib/releases/download/<version>/...

# Make executable (Unix)
chmod +x fastedge-run-linux-x64
chmod +x fastedge-run-darwin-arm64

# Rebuild
pnpm run build
```

### Option 2: Automated (CI/CD)

The GitHub Actions workflow automatically downloads all platform binaries:

```yaml
# .github/workflows/download-cli.yml
# Downloads from FastEdge-lib
# Places in fastedge-run/ directory
# Build step copies to dist/fastedge-cli/
```

---

## Summary

| Directory | Purpose | Contents | When |
|-----------|---------|----------|------|
| `/fastedge-run/` | Source binaries | All platform binaries | Manually added or CI download |
| `/dist/fastedge-cli/` | Runtime binaries | All platform binaries | Created during build |

**Key Point**: The published package and the VSCode extension find the binary in `dist/fastedge-cli/`, so the build must copy it there.
