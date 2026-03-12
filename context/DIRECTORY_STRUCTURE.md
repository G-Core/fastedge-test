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

### server/utils/fastedge-cli.ts

```typescript
function getBundledCliPath(): string {
  // __dirname points to dist/ (location of server.js)
  const cliBinDir = join(__dirname, "fastedge-cli");
  // Result: dist/fastedge-cli/

  // Then select platform-specific binary
  return join(cliBinDir, "fastedge-run-linux-x64"); // Example for Linux
}
```

**Path resolution**:
- Running: `node dist/server.js`
- `__dirname` = `/absolute/path/to/dist/`
- `cliBinDir` = `/absolute/path/to/dist/fastedge-cli/`
- Binary = `/absolute/path/to/dist/fastedge-cli/fastedge-run-linux-x64`

---

## Why Not Keep as `fastedge-run/`?

**Historical reasons**:
- Original design expected directory named `fastedge-cli/`
- Multiple codebases reference this name
- Changing would require updates across multiple repos

**Current approach**:
- Source directory can be named anything
- Always copied to `dist/fastedge-cli/` during build
- Runtime always looks in `dist/fastedge-cli/`

---

## Adding New Binaries

### Option 1: Manual (Development)

```bash
# Download binaries from FastEdge-lib releases
cd fastedge-run/
curl -L -O https://github.com/G-Core/FastEdge-lib/releases/download/v2.5.0/...

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

**Key Point**: Runtime always looks for `dist/fastedge-cli/`, so the build process must copy binaries there.
